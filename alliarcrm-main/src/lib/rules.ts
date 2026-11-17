// Regras de negócio puras (testáveis).
export const DISCOUNT_APPROVAL_THRESHOLD = 15; // % acima disso exige gestor no Modo Equipe

export function needsApproval(structure: "solo" | "equipe", discountPct: number) {
  return structure === "equipe" && discountPct > DISCOUNT_APPROVAL_THRESHOLD;
}

export const SLA_MINUTES = 5; // anti-vácuo: lead sem resposta em 5 min é redistribuído

export function nextRoundRobin(team: string[], lastIndex: number) {
  if (!team || team.length === 0) return 0;
  return (lastIndex + 1) % team.length;
}

/** Verifica se um lead na etapa 'novo' ou sem resposta está há mais de SLA_MINUTES no vácuo. */
export function isLeadInVacuo(createdAtOrLastContact: string | Date, now: Date = new Date(), slaMinutes: number = SLA_MINUTES): boolean {
  if (!createdAtOrLastContact) return false;
  const createdTime = new Date(createdAtOrLastContact).getTime();
  if (Number.isNaN(createdTime)) return false;
  const diffMinutes = (now.getTime() - createdTime) / (1000 * 60);
  return diffMinutes >= slaMinutes;
}

/** Retorna quantos minutos faltam para expirar o SLA anti-vácuo (0 se já expirou). */
export function antiVacuoMinutesRemaining(createdAtOrLastContact: string | Date, now: Date = new Date(), slaMinutes: number = SLA_MINUTES): number {
  if (!createdAtOrLastContact) return 0;
  const createdTime = new Date(createdAtOrLastContact).getTime();
  if (Number.isNaN(createdTime)) return 0;
  const diffMinutes = (now.getTime() - createdTime) / (1000 * 60);
  return Math.max(0, Math.round((slaMinutes - diffMinutes) * 10) / 10);
}

/** Calcula a recompensa em reais de uma indicação convertida com base no valor e percentual. */
export function calculateReferralReward(dealValue: number, rewardPct: number): number {
  if (dealValue <= 0 || rewardPct <= 0) return 0;
  return Math.round(((dealValue * rewardPct) / 100) * 100) / 100;
}

/** Calcula SLA do chamado com base na prioridade informada. */
export function calculateTicketSla(priority: 'alta' | 'média' | 'baixa'): { hours: number; label: string } {
  switch (priority) {
    case 'alta':
      return { hours: 2, label: 'Responder em 2h' };
    case 'média':
      return { hours: 4, label: 'Responder em 4h' };
    case 'baixa':
    default:
      return { hours: 24, label: 'Responder em 24h' };
  }
}

/** Gera texto personalizado de mensagem de boas-vindas do motor de automação. */
export function generateWelcomeMessage(leadName: string, company?: string, sellerName?: string): string {
  const name = leadName?.trim() || "Cliente";
  const empresa = company?.trim() ? ` na ${company}` : "";
  const atendente = sellerName?.trim() ? `nosso consultor ${sellerName}` : "nossa equipe comercial";
  return `Olá, ${name}! Seja bem-vindo(a) à Alliar${empresa}. 👋 Recebemos seu interesse e ${atendente} já vai te atender. Como podemos ajudar seu negócio hoje?`;
}

export function beep(freq = 880, ms = 180) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch { /* sem áudio */ }
}
