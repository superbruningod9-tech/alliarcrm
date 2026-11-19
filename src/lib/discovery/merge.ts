import { haversineMeters } from "./quadtree";
import { mergePhones } from "./phone";
import { buildTriggers, scoreLead } from "./triggers";
import type { MasterLead, RawRecord, SourceName } from "./types";

export const normName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|mei|e cia|comercio|servicos|de|da|do|dos|das|e)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export const normDomain = (u?: string): string | undefined => {
  if (!u) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return url.hostname.replace(/^www\./, "").toLowerCase() || undefined;
  } catch { return undefined; }
};

export const onlyDigits = (s?: string) => (s ?? "").replace(/\D/g, "");
export const isValidCnpj = (v?: string) => {
  const c = onlyDigits(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += Number(c[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
};

/** Similaridade de Dice sobre bigramas (0..1). */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = grams(x), B = grams(y);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (Math.max(x.length - 1, 0) + Math.max(y.length - 1, 0) || 1);
}

/** Dois registros são da mesma empresa? CNPJ > domínio > coordenadas próximas + nome parecido. */
export function sameEntity(a: RawRecord, b: RawRecord): boolean {
  const ca = onlyDigits(a.cnpj), cb = onlyDigits(b.cnpj);
  if (ca.length === 14 && cb.length === 14) return ca === cb;
  const da = normDomain(a.website), db = normDomain(b.website);
  if (da && db && da === db && !/(facebook|instagram|linktr\.ee|wa\.me)/.test(da)) return true;
  if (a.sourceId && a.sourceId === b.sourceId && a.source === b.source) return true;
  const sim = nameSimilarity(a.name, b.name);
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const d = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    if (d <= 80 && sim >= 0.6) return true;
    if (d <= 300 && sim >= 0.85) return true;
  }
  if (a.cep && b.cep && onlyDigits(a.cep) === onlyDigits(b.cep) && sim >= 0.8) return true;
  return false;
}

const PRIORITY: Record<SourceName, number> = { receita: 5, google_maps: 4, site: 3, osm: 2, nominatim: 1, manual: 0 };

const NOISE_EMAIL = /(noreply|no-reply|donotreply|exemplo\.com|example\.com|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|\.svg)/i;
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && !NOISE_EMAIL.test(e);

/** Agrupa registros brutos e funde cada grupo em um Lead Mestre com origem por campo. */
export function mergeRecords(records: RawRecord[]): MasterLead[] {
  const groups: RawRecord[][] = [];
  for (const r of records) {
    const g = groups.find((grp) => grp.some((x) => sameEntity(x, r)));
    if (g) g.push(r); else groups.push([r]);
  }
  return groups.map(fuse);
}

function fuse(group: RawRecord[]): MasterLead {
  const sorted = [...group].sort((a, b) => PRIORITY[b.source] - PRIORITY[a.source]);
  const fs: Record<string, SourceName[]> = {};
  const note = (f: string, s: SourceName) => { (fs[f] ??= []); if (!fs[f]!.includes(s)) fs[f]!.push(s); };

  const pick = <K extends keyof RawRecord>(field: K, order = sorted): RawRecord[K] | undefined => {
    let val: RawRecord[K] | undefined;
    for (const r of order) {
      const v = r[field];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (val === undefined) val = v;
      if (JSON.stringify(v).toLowerCase() === JSON.stringify(val).toLowerCase()) note(field as string, r.source);
    }
    return val;
  };

  const mapsFirst = [...group].sort((a, b) => (b.source === "google_maps" ? 1 : 0) - (a.source === "google_maps" ? 1 : 0) || PRIORITY[b.source] - PRIORITY[a.source]);
  const name = pick("name", mapsFirst) ?? group[0]!.name;
  const fiscal = group.find((r) => r.fiscal)?.fiscal;
  const cnpjCand = group.map((r) => r.cnpj ?? r.fiscal?.cnpj).find((c) => isValidCnpj(c));
  group.forEach((r) => { if (r.cnpj && isValidCnpj(r.cnpj)) note("cnpj", r.source); });

  const phones = mergePhones(group.flatMap((r) => [...(r.phones ?? []), ...(r.whatsapp ?? []), ...(r.fiscal?.telefones ?? [])].map((raw) => ({ raw, source: r.source }))));
  phones.forEach((p) => p.sources.forEach((s) => note("phone", s)));

  const emailMap = new Map<string, Set<SourceName>>();
  for (const r of group) for (const e of [...(r.emails ?? []), ...(r.fiscal?.email ? [r.fiscal.email] : [])]) {
    const k = e.trim().toLowerCase();
    if (!validEmail(k)) continue;
    (emailMap.get(k) ?? emailMap.set(k, new Set()).get(k)!).add(r.source);
    note("email", r.source);
  }

  const socials: Record<string, string> = {};
  for (const r of sorted) for (const [k, v] of Object.entries(r.socials ?? {})) if (v && !socials[k]) { socials[k] = v; note(`social_${k}`, r.source); }

  const website = pick("website");
  const siteDiagnosis = group.find((r) => r.siteDiagnosis)?.siteDiagnosis ?? { hasSite: !!website };
  const mapsRec = group.find((r) => r.source === "google_maps");
  const categories = Array.from(new Set(group.flatMap((r) => [r.category, ...(r.categories ?? [])]).filter(Boolean) as string[]));

  const lead: MasterLead = {
    key: cnpjCand ?? normDomain(website) ?? `${normName(name)}|${pick("cep") ?? ""}`,
    name, category: pick("category"), categories,
    address: pick("address"), city: pick("city"), state: pick("state"), cep: pick("cep"), neighborhood: pick("neighborhood"),
    lat: pick("lat"), lng: pick("lng"),
    phones,
    emails: [...emailMap].map(([value, s]) => ({ value, sources: [...s] })),
    website, socials, cnpj: cnpjCand, fiscal, siteDiagnosis,
    rating: mapsRec?.rating ?? pick("rating"), reviewsCount: mapsRec?.reviewsCount ?? pick("reviewsCount"),
    claimed: mapsRec?.claimed, photosCount: mapsRec?.photosCount,
    openingHours: pick("openingHours"),
    reviews: group.flatMap((r) => r.reviews ?? []).slice(0, 30),
    sources: Array.from(new Set(group.map((r) => r.source))),
    fieldSources: fs, triggers: [], score: 0,
  };
  lead.triggers = buildTriggers(lead);
  lead.score = scoreLead(lead);
  return lead;
}
