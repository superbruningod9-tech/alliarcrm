import type { FiscalProfile } from "./types";
import { isValidCnpj, onlyDigits } from "./merge";

const PORTE: Record<string, string> = { "00": "NAO_INFORMADO", "01": "ME", "03": "EPP", "05": "DEMAIS" };

/** Consulta pública BrasilAPI (gratuita, sem base local). Retorna null se não achar. */
export async function lookupCnpj(cnpj: string, fetchImpl: typeof fetch = fetch): Promise<FiscalProfile | null> {
  const c = onlyDigits(cnpj);
  if (!isValidCnpj(c)) return null;
  try {
    const r = await fetchImpl(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    const porteCode = String(j.codigo_porte ?? "").padStart(2, "0");
    const porte = j.opcao_pelo_simples && /mei/i.test(String(j.porte)) ? "MEI" : j.opcao_pelo_mei ? "MEI" : PORTE[porteCode] ?? String(j.porte ?? "");
    return {
      cnpj: c, razaoSocial: j.razao_social, nomeFantasia: j.nome_fantasia || undefined,
      situacao: j.descricao_situacao_cadastral, abertura: j.data_inicio_atividade,
      porte, capitalSocial: typeof j.capital_social === "number" ? j.capital_social : undefined,
      cnaePrincipal: j.cnae_fiscal ? { code: String(j.cnae_fiscal), description: j.cnae_fiscal_descricao ?? "" } : undefined,
      cnaesSecundarios: (j.cnaes_secundarios ?? []).filter((x: any) => x.codigo).map((x: any) => ({ code: String(x.codigo), description: x.descricao ?? "" })),
      socios: (j.qsa ?? []).map((s: any) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
      email: j.email || undefined,
      telefones: [j.ddd_telefone_1, j.ddd_telefone_2].filter(Boolean),
    };
  } catch { return null; }
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
