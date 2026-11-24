import type { FiscalProfile } from "./types";
import { isValidCnpj, onlyDigits } from "./merge";

const PORTE: Record<string, string> = { "00": "NAO_INFORMADO", "01": "ME", "03": "EPP", "05": "DEMAIS" };

/** Cache em memória para consultas repetidas de CNPJ */
const cnpjCache = new Map<string, { data: FiscalProfile | null; exp: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Consulta pública BrasilAPI (gratuita, sem base local) com cache em memória e tratamento de erros. */
export async function lookupCnpj(
  cnpj: string,
  fetchImpl: typeof fetch = fetch,
  useCache = true
): Promise<FiscalProfile | null> {
  const c = onlyDigits(cnpj);
  if (!isValidCnpj(c)) return null;

  if (useCache) {
    const cached = cnpjCache.get(c);
    if (cached && cached.exp > Date.now()) return cached.data;
  }

  try {
    const r = await fetchImpl(`https://brasilapi.com.br/api/cnpj/v1/${c}`, {
      headers: { Accept: "application/json", "User-Agent": "AlliarCRM-B2B/1.0" },
    });
    if (!r.ok) {
      if (r.status === 404) {
        if (useCache) cnpjCache.set(c, { data: null, exp: Date.now() + 24 * 60 * 60 * 1000 });
      }
      return null;
    }
    const j: any = await r.json();
    const porteCode = String(j.codigo_porte ?? "").padStart(2, "0");
    const porte =
      j.opcao_pelo_simples && /mei/i.test(String(j.porte))
        ? "MEI"
        : j.opcao_pelo_mei
        ? "MEI"
        : PORTE[porteCode] ?? String(j.porte ?? "");

    const isMatriz = j.identificador_matriz_filial === 1 || c.slice(8, 12) === "0001";
    const abertura = j.data_inicio_atividade;
    const idadeAnos = abertura
      ? Math.max(0, Math.floor((Date.now() - new Date(abertura).getTime()) / (365.25 * 864e5)))
      : undefined;

    const profile: FiscalProfile = {
      cnpj: c,
      razaoSocial: j.razao_social,
      nomeFantasia: j.nome_fantasia || undefined,
      situacao: j.descricao_situacao_cadastral,
      situacaoData: j.data_situacao_cadastral,
      abertura,
      idadeAnos,
      porte,
      capitalSocial: typeof j.capital_social === "number" ? j.capital_social : undefined,
      cnaePrincipal: j.cnae_fiscal
        ? { code: String(j.cnae_fiscal), description: j.cnae_fiscal_descricao ?? "" }
        : undefined,
      cnaesSecundarios: (j.cnaes_secundarios ?? [])
        .filter((x: any) => x.codigo)
        .map((x: any) => ({ code: String(x.codigo), description: x.descricao ?? "" })),
      socios: (j.qsa ?? []).map((s: any) => ({
        nome: s.nome_socio,
        qualificacao: s.qualificacao_socio,
        faixaEtaria: s.faixa_etaria,
      })),
      email: j.email || undefined,
      telefones: [j.ddd_telefone_1, j.ddd_telefone_2].filter(Boolean),
      enderecoCadastral: {
        logradouro: j.logradouro,
        numero: j.numero,
        complemento: j.complemento,
        bairro: j.bairro,
        municipio: j.municipio,
        uf: j.uf,
        cep: j.cep ? onlyDigits(j.cep) : undefined,
      },
      isMatriz,
      tipoUnidade: isMatriz ? "matriz" : "filial",
    };

    if (useCache) cnpjCache.set(c, { data: profile, exp: Date.now() + CACHE_TTL_MS });
    return profile;
  } catch (err) {
    console.warn(`[lookupCnpj] Erro de rede ao consultar CNPJ ${c}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Consulta múltiplos CNPJs em lote controlado (sem estourar limites) */
export async function lookupCnpjBatch(
  cnpjs: string[],
  maxItems = 50,
  concurrency = 3,
  fetchImpl: typeof fetch = fetch
): Promise<FiscalProfile[]> {
  const results: FiscalProfile[] = [];
  const unique = Array.from(new Set(cnpjs.map(onlyDigits).filter(isValidCnpj))).slice(0, maxItems);

  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const batch = await Promise.all(
      chunk.map(async (c) => {
        try {
          return await lookupCnpj(c, fetchImpl);
        } catch {
          return null;
        }
      })
    );
    for (const f of batch) {
      if (f) results.push(f);
    }
    // Pequeno intervalo entre chunks para respeitar rate-limit da BrasilAPI
    if (i + concurrency < unique.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return results;
}

/** Interpreta lista colada: CNPJs, domínios ou nomes (uma entrada por linha/; ,). */
export interface BulkEntry { raw: string; kind: "cnpj" | "domain" | "name" }
export function parseBulkList(text: string, max = 500): BulkEntry[] {
  const seen = new Set<string>();
  const out: BulkEntry[] = [];
  for (const piece of text.split(/[\n;\t]+/)) {
    const raw = piece.trim().replace(/^["']|["']$/g, "");
    if (!raw || raw.length > 200) continue;
    const digits = onlyDigits(raw);
    let kind: BulkEntry["kind"] = "name";
    if (digits.length === 14 && isValidCnpj(digits) && /^[\d./\-\s]+$/.test(raw)) kind = "cnpj";
    else if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(raw) && !/\s/.test(raw)) kind = "domain";
    const key = kind === "cnpj" ? digits : raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw: kind === "cnpj" ? digits : raw, kind });
    if (out.length >= max) break;
  }
  return out;
}
