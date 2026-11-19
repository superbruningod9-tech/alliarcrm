import { supabase } from "@/integrations/supabase/client";
import { formatCnpj } from "./cnpj";
import { searchRealPlaces, type RealPlaceResult } from "./prospecting.functions";

export interface ProspectCompany {
  id: string;
  name: string;
  razaoSocial: string;
  segment: string;
  city: string;
  state: string;
  phone: string;
  email?: string | undefined;
  address: string;
  website?: string | undefined;
  rating: number;
  reviewsCount: number;
  cnpj?: string | undefined;
  cnae?: string | undefined;
  socios?: { nome: string; qualificacao: string }[] | undefined;
  imported?: boolean | undefined;
  importedLeadId?: string | undefined;
  source?: "google_maps" | "cnpj_api" | "nominatim" | "manual" | undefined;
  lat?: string | undefined;
  lon?: string | undefined;
}

export interface ProspectSearchParams {
  segment: string;
  city: string;
  state?: string;
  minRating?: number;
  onlyWithWhatsapp?: boolean;
}

const CITY_DDD: Record<string, string> = {
  "belo horizonte": "31",
  "campinas": "19",
  "são paulo": "11",
  "sao paulo": "11",
  "rio de janeiro": "21",
  "curitiba": "41",
  "porto alegre": "51",
  "salvador": "71",
  "brasília": "61",
  "brasilia": "61",
  "goiânia": "62",
  "goiania": "62",
  "fortaleza": "85",
  "recife": "81",
  "florianópolis": "48",
  "florianopolis": "48",
  "vitória": "27",
  "vitoria": "27",
};

export function getDddForCity(city: string): string {
  const norm = (city || "").toLowerCase().trim();
  for (const [k, ddd] of Object.entries(CITY_DDD)) {
    if (norm.includes(k)) return ddd;
  }
  return "11";
}

const IMPORTED_STORAGE_PREFIX = "alliar:imported_prospects:";
const SEARCH_HISTORY_PREFIX = "alliar:prospect_history:";

export function getImportedProspectIds(tenantId: string): Set<string> {
  if (!tenantId) return new Set();
  try {
    const raw = localStorage.getItem(`${IMPORTED_STORAGE_PREFIX}${tenantId}`);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

export function markProspectAsImported(tenantId: string, prospectId: string, leadId?: string) {
  if (!tenantId) return;
  try {
    const current = getImportedProspectIds(tenantId);
    current.add(prospectId);
    localStorage.setItem(`${IMPORTED_STORAGE_PREFIX}${tenantId}`, JSON.stringify(Array.from(current)));
  } catch {}
}

/**
 * Busca estabelecimentos REAIS no Google Maps / Base Geográfica
 * Não inventa nenhum dado — se telefone ou e-mail não existirem, deixa em branco.
 */
export async function searchB2BProspects(
  params: ProspectSearchParams,
  tenantId: string,
  apiKey?: string
): Promise<ProspectCompany[]> {
  const { segment, city, state = "" } = params;
  const importedSet = getImportedProspectIds(tenantId);

  const segClean = segment.trim() || "Empresas";
  const cityClean = city.trim() || "São Paulo";

  try {
    const { places, error } = await searchRealPlaces({
      data: {
        segment: segClean,
        city: cityClean,
        state: state.trim(),
        apiKey: apiKey?.trim(),
      },
    });

    if (error) {
      console.warn("Aviso na busca de locais:", error);
    }

    const results: ProspectCompany[] = places.map((p: RealPlaceResult) => ({
      id: p.id,
      name: p.name,
      razaoSocial: p.name, // Razão social desconhecida no mapa, usa nome fantasia real
      segment: segClean,
      city: p.city || cityClean,
      state: p.state || state,
      phone: p.phone || "", // Vazio caso não possua — NUNCA inventado
      email: p.email,
      address: p.address,
      website: p.website,
      rating: p.rating ?? 0,
      reviewsCount: p.reviewsCount ?? 0,
      cnpj: undefined, // Sem CNPJ até ser consultado
      cnae: undefined,
      socios: undefined,
      imported: importedSet.has(p.id),
      source: "google_maps",
      lat: p.lat,
      lon: p.lon,
    }));

    // Salva no histórico de buscas real do usuário
    try {
      const historyKey = `${SEARCH_HISTORY_PREFIX}${tenantId}`;
      const past = JSON.parse(localStorage.getItem(historyKey) || "[]");
      const updatedHistory = [
        { segment: segClean, city: cityClean, state, count: results.length, at: new Date().toISOString() },
        ...past.filter((x: any) => !(x.segment === segClean && x.city === cityClean)),
      ].slice(0, 20);
      localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
    } catch {}

    return results;
  } catch (err) {
    console.error("Erro na busca de estabelecimentos B2B:", err);
    return [];
  }
}

/**
 * Consulta dados REAIS de CNPJ diretamente na base da Receita Federal
 * via BrasilAPI (pública, gratuita, oficial)
 */
export async function searchCnpjReal(cnpj: string): Promise<ProspectCompany | null> {
  const cnpjClean = cnpj.replace(/\D/g, "");
  if (cnpjClean.length !== 14) return null;

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`);
    if (!res.ok) return null;
    const data = await res.json();

    const socios = (data.qsa || []).map((s: any) => ({
      nome: s.nome_socio || s.nome || "—",
      qualificacao: s.qualificacao_socio || s.qual_socio || "Sócio",
    }));

    // Formata telefone real se existir
    const phone = data.ddd_telefone_1 ? `${data.ddd_telefone_1}`.replace(/\D/g, "") : "";

    return {
      id: `cnpj-${cnpjClean}`,
      name: data.nome_fantasia || data.razao_social || "Empresa",
      razaoSocial: data.razao_social || "",
      segment: data.cnae_fiscal_descricao || "",
      city: data.municipio || "",
      state: data.uf || "",
      phone: phone || "", // Vazio caso não possua
      email: data.email && data.email !== "null" ? data.email.toLowerCase() : undefined,
      address: [
        data.logradouro,
        data.numero,
        data.complemento,
        data.bairro,
        data.municipio,
        data.uf,
        data.cep ? `CEP ${data.cep}` : "",
      ]
        .filter(Boolean)
        .join(", "),
      website: undefined,
      rating: 0,
      reviewsCount: 0,
      cnpj: formatCnpj(cnpjClean),
      cnae: data.cnae_fiscal_descricao
        ? `${data.cnae_fiscal} - ${data.cnae_fiscal_descricao}`
        : undefined,
      socios: socios.length > 0 ? socios : undefined,
      source: "cnpj_api",
    };
  } catch (err) {
    console.error("Erro ao consultar CNPJ:", err);
    return null;
  }
}

/**
 * Retorna histórico real de buscas do vendedor
 */
export function getSearchHistory(
  tenantId: string
): { segment: string; city: string; state?: string; count: number; at: string }[] {
  try {
    const raw = localStorage.getItem(`${SEARCH_HISTORY_PREFIX}${tenantId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Importa o prospect selecionado diretamente para o Funil de Vendas da empresa
 */
export async function importProspectToPipeline(params: {
  tenantId: string;
  prospect: ProspectCompany;
  ownerId?: string;
  addLeadFn: (
    input: unknown,
    extra?: {
      cnpj: string;
      razao_social: string;
      cnae: string;
      endereco: string;
      socios: { nome: string; qualificacao: string }[];
    }
  ) => Promise<string | undefined>;
}): Promise<{ ok: boolean; leadId?: string | undefined }> {
  const { tenantId, prospect, addLeadFn } = params;

  try {
    const leadId = await addLeadFn(
      {
        name: prospect.socios?.[0]?.nome || prospect.name,
        company: prospect.name,
        phone: prospect.phone || "",
        email: prospect.email || "",
        value: 2500, // Ticket médio inicial para funil
      },
      {
        cnpj: prospect.cnpj || "",
        razao_social: prospect.razaoSocial,
        cnae: prospect.cnae || "",
        endereco: prospect.address,
        socios: prospect.socios || [],
      }
    );

    if (leadId) {
      markProspectAsImported(tenantId, prospect.id, leadId);

      const sourceLabel =
        prospect.source === "cnpj_api"
          ? "Consulta CNPJ (Receita Federal)"
          : "Google Maps / Mapa de Estabelecimentos";

      await supabase.from("lead_events").insert({
        tenant_id: tenantId,
        lead_id: leadId,
        kind: "msg",
        text: `📍 [Buscador B2B] Empresa real importada via ${sourceLabel}. Endereço: ${prospect.address || "Não informado"}.`,
      });
    }

    return { ok: true, leadId };
  } catch (err) {
    console.error("Erro ao importar prospect:", err);
    throw err;
  }
}
