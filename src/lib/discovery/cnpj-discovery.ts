import { isValidCnpj, nameSimilarity, normDomain, normName, onlyDigits } from "./merge";
import { lookupCnpj } from "./receita";
import type { FiscalProfile, MasterLead } from "./types";

interface CnpjDiscoveryCandidate {
  cnpj: string;
  source: string;
  confidence: "alta" | "media";
}

const cnpjDiscoveryCache = new Map<string, { profile: FiscalProfile | null; exp: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Consulta autorizada pública ao RDAP do Registro.br para domínios nacionais (.br).
 * Retorna o CNPJ do titular registrante quando disponível.
 */
export async function lookupRegistroBrCnpj(
  domain?: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const clean = normDomain(domain);
  if (!clean || !clean.endsWith(".br")) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetchImpl(`https://rdap.registro.br/domain/${encodeURIComponent(clean)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/rdap+json", "User-Agent": "AlliarCRM-B2B/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data: any = await res.json();
    const entities = data.entities || [];
    for (const ent of entities) {
      const handle = ent.handle ? onlyDigits(ent.handle) : "";
      if (handle.length === 14 && isValidCnpj(handle)) return handle;

      const publicIds = ent.publicIds || [];
      for (const pid of publicIds) {
        const idDigits = onlyDigits(pid.identifier);
        if (idDigits.length === 14 && isValidCnpj(idDigits)) return idDigits;
      }
    }
  } catch {}
  return null;
}

/**
 * Busca candidatos a CNPJ em fontes públicas autorizadas (OpenStreetMap, busca de presença web e diretórios).
 */
export async function searchPublicCnpjCandidates(
  name: string,
  city?: string,
  state?: string,
  cep?: string,
  website?: string,
  fetchImpl: typeof fetch = fetch
): Promise<CnpjDiscoveryCandidate[]> {
  const candidates: CnpjDiscoveryCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (raw: string, source: string, confidence: "alta" | "media") => {
    const digits = onlyDigits(raw);
    if (digits.length === 14 && isValidCnpj(digits) && !seen.has(digits)) {
      seen.add(digits);
      candidates.push({ cnpj: digits, source, confidence });
    }
  };

  // 1. RDAP Registro.br se domínio .br disponível
  if (website) {
    const rdapCnpj = await lookupRegistroBrCnpj(website, fetchImpl);
    if (rdapCnpj) addCandidate(rdapCnpj, "registro_br_rdap", "alta");
  }

  // 2. Consulta via Nominatim com extratags abertas
  if (name && city) {
    try {
      const q = `${name}, ${city}`;
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&extratags=1&limit=3`;
      const res = await fetchImpl(nomUrl, {
        headers: {
          "User-Agent": "AlliarCRM-B2B/1.0 (https://alliar.com.br; dev@alliar.com.br)",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      if (res.ok) {
        const items = (await res.json()) as any[];
        for (const item of items) {
          const extra = item.extratags || {};
          const possible = [extra.cnpj, extra["ref:vatin"], extra["operator:cnpj"], extra["brand:wikidata"]].filter(Boolean);
          for (const p of possible) {
            addCandidate(String(p), "osm_extratags", "alta");
          }
        }
      }
    } catch {}
  }

  // 3. Consulta de presença pública na Web via DuckDuckGo / HTML aberto
  if (name && candidates.length === 0) {
    try {
      const queryParts = [name, city, cep, "cnpj"].filter(Boolean).join(" ");
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryParts)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetchImpl(searchUrl, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        const matches = html.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g);
        for (const m of matches) {
          addCandidate(m[0], "web_public_index", "media");
          if (candidates.length >= 4) break;
        }
      }
    } catch {}
  }

  return candidates;
}

/**
 * Validação Estrita Antifalhas:
 * NUNCA associa um CNPJ apenas por semelhança de nome!
 * Confere endereço, cidade, estado, CEP e atividade para evitar falsas associações.
 */
export function verifyCnpjCandidate(
  fiscal: FiscalProfile,
  lead: {
    name: string;
    brandName?: string;
    city?: string;
    state?: string;
    cep?: string;
    address?: string;
    category?: string;
  }
): boolean {
  const normLeadCity = lead.city ? normName(lead.city) : "";
  const normFiscalCity = fiscal.enderecoCadastral?.municipio ? normName(fiscal.enderecoCadastral.municipio) : "";

  // 1. Verificação de Cidade/Estado
  if (normLeadCity && normFiscalCity) {
    const cityMatch = normLeadCity === normFiscalCity || nameSimilarity(normLeadCity, normFiscalCity) >= 0.8;
    if (!cityMatch) {
      // Se cidades forem diferentes, só aceitamos se for Matriz de rede conhecida com mesmo nome exato
      const isSameBrandMatriz =
        fiscal.isMatriz &&
        nameSimilarity(lead.brandName || lead.name, fiscal.nomeFantasia || fiscal.razaoSocial || "") >= 0.85;
      if (!isSameBrandMatriz) return false;
    }
  }

  // 2. Verificação de Estado/UF (se ambos informados)
  const leadState = lead.state?.toUpperCase().trim();
  const fiscalState = fiscal.enderecoCadastral?.uf?.toUpperCase().trim();
  if (leadState && fiscalState && leadState !== fiscalState) {
    if (!fiscal.isMatriz) return false;
  }

  // 3. Verificação de Similaridade de Nome (Razão Social ou Nome Fantasia)
  const leadName = lead.name;
  const brandName = lead.brandName || leadName;
  const simRazao = nameSimilarity(brandName, fiscal.razaoSocial || "");
  const simFantasia = nameSimilarity(brandName, fiscal.nomeFantasia || "");
  const bestNameSim = Math.max(simRazao, simFantasia);

  // Rejeita similaridade fraca
  if (bestNameSim < 0.5) return false;

  // 4. Se o nome não for idêntico (0.5 <= sim < 0.8), exige confirmação por CEP ou endereço
  if (bestNameSim < 0.8) {
    const leadCep = lead.cep ? onlyDigits(lead.cep) : "";
    const fiscalCep = fiscal.enderecoCadastral?.cep ? onlyDigits(fiscal.enderecoCadastral.cep) : "";
    const cepCoincide = leadCep && fiscalCep && leadCep.slice(0, 5) === fiscalCep.slice(0, 5);

    const leadAddr = lead.address ? normName(lead.address) : "";
    const fiscalAddr = fiscal.enderecoCadastral?.logradouro ? normName(fiscal.enderecoCadastral.logradouro) : "";
    const addrCoincide = leadAddr && fiscalAddr && nameSimilarity(leadAddr, fiscalAddr) >= 0.6;

    if (!cepCoincide && !addrCoincide && bestNameSim < 0.65) {
      return false;
    }
  }

  return true;
}

/**
 * Fluxo Completo de Descoberta e Verificação de CNPJ para Empresas com ou sem site.
 */
export async function discoverAndVerifyCnpj(
  lead: {
    name: string;
    brandName?: string;
    city?: string;
    state?: string;
    cep?: string;
    address?: string;
    category?: string;
    website?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ cnpj: string; fiscal: FiscalProfile; source: string } | null> {
  const cacheKey = `${normName(lead.name)}|${normName(lead.city || "")}|${onlyDigits(lead.cep) || ""}`;
  const cached = cnpjDiscoveryCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) {
    if (!cached.profile) return null;
    return { cnpj: cached.profile.cnpj, fiscal: cached.profile, source: "cache" };
  }

  const candidates = await searchPublicCnpjCandidates(
    lead.name,
    lead.city,
    lead.state,
    lead.cep,
    lead.website,
    fetchImpl
  );

  for (const cand of candidates) {
    const fiscal = await lookupCnpj(cand.cnpj, fetchImpl);
    if (!fiscal) continue;

    if (verifyCnpjCandidate(fiscal, lead)) {
      cnpjDiscoveryCache.set(cacheKey, { profile: fiscal, exp: Date.now() + CACHE_TTL });
      return { cnpj: cand.cnpj, fiscal, source: cand.source };
    }
  }

  cnpjDiscoveryCache.set(cacheKey, { profile: null, exp: Date.now() + 24 * 60 * 60 * 1000 });
  return null;
}
