import Papa from 'papaparse';
import { z } from 'zod';

export const b2bRow = z.object({ name: z.string().trim().min(1).max(200), company: z.string().max(200).default(''), domain: z.string().max(253).default(''), email: z.string().max(254).default(''), phone: z.string().max(80).default('') });
export type B2BRow = z.infer<typeof b2bRow>;
export function normalizeDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]?.replace(/^www\./, '') ?? '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || domain.length > 253) throw Error(`Domínio inválido: ${value}`);
  return domain;
}
export const canManageB2B = (role: string | null | undefined) => role === 'admin';
export function parseB2BCsv(csv: string): B2BRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.replace(/^\uFEFF/, '').trim().toLowerCase() });
  const errors = parsed.errors.filter(error => error.code !== 'UndetectableDelimiter');
  if (errors.length) throw Error(`CSV inválido: ${errors[0]?.message}`);
  if (!parsed.data.length || parsed.data.length > 100) throw Error('Selecione um CSV com 1 a 100 linhas.');
  return parsed.data.map((r, i) => {
    const row = b2bRow.safeParse({ name: r['name'] || r['nome'] || r['contact_name'] || r['company'] || r['empresa'] || r['company_name'], company: r['company'] || r['empresa'] || r['company_name'] || '', domain: r['domain'] || r['dominio'] || r['domínio'] || '', email: r['email'] || r['e-mail'] || '', phone: r['phone'] || r['telefone'] || '' });
    if (!row.success) throw Error(`Linha ${i + 2}: nome obrigatório ou campo muito longo.`);
    if (row.data.domain) row.data.domain = normalizeDomain(row.data.domain);
    return row.data;
  });
}
export function exportB2BCsv(rows: B2BRow[]) { return Papa.unparse(rows, { escapeFormulae: true }); }
export function requireIndividualKey(key: string | null | undefined): string {
  if (!key) throw Error('Conecte sua própria conta Apollo nas configurações.');
  return key;
}