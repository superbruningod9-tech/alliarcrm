import type { MasterLead } from "./types";

const COMPLAINTS: [RegExp, string][] = [
  [/demor|lent[oa]|esper(ei|ar|a)|atras/i, "demora no atendimento"],
  [/n[aã]o (respond|retorn|atend)|sem retorno|ningu[eé]m (atend|respond)/i, "falta de retorno"],
  [/mal atendid|atendimento ruim|p[eé]ssimo atend|grosse/i, "atendimento ruim"],
];

export function yearsSince(iso?: string, now = new Date()): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(+d)) return undefined;
  return Math.floor((+now - +d) / (365.25 * 864e5));
}

export function buildTriggers(l: MasterLead, now = new Date()): string[] {
  const t: string[] = [];
  const diag = l.siteDiagnosis;
  if (!l.website || diag?.hasSite === false) t.push("Não possui site");
  else {
    if (diag?.reachable === false) t.push("Site fora do ar");
    if (diag?.https === false || /^http:\/\//i.test(l.website)) t.push("Site sem HTTPS");
    if (diag && diag.hasWhatsappLink === false && diag.reachable !== false) t.push("Tem site mas sem WhatsApp visível");
    if (diag && diag.hasAnalytics === false && diag.reachable !== false) t.push("Sem pixel/analytics evidente");
  }
  if (!l.phones.some((p) => p.whatsappLikely)) t.push("Sem celular/WhatsApp identificado");
  if (l.rating != null && l.rating < 4 && (l.reviewsCount ?? 0) >= 5) t.push(`Avaliação baixa no Maps (${l.rating.toFixed(1)})`);
  if (l.claimed === false) t.push("Perfil do Google não reivindicado");
  if (l.photosCount != null && l.photosCount < 5) t.push("Poucas fotos no perfil do Google");
  const txt = l.reviews.filter((r) => r.rating <= 3).map((r) => r.text);
  for (const [re, label] of COMPLAINTS) if (txt.filter((x) => re.test(x)).length >= 2) t.push(`Avaliações citam ${label}`);
  const yrs = yearsSince(l.fiscal?.abertura, now);
  if (yrs != null) {
    if (yrs < 1) t.push("Empresa recém-aberta (menos de 1 ano)");
    else if (l.fiscal?.socios?.length) t.push(`Empresa aberta há ${yrs} anos com sócios identificados`);
  }
  if (l.fiscal?.situacao && !/ativa/i.test(l.fiscal.situacao)) t.push(`Situação cadastral: ${l.fiscal.situacao}`);
  return t;
}

/** Potencial 0-100: mais lacunas digitais + contato disponível = mais chance de abordagem. */
export function scoreLead(l: MasterLead): number {
  let s = 20;
  if (l.phones.length) s += 15;
  if (l.phones.some((p) => p.whatsappLikely)) s += 10;
  if (l.emails.length) s += 10;
  if (l.cnpj) s += 5;
  if (l.fiscal?.socios?.length) s += 5;
  s += Math.min(25, l.triggers.filter((x) => /Não possui|sem|fora do ar|baixa|citam|recém/i.test(x)).length * 6);
  if (l.sources.length >= 2) s += 5;
  if (l.fiscal?.situacao && !/ativa/i.test(l.fiscal.situacao)) s -= 40;
  return Math.max(0, Math.min(100, s));
}
