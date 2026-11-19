import { extractPhonesFromText } from "./phone";
import { isValidCnpj, validEmail } from "./merge";
import type { RawRecord, SiteDiagnosis } from "./types";

export const KEY_PATHS = ["/", "/contato", "/contatos", "/sobre", "/quem-somos", "/equipe", "/fale-conosco", "/politica-de-privacidade", "/termos"];

export interface PageExtract {
  emails: string[]; whatsapp: string[]; phones: string[];
  socials: NonNullable<RawRecord["socials"]>; cnpjs: string[];
  hasAnalytics: boolean; hasWhatsappLink: boolean;
}

export function extractFromHtml(html: string): PageExtract {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const emails = new Set<string>();
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) { const e = decodeURIComponent(m[1]!).toLowerCase(); if (validEmail(e)) emails.add(e); }
  for (const m of text.replace(/<[^>]+>/g, " ").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) { const e = m[0].toLowerCase(); if (validEmail(e)) emails.add(e); }

  const wa = new Set<string>();
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?[^"']*?phone=|whatsapp:\/\/send\?phone=)\+?(\d{10,13})/gi)) wa.add(m[1]!);
  const hasWhatsappLink = wa.size > 0 || /chat\.whatsapp\.com\/|wa\.me\/|api\.whatsapp\.com/i.test(html);

  const socials: PageExtract["socials"] = {};
  const sp: [keyof PageExtract["socials"], RegExp][] = [
    ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel|explore|accounts)[A-Za-z0-9._]+/i],
    ["facebook", /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|plugins|tr\?|dialog)[A-Za-z0-9._\-/]+/i],
    ["linkedin", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9._\-%]+/i],
    ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[A-Za-z0-9._\-]+/i],
    ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+/i],
  ];
  for (const [k, re] of sp) { const m = html.match(re); if (m) socials[k] = m[0]; }

  const cnpjs = new Set<string>();
  for (const m of text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) if (isValidCnpj(m[0])) cnpjs.add(m[0].replace(/\D/g, ""));

  const hasAnalytics = /googletagmanager\.com|google-analytics\.com|gtag\(|fbq\(|connect\.facebook\.net|analytics\.js|hotjar|clarity\.ms|pixel/i.test(html);
  return { emails: [...emails], whatsapp: [...wa], phones: extractPhonesFromText(text.replace(/<[^>]+>/g, " ")), socials, cnpjs: [...cnpjs], hasAnalytics, hasWhatsappLink };
}

/** SSRF guard: bloqueia hosts internos/privados. */
export function isSafePublicUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
  if (h.includes(":") || h.startsWith("[")) return null;
  if (u.port && !["80", "443"].includes(u.port)) return null;
  return u;
}

async function fetchText(url: string, ms = 8000): Promise<{ status: number; html: string; finalUrl: string } | null> {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; AlliarBot/1.0)", Accept: "text/html" } });
    const safe = isSafePublicUrl(r.url);
    if (!safe) return null;
    const html = (await r.text()).slice(0, 500_000);
    return { status: r.status, html, finalUrl: r.url };
  } catch { return null; } finally { clearTimeout(to); }
}

/** Visita home e páginas-chave e devolve um RawRecord parcial (source=site). */
export async function crawlSite(website: string, maxPages = 5): Promise<{ record: Partial<RawRecord>; diagnosis: SiteDiagnosis }> {
  const base = isSafePublicUrl(website);
  if (!base) return { record: {}, diagnosis: { hasSite: false, error: "url_invalida" } };
  const home = await fetchText(base.origin + "/");
  const triedHttp = !home && base.protocol === "https:" ? await fetchText(`http://${base.host}/`) : null;
  const first = home ?? triedHttp;
  if (!first || first.status >= 500 || first.status === 404 && !first.html) {
    return { record: {}, diagnosis: { hasSite: true, reachable: false, https: base.protocol === "https:", status: first?.status } };
  }
  const finalUrl = new URL(first.finalUrl);
  const acc: PageExtract = { emails: [], whatsapp: [], phones: [], socials: {}, cnpjs: [], hasAnalytics: false, hasWhatsappLink: false };
  const merge = (p: PageExtract) => {
    acc.emails.push(...p.emails); acc.whatsapp.push(...p.whatsapp); acc.phones.push(...p.phones); acc.cnpjs.push(...p.cnpjs);
    Object.assign(acc.socials, { ...p.socials, ...acc.socials });
    acc.hasAnalytics ||= p.hasAnalytics; acc.hasWhatsappLink ||= p.hasWhatsappLink;
  };
  merge(extractFromHtml(first.html));
  for (const path of KEY_PATHS.slice(1, maxPages + 3)) {
    const pg = await fetchText(finalUrl.origin + path, 6000);
    if (pg && pg.status < 400) merge(extractFromHtml(pg.html));
  }
  const uniq = (a: string[]) => [...new Set(a)];
  return {
    record: { source: "site", website: finalUrl.origin, emails: uniq(acc.emails), whatsapp: uniq(acc.whatsapp), phones: uniq(acc.phones), socials: acc.socials, cnpj: acc.cnpjs[0] },
    diagnosis: { hasSite: true, reachable: true, https: finalUrl.protocol === "https:", redirectedTo: finalUrl.host !== base.host ? finalUrl.host : undefined, hasAnalytics: acc.hasAnalytics, hasWhatsappLink: acc.hasWhatsappLink, status: first.status },
  };
}
