import { haversineMeters } from "./quadtree";
import { mergePhones } from "./phone";
import { buildTriggers, scoreLead } from "./triggers";
import type { CompanyType, MasterLead, RawRecord, RelationType, SizeCategory, SourceName } from "./types";

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

/**
 * Dois registros são da MESMA UNIDADE FÍSICA?
 * REGRAS CRÍTICAS:
 * 1. NUNCA considere duas unidades como iguais apenas por compartilharem o mesmo domínio/site ou nome empresarial.
 * 2. Matriz e filiais são unidades distintas e NUNCA devem ser fundidas se forem endereços/coords diferentes.
 * 3. Consolide apenas registros da mesma unidade física:
 *    - Mesmo CNPJ completo (14 dígitos)
 *    - Mesmo identificador exato na mesma fonte (sourceId + source)
 *    - Proximidade física estrita (distância <= 60m ou endereço/número comum + nome compatível).
 */
export function sameEntity(a: RawRecord, b: RawRecord): boolean {
  const ca = onlyDigits(a.cnpj), cb = onlyDigits(b.cnpj);
  // Se ambos têm CNPJ completo de 14 dígitos: mesma unidade SE E SOMENTE SE CNPJ for idêntico
  if (ca.length === 14 && cb.length === 14) return ca === cb;

  // Mesmo identificador na mesma fonte
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId && a.source === b.source) return true;

  const sim = nameSimilarity(a.name, b.name);

  // Verificação por coordenadas geográficas
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const d = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    // Mesma unidade física imediata: raio <= 60m e nome compatível
    if (d <= 60 && sim >= 0.5) return true;
    // Até 120m: alta similaridade e mesmo número predial (se ambos informarem)
    if (d <= 120 && sim >= 0.75) {
      if (a.number && b.number && a.number !== b.number) return false;
      return true;
    }
    // Se a distância for superior a 150m, NUNCA fundir, mesmo com nomes ou telefones parecidos
    if (d > 150) return false;
  }

  // Verificação por endereço e número predial
  if (a.street && b.street && a.number && b.number) {
    if (a.number === b.number && nameSimilarity(a.street, b.street) >= 0.8 && sim >= 0.5) return true;
    if (a.number !== b.number) return false;
  }

  // Verificação por CEP e número predial
  if (a.cep && b.cep && onlyDigits(a.cep) === onlyDigits(b.cep) && onlyDigits(a.cep).length === 8) {
    if (a.number && b.number) {
      if (a.number === b.number && sim >= 0.5) return true;
      if (a.number !== b.number) return false;
    }
    if (sim >= 0.8) return true;
  }

  // Deduplicação por telefone comum: APENAS se não houver conflito de endereço/coords e não for 0800
  const aPhones = (a.phones ?? []).map(onlyDigits).filter((p) => p.length >= 8);
  const bPhones = (b.phones ?? []).map(onlyDigits).filter((p) => p.length >= 8);
  if (aPhones.length && bPhones.length) {
    const commonPhone = aPhones.some((p) =>
      !p.startsWith("0800") && !p.startsWith("3003") && !p.startsWith("4004") &&
      bPhones.some((bp) => p.endsWith(bp.slice(-8)) || bp.endsWith(p.slice(-8)))
    );
    if (commonPhone && sim >= 0.6) {
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        const d = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
        if (d <= 150) return true;
        return false;
      }
      return true;
    }
  }

  return false;
}

const PRIORITY: Record<SourceName, number> = { receita: 5, google_maps: 4, site: 3, osm: 2, nominatim: 1, manual: 0 };

const NOISE_EMAIL = /(noreply|no-reply|donotreply|exemplo\.com|example\.com|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|\.svg)/i;
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && !NOISE_EMAIL.test(e);

/** Extrai a marca/rede e a identificação da unidade do nome bruto. */
export function extractBrandAndUnit(
  rawName: string,
  neighborhood?: string,
  street?: string
): { brandName: string; unitName?: string; displayName: string } {
  const clean = (rawName || "").trim();
  const sepMatch = clean.match(/^(.+?)\s*(?:[—–|-]|\s\/\s|\s:\s|\s\|\s)\s*(?:(?:filial|loja|unidade|posto)\s*(\d+|[a-z0-9\s]+)|(.+))$/i);
  let brand = clean;
  let unit: string | undefined;

  if (sepMatch && sepMatch[1] && sepMatch[1].trim().length >= 2) {
    brand = sepMatch[1].trim();
    unit = (sepMatch[2] ? `Unidade ${sepMatch[2].trim()}` : sepMatch[3]?.trim()) || undefined;
  } else {
    const parenMatch = clean.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (parenMatch && parenMatch[1] && parenMatch[1].trim().length >= 2) {
      brand = parenMatch[1].trim();
      unit = parenMatch[2].trim();
    }
  }

  // Se não temos unidade no nome, enriquecer com bairro ou rua
  if (!unit && neighborhood) {
    unit = `Unidade ${neighborhood.trim()}`;
  } else if (!unit && street) {
    unit = `Unidade ${street.trim()}`;
  }

  const displayName = unit && !brand.toLowerCase().includes(unit.toLowerCase())
    ? `${brand} — ${unit}`
    : brand;

  return { brandName: brand, unitName: unit, displayName };
}

const GENERIC_NICHE_WORDS = new Set([
  "farmacia", "drogaria", "oficina", "mecanica", "restaurante", "lanchonete", "bar",
  "mercado", "supermercado", "minimercado", "padaria", "confeitaria", "pet shop",
  "veterinaria", "clinica", "consultorio", "dentista", "odontologia", "estetica",
  "salao", "salao de beleza", "barbearia", "academia", "studio", "otica", "pizzaria",
  "laboratorio", "escola", "hotel", "pousada", "posto", "posto de combustivel",
  "loja", "comercio", "servicos"
]);

export function isGenericBrandWord(s?: string): boolean {
  if (!s) return true;
  const n = normName(s);
  if (!n || n.length < 3) return true;
  return GENERIC_NICHE_WORDS.has(n);
}

/**
 * Identifica grupos empresariais, redes, matrizes, filiais e estabelecimentos independentes.
 */
export function identifyEnterpriseNetworks(leads: MasterLead[]): MasterLead[] {
  // 1. Extrair estrutura de CNPJ (raiz, filial, digito)
  for (const l of leads) {
    if (l.cnpj && isValidCnpj(l.cnpj)) {
      const d = onlyDigits(l.cnpj);
      l.cnpjRoot = d.slice(0, 8);
      l.cnpjBranch = d.slice(8, 12);
      l.cnpjDigit = d.slice(12, 14);
      if (l.cnpjBranch === "0001") {
        l.companyType = "matriz";
        l.relationType = "matriz";
      } else {
        l.companyType = "filial";
        l.relationType = "filial";
      }
    }
  }

  // 2. Agrupar por cluster de rede/marca
  const clusters = new Map<string, MasterLead[]>();
  for (const l of leads) {
    let clusterKey: string | null = null;
    if (l.cnpjRoot) {
      clusterKey = `cnpj_root:${l.cnpjRoot}`;
    } else {
      const dom = normDomain(l.website);
      if (dom && !/(facebook|instagram|linktr\.ee|wa\.me|wix|wixsite|wordpress|google|github)/.test(dom)) {
        clusterKey = `domain:${dom}`;
      } else {
        const brandKey = normName(l.brandName || l.name);
        if (!isGenericBrandWord(brandKey)) {
          clusterKey = `brand:${brandKey}`;
        }
      }
    }

    if (clusterKey) {
      const list = clusters.get(clusterKey) ?? [];
      list.push(l);
      clusters.set(clusterKey, list);
    }
  }

  // 3. Atribuir atributos de Rede, Contagem de Unidades, Matriz/Filial e Porte
  for (const l of leads) {
    let clusterKey: string | null = null;
    if (l.cnpjRoot) {
      clusterKey = `cnpj_root:${l.cnpjRoot}`;
    } else {
      const dom = normDomain(l.website);
      if (dom && !/(facebook|instagram|linktr\.ee|wa\.me|wix|wixsite|wordpress|google|github)/.test(dom)) {
        clusterKey = `domain:${dom}`;
      } else {
        const brandKey = normName(l.brandName || l.name);
        if (!isGenericBrandWord(brandKey)) {
          clusterKey = `brand:${brandKey}`;
        }
      }
    }

    const clusterMembers = clusterKey ? clusters.get(clusterKey) || [] : [l];
    const unitCount = clusterMembers.length;

    if (unitCount >= 2) {
      l.isNetwork = true;
      const canonicalName = clusterMembers.map((m) => m.brandName || m.name).sort((a, b) => a.length - b.length)[0];
      l.networkName = canonicalName || l.brandName || l.name;
      l.networkUnitsCount = unitCount;

      if (!l.companyType || l.companyType === "desconhecido") {
        const hasMatriz = clusterMembers.some((m) => m.cnpjBranch === "0001");
        if (hasMatriz) {
          l.companyType = l.cnpjBranch === "0001" ? "matriz" : "filial";
          l.relationType = l.companyType;
        } else {
          l.companyType = "filial";
          l.relationType = "filial";
        }
      }
    } else {
      l.networkUnitsCount = 1;
      if (l.cnpjBranch && l.cnpjBranch !== "0001") {
        l.isNetwork = true;
        l.networkName = l.brandName || l.name;
        l.companyType = "filial";
        l.relationType = "filial";
      } else if (l.cnpjBranch === "0001") {
        l.isNetwork = false;
        l.companyType = "matriz";
        l.relationType = "matriz";
      } else {
        l.isNetwork = false;
        l.companyType = "independente";
        l.relationType = "independente";
      }
    }

    // Porte empresarial (grande vs PME)
    const porte = l.fiscal?.porte?.toUpperCase();
    if (porte === "MEI" || porte === "ME" || porte === "EPP") {
      l.sizeCategory = "pme";
    } else if (porte === "DEMAIS") {
      l.sizeCategory = "grande";
    } else if (l.networkUnitsCount && l.networkUnitsCount >= 4) {
      l.sizeCategory = "grande";
    } else if (l.fiscal?.capitalSocial && l.fiscal.capitalSocial >= 5_000_000) {
      l.sizeCategory = "grande";
    } else if (l.isNetwork && l.companyType === "filial") {
      l.sizeCategory = "grande";
    } else {
      l.sizeCategory = "pme";
    }

    if (l.unitName && l.brandName && !l.brandName.toLowerCase().includes(l.unitName.toLowerCase())) {
      l.displayName = `${l.brandName} — ${l.unitName}`;
    } else {
      l.displayName = l.brandName || l.name;
    }
  }

  return leads;
}

/**
 * Diversificação de Resultados (Fair Ranking / Round-Robin):
 * Evita que uma única marca (ex: Panvel) monopolize os primeiros resultados,
 * intercalando marcas, estabelecimentos independentes, matrizes e filiais,
 * mantendo 100% de todas as unidades encontradas na lista completa.
 */
export function diversifyLeads(leads: MasterLead[]): MasterLead[] {
  if (leads.length <= 2) return leads;

  const groups = new Map<string, MasterLead[]>();
  for (const l of leads) {
    const key = l.isNetwork && l.networkName
      ? `net:${normName(l.networkName)}`
      : `ind:${l.key}`;
    const list = groups.get(key) ?? [];
    list.push(l);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => b.score - a.score || (b.reviewsCount || 0) - (a.reviewsCount || 0));
  }

  const netGroups: MasterLead[][] = [];
  const indepGroups: MasterLead[][] = [];

  for (const list of groups.values()) {
    if (list.length > 1 || list[0]?.isNetwork) {
      netGroups.push(list);
    } else {
      indepGroups.push(list);
    }
  }

  netGroups.sort((a, b) => b[0]!.score - a[0]!.score);
  indepGroups.sort((a, b) => b[0]!.score - a[0]!.score);

  const result: MasterLead[] = [];
  let remainingCount = leads.length;

  while (remainingCount > 0) {
    let progressed = false;

    // Até 2 estabelecimentos independentes por rodada
    for (let i = 0; i < 2; i++) {
      const indGroup = indepGroups.find((g) => g.length > 0);
      if (indGroup) {
        result.push(indGroup.shift()!);
        remainingCount--;
        progressed = true;
      }
    }

    // 1 de cada rede por rodada
    for (const ng of netGroups) {
      if (ng.length > 0) {
        result.push(ng.shift()!);
        remainingCount--;
        progressed = true;
      }
    }

    if (!progressed) {
      for (const g of [...indepGroups, ...netGroups]) {
        while (g.length > 0) {
          result.push(g.shift()!);
          remainingCount--;
        }
      }
      break;
    }
  }

  return result;
}

/** Agrupa registros brutos e funde cada grupo em um Lead Mestre com identificação de redes e diversidade. */
export function mergeRecords(records: RawRecord[]): MasterLead[] {
  const groups: RawRecord[][] = [];
  for (const r of records) {
    const g = groups.find((grp) => grp.some((x) => sameEntity(x, r)));
    if (g) g.push(r); else groups.push([r]);
  }
  const preliminary = groups.map(fuse);
  const identified = identifyEnterpriseNetworks(preliminary);
  return diversifyLeads(identified);
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
  const neighborhood = pick("neighborhood");
  const street = pick("street");
  const number = pick("number");
  const city = pick("city");
  const state = pick("state");
  const cep = pick("cep");
  const lat = pick("lat");
  const lng = pick("lng");

  const brandInfo = extractBrandAndUnit(name, neighborhood, street);

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

  // Chave única por UNIDADE FÍSICA
  const placeId = mapsRec?.sourceId;
  const osmId = group.find((r) => r.source === "osm" && r.sourceId)?.sourceId;
  const coordsKey = (lat != null && lng != null) ? `${lat.toFixed(5)},${lng.toFixed(5)}` : "";
  const key = cnpjCand
    ? `cnpj:${onlyDigits(cnpjCand)}`
    : (placeId ? `gplaces:${placeId}` : null)
      ?? (osmId ? `osm:${osmId}` : null)
      ?? `${normName(name)}|${normName(street || "")}|${number || ""}|${normName(neighborhood || "")}|${coordsKey}`;

  const lead: MasterLead = {
    key,
    name,
    brandName: brandInfo.brandName,
    unitName: brandInfo.unitName,
    displayName: brandInfo.displayName,
    category: pick("category"),
    categories,
    address: pick("address"),
    city,
    state,
    cep,
    neighborhood,
    lat,
    lng,
    phones,
    emails: [...emailMap].map(([value, s]) => ({ value, sources: [...s] })),
    website,
    socials,
    cnpj: cnpjCand,
    fiscal,
    siteDiagnosis,
    rating: mapsRec?.rating ?? pick("rating"),
    reviewsCount: mapsRec?.reviewsCount ?? pick("reviewsCount"),
    claimed: mapsRec?.claimed,
    photosCount: mapsRec?.photosCount,
    openingHours: pick("openingHours"),
    reviews: group.flatMap((r) => r.reviews ?? []).slice(0, 30),
    sources: Array.from(new Set(group.map((r) => r.source))),
    fieldSources: fs,
    triggers: [],
    score: 0,
  };
  lead.triggers = buildTriggers(lead);
  lead.score = scoreLead(lead);
  return lead;
}
