export type CallMode = "whatsapp" | "tel" | "browser";

export type CallStatus =
  | "idle"
  | "external_opened"
  | "sip_unconfigured"
  | "ended";

export const CALL_OUTCOMES = [
  "Apenas abriu discador / WhatsApp",
  "Atendida",
  "Não atendida",
  "Ocupado",
  "Caixa postal",
  "Número inválido",
  "Retorno solicitado",
  "Cliente interessado",
  "Não interessado",
  "Reunião agendada",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * Para ações externas (tel: / WhatsApp), nunca assume que a ligação foi atendida.
 */
export function getInitialOutcomeForMode(mode: CallMode): CallOutcome {
  if (mode === "whatsapp" || mode === "tel") {
    return "Apenas abriu discador / WhatsApp";
  }
  return "Não atendida";
}

export function getExternalActionLabel(mode: CallMode, status: CallStatus): string {
  if (status === "sip_unconfigured") {
    return "Softphone SIP não configurado";
  }
  if (mode === "whatsapp") {
    return "WhatsApp aberto (aguardando resultado manual)";
  }
  if (mode === "tel") {
    return "Discador externo acionado (aguardando resultado manual)";
  }
  return "Pronto";
}

export interface CallActivityInput {
  mode: CallMode;
  status: CallStatus;
  outcome: string;
  phoneDisplay: string;
  sellerName?: string;
  notes?: string;
  nextContactAt?: string;
}

/**
 * Formata o registro de atividade comercial diferenciando ações externas
 * (abertura de discador/WhatsApp) de chamadas com resultado confirmado pelo vendedor.
 */
export function buildCallActivityText(input: CallActivityInput): string {
  const modeLabel =
    input.mode === "whatsapp"
      ? "WhatsApp (externo)"
      : input.mode === "tel"
        ? "Celular / tel: (externo)"
        : "Softphone";

  const isExternalOnly =
    input.status === "external_opened" &&
    input.outcome === "Apenas abriu discador / WhatsApp";

  const header = isExternalOnly
    ? `📲 Ação externa iniciada via ${modeLabel} para ${input.phoneDisplay} · [Sem confirmação de atendimento]`
    : `📞 Ligação via ${modeLabel} para ${input.phoneDisplay} · [${input.outcome}]`;

  const parts = [header];
  if (input.sellerName) {
    parts.push(`Vendedor: ${input.sellerName}`);
  }
  if (input.notes?.trim()) {
    parts.push(`Observações: ${input.notes.trim().slice(0, 800)}`);
  }
  if (input.nextContactAt?.trim()) {
    parts.push(`Próximo contato agendado: ${input.nextContactAt.trim()}`);
  }
  return parts.join("\n");
}
