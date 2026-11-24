import { extractPhonesFromText } from "./phone";
import { isValidCnpj, validEmail } from "./merge";
import type { RawRecord, SiteDiagnosis } from "./types";

export const KEY_PATHS = [
  "/",
  "/contato",
  "/contatos",
  "/fale-conosco",
  "/sobre",
  "/quem-somos",
  "/empresa",
  "/servicos",
  "/produtos",
  "/equipe",
  "/politica-de-privacidade",
  "/termos",
];

export interface PageExtract {
  emails: string[];
  commercialEmails: string[];
  supportEmails: string[];
  whatsapp: string[];
  phones: string[];
  socials: NonNullable<RawRecord["socials"]>;
  cnpjs: string[];
  hasAnalytics: boolean;
  hasWhatsappLink: boolean;
  hasContactForm: boolean;
  technologies: string[];
  servicesAndSpecialties: string[];
  pageTitle?: string;
  metaDescription?: string;
}

const MARKETING_TECH_SIGNATURES: [string, RegExp][] = [
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i],
  ["Google Analytics (GA4)", /googletagmanager\.com\/gtag\/js|gtag\(['"]config['"],\s*['"]G-[A-Z0-9]+/i],
  ["Meta Pixel", /connect\.facebook\.net\/.*fbevents\.js|fbq\(['"]init['"]/i],
  ["RD Station", /d335luupugsy2\.cloudfront\.net|rdstation/i],
  ["Hotjar", /static\.hotjar\.com\/c\/hotjar-/i],
  ["Microsoft Clarity", /clarity\.ms\/tag/i],
  ["HubSpot", /js\.hs-scripts\.com/i],
  ["ActiveCampaign", /trackcmp\.net/i],
  ["WordPress", /wp-content|wp-includes/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["Wix", /static\.parastorage\.com|wix-warmup-data/i],
  ["TikTok Pixel", /analytics\.tiktok\.com\/i18n\/pixel/i],
  ["LinkedIn Insight", /snap\.licdn\.com\/li\.lms-analytics/i],
];

export function extractFromHtml(html: string): PageExtract {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");

  // 1. Título e Meta Description
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1]!.trim().replace(/\s+/g, " ") : undefined;

  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const metaDescription = descMatch ? descMatch[1]!.trim() : undefined;

  // 2. Extração e separação de E-mails
  const allEmails = new Set<string>();
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]!).toLowerCase();
    if (validEmail(e)) allEmails.add(e);
  }
  for (const m of text.replace(/<[^>]+>/g, " ").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const e = m[0].toLowerCase();
    if (validEmail(e)) allEmails.add(e);
  }

  const commercialEmails: string[] = [];
  const supportEmails: string[] = [];
  for (const e of allEmails) {
    if (/comercial|vendas|contato|orcamento|negocios|diretoria/i.test(e)) {
      commercialEmails.push(e);
    } else if (/suporte|sac|atendimento|ajuda/i.test(e)) {
      supportEmails.push(e);
    } else {
      commercialEmails.push(e);
    }
  }

  // 3. Links de WhatsApp
  const wa = new Set<string>();
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?[^"']*?phone=|whatsapp:\/\/send\?phone=)\+?(\d{10,13})/gi)) {
    wa.add(m[1]!);
  }
  const hasWhatsappLink = wa.size > 0 || /chat\.whatsapp\.com\/|wa\.me\/|api\.whatsapp\.com/i.test(html);

  // 4. Redes Sociais
  const socials: PageExtract["socials"] = {};
  const sp: [keyof PageExtract["socials"], RegExp][] = [
    ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel|explore|accounts)[A-Za-z0-9._]+/i],
    ["facebook", /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|plugins|tr\?|dialog)[A-Za-z0-9._\-/]+/i],
    ["linkedin", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9._\-%]+/i],
    ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[A-Za-z0-9._\-]+/i],
    ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+/i],
  ];
  for (const [k, re] of sp) {
    const m = html.match(re);
    if (m) socials[k] = m[0];
  }

  // 5. CNPJs válidos no texto
  const cnpjs = new Set<string>();
  for (const m of text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) {
    if (isValidCnpj(m[0])) cnpjs.add(m[0].replace(/\D/g, ""));
  }

  // 6. Formulário de contato
  const hasContactForm = /<form[\s\S]*?<\/form>/i.test(html) && /submit|button|mensagem|contato|enviar|nome|email|telefone/i.test(html);

  // 7. Tecnologias de marketing e ferramentas de análise
  const technologies: string[] = [];
  for (const [techName, regex] of MARKETING_TECH_SIGNATURES) {
    if (regex.test(html)) technologies.push(techName);
  }
  const hasAnalytics = technologies.some((t) => /Google|Meta|Hotjar|Clarity|Analytics|Pixel|Tag/i.test(t));

  // 8. Serviços e Especialidades (títulos e destaques)
  const servicesAndSpecialties: string[] = [];
  const headingMatches = html.matchAll(/<(?:h2|h3)[^>]*>([^<]{4,60})<\/(?:h2|h3)>/gi);
  for (const hm of headingMatches) {
    const item = hm[1]!.trim().replace(/\s+/g, " ");
    if (!/menu|navega|contato|sobre|todos os direitos|politica|termos/i.test(item)) {
      servicesAndSpecialties.push(item);
      if (servicesAndSpecialties.length >= 8) break;
    }
  }

  return {
    emails: [...allEmails],
    commercialEmails,
    supportEmails,
    whatsapp: [...wa],
    phones: extractPhonesFromText(text.replace(/<[^>]+>/g, " ")),
    socials,
    cnpjs: [...cnpjs],
    hasAnalytics,
    hasWhatsappLink,
    hasContactForm,
    technologies,
    servicesAndSpecialties,
    pageTitle,
    metaDescription,
  };
}

/** SSRF guard: bloqueia hosts internos/privados. */
export function isSafePublicUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || (!h.includes(".") && !h.includes(":"))) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
  if (h.includes(":") || h.startsWith("[")) return null;
  if (u.port && !["80", "443"].includes(u.port)) return null;
  return u;
}

async function fetchText(url: string, ms = 7000): Promise<{ status: number; html: string; finalUrl: string; responseTimeMs: number } | null> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  const start = Date.now();
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlliarBot/1.0; +https://alliar.com.br)", Accept: "text/html,application/xhtml+xml" },
    });
    const responseTimeMs = Date.now() - start;
    const safe = isSafePublicUrl(r.url);
    if (!safe) return null;
    const html = (await r.text()).slice(0, 500_000);
    return { status: r.status, html, finalUrl: r.url, responseTimeMs };
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/** Visita home e páginas-chave e devolve um RawRecord parcial com diagnóstico profundo. */
export async function crawlSite(
  website: string,
  maxPages = 4
): Promise<{ record: Partial<RawRecord>; diagnosis: SiteDiagnosis }> {
  const base = isSafePublicUrl(website);
  if (!base) return { record: {}, diagnosis: { hasSite: false, error: "url_invalida" } };

  const home = await fetchText(base.origin + "/");
  const triedHttp = !home && base.protocol === "https:" ? await fetchText(`http://${base.host}/`) : null;
  const first = home ?? triedHttp;

  if (!first || first.status >= 500 || (first.status === 404 && !first.html)) {
    return {
      record: {},
      diagnosis: {
        hasSite: true,
        reachable: false,
        https: base.protocol === "https:",
        status: first?.status,
        responseTimeMs: first?.responseTimeMs,
        error: "site_inacessivel",
      },
    };
  }

  const finalUrl = new URL(first.finalUrl);
  const acc: PageExtract = {
    emails: [],
    commercialEmails: [],
    supportEmails: [],
    whatsapp: [],
    phones: [],
    socials: {},
    cnpjs: [],
    hasAnalytics: false,
    hasWhatsappLink: false,
    hasContactForm: false,
    technologies: [],
    servicesAndSpecialties: [],
    pageTitle: undefined,
    metaDescription: undefined,
  };

  const merge = (p: PageExtract) => {
    acc.emails.push(...p.emails);
    acc.commercialEmails.push(...p.commercialEmails);
    acc.supportEmails.push(...p.supportEmails);
    acc.whatsapp.push(...p.whatsapp);
    acc.phones.push(...p.phones);
    acc.cnpjs.push(...p.cnpjs);
    Object.assign(acc.socials, { ...p.socials, ...acc.socials });
    acc.hasAnalytics ||= p.hasAnalytics;
    acc.hasWhatsappLink ||= p.hasWhatsappLink;
    acc.hasContactForm ||= p.hasContactForm;
    for (const tech of p.technologies) {
      if (!acc.technologies.includes(tech)) acc.technologies.push(tech);
    }
    for (const s of p.servicesAndSpecialties) {
      if (!acc.servicesAndSpecialties.includes(s)) acc.servicesAndSpecialties.push(s);
    }
    if (!acc.pageTitle && p.pageTitle) acc.pageTitle = p.pageTitle;
    if (!acc.metaDescription && p.metaDescription) acc.metaDescription = p.metaDescription;
  };

  merge(extractFromHtml(first.html));

  for (const path of KEY_PATHS.slice(1, maxPages + 2)) {
    const pg = await fetchText(finalUrl.origin + path, 5000);
    if (pg && pg.status < 400) merge(extractFromHtml(pg.html));
  }

  const uniq = (a: string[]) => [...new Set(a)];

  const diagnosis: SiteDiagnosis = {
    hasSite: true,
    reachable: true,
    https: finalUrl.protocol === "https:",
    redirectedTo: finalUrl.host !== base.host ? finalUrl.host : undefined,
    hasAnalytics: acc.hasAnalytics,
    hasWhatsappLink: acc.hasWhatsappLink,
    hasContactForm: acc.hasContactForm,
    technologies: acc.technologies,
    servicesAndSpecialties: acc.servicesAndSpecialties.slice(0, 10),
    pageTitle: acc.pageTitle,
    metaDescription: acc.metaDescription,
    responseTimeMs: first.responseTimeMs,
    status: first.status,
  };

  return {
    record: {
      source: "site",
      website: finalUrl.origin,
      emails: uniq(acc.emails),
      whatsapp: uniq(acc.whatsapp),
      phones: uniq(acc.phones),
      socials: acc.socials,
      cnpj: acc.cnpjs[0],
    },
    diagnosis,
  };
}
