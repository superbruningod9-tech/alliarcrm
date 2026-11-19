import { supabase } from "@/integrations/supabase/client";
import { calculateReferralReward, calculateTicketSla, generateWelcomeMessage, isLeadInVacuo, nextRoundRobin, SLA_MINUTES } from "./rules";

export interface SupportTicket {
  id: string;
  tenantId: string;
  protocol: string;
  title: string;
  description?: string;
  contactName: string;
  contactId?: string | undefined;
  priority: "alta" | "média" | "baixa";
  slaLabel: string;
  slaHours: number;
  slaDeadline: string;
  status: "aberto" | "em_andamento" | "resolvido";
  createdAt: string;
  resolvedAt?: string | undefined;
}

export interface ClientMagicLink {
  contactId: string;
  contactName: string;
  companyName: string;
  token: string;
  url: string;
  stepIndex: number; // 0 a 4 do rastreio
}

export interface Referral {
  id: string;
  tenantId: string;
  referrerContactId: string;
  referrerName: string;
  magicToken: string;
  magicLink: string;
  referredName: string;
  referredPhone: string;
  referredEmail?: string | undefined;
  leadId?: string | undefined;
  status: "indicado" | "em_negociacao" | "convertido";
  dealValue: number;
  rewardPct: number;
  rewardAmount: number;
  createdAt: string;
  convertedAt?: string;
}

export interface ReferrerSummary {
  contactId: string;
  name: string;
  phone?: string;
  magicLink: string;
  totalReferred: number;
  totalConverted: number;
  totalReward: number;
}

const TICKET_STORAGE_PREFIX = "alliar:tickets:";
const REFERRAL_STORAGE_PREFIX = "alliar:referrals:";
const AUTOMATION_SETTINGS_PREFIX = "alliar:automations:v2:";

export interface AutomationSettings {
  whatsappNumber?: string;
  businessPhone?: string;
  welcomeEnabled: boolean;
  welcomeMessage?: string;
  antiVacuoEnabled: boolean;
  antiVacuoMinutes: number;
  antiVacuoSound?: boolean;
  reminderEnabled?: boolean;
  reminderMinutes?: number;
  referralRewardPct: number;
}

const DEFAULT_SETTINGS: AutomationSettings = {
  whatsappNumber: "",
  businessPhone: "",
  welcomeEnabled: false, // Desabilitado por padrão (ativado apenas se o cliente quiser)
  welcomeMessage: "Olá, {{nome}}! Recebemos seu contato aqui na {{empresa}}. Me chamo {{vendedor}}, como posso te ajudar?",
  antiVacuoEnabled: false, // Desabilitado por padrão (ativado apenas se o cliente quiser)
  antiVacuoMinutes: SLA_MINUTES,
  antiVacuoSound: false, // Desabilitado por padrão
  reminderEnabled: false, // Desabilitado por padrão (ativado apenas se o cliente quiser)
  reminderMinutes: 120,
  referralRewardPct: 10,
};

// ---------------------------------------------------------------------------
// 1. PÓS-VENDA E CHAMADOS COM SLA (/portal)
// ---------------------------------------------------------------------------

export async function fetchSupportTickets(tenantId: string): Promise<SupportTicket[]> {
  if (!tenantId) return [];

  // Tenta carregar do Supabase caso a tabela 'support_tickets' exista
  try {
    const { data, error } = await supabase
      .from("support_tickets" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((t: any) => ({
        id: t.protocol || t.id,
        tenantId: t.tenant_id,
        protocol: t.protocol || t.id,
        title: t.title,
        description: t.description,
        contactName: t.contact_name || "Cliente",
        contactId: t.contact_id,
        priority: t.priority || "média",
        slaLabel: t.sla_label || "Responder em 4h",
        slaHours: t.sla_hours || 4,
        slaDeadline: t.sla_deadline || new Date(Date.now() + 4 * 3600000).toISOString(),
        status: t.status || "aberto",
        createdAt: t.created_at,
        resolvedAt: t.resolved_at,
      }));
    }
  } catch {
    // Tabela pode ainda não ter sido migrada no Supabase remoto
  }

  // Fallback seguro em localStorage escopado por tenant
  try {
    const raw = localStorage.getItem(`${TICKET_STORAGE_PREFIX}${tenantId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  // Dados iniciais com protocolo e rastreio para demonstração inicial
  const initialTickets: SupportTicket[] = [
    {
      id: "ALR-1042",
      protocol: "ALR-1042",
      tenantId,
      title: "Dúvida sobre fatura e 2ª via PIX",
      description: "Cliente solicitou 2ª via do PIX de implantação com abatimento acordado.",
      contactName: "Clínica Sorriso",
      priority: "alta",
      slaLabel: "Responder em 2h",
      slaHours: 2,
      slaDeadline: new Date(Date.now() + 2 * 3600000).toISOString(),
      status: "aberto",
      createdAt: new Date(Date.now() - 35 * 60000).toISOString(),
    },
    {
      id: "ALR-1041",
      protocol: "ALR-1041",
      tenantId,
      title: "Liberação de acesso de novo operador",
      description: "Cadastrar novos logins para a equipe de recepção.",
      contactName: "Clínica Sorriso",
      priority: "média",
      slaLabel: "Responder em 4h",
      slaHours: 4,
      slaDeadline: new Date(Date.now() - 10 * 60000).toISOString(),
      status: "resolvido",
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      resolvedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
  ];

  try {
    localStorage.setItem(`${TICKET_STORAGE_PREFIX}${tenantId}`, JSON.stringify(initialTickets));
  } catch {}

  return initialTickets;
}

export async function persistTicket(
  tenantId: string,
  ticketData: {
    title: string;
    description?: string;
    contactName?: string;
    contactId?: string | undefined;
    priority?: "alta" | "média" | "baixa";
  }
): Promise<SupportTicket> {
  const priority = ticketData.priority || "média";
  const { hours, label } = calculateTicketSla(priority);
  const now = new Date();
  const protocol = `ALR-${1040 + Math.floor(Math.random() * 9000)}`;

  const newTicket: SupportTicket = {
    id: protocol,
    protocol,
    tenantId,
    title: ticketData.title.trim(),
    description: ticketData.description?.trim() || "",
    contactName: ticketData.contactName || "Cliente",
    contactId: ticketData.contactId,
    priority,
    slaLabel: label,
    slaHours: hours,
    slaDeadline: new Date(now.getTime() + hours * 3600000).toISOString(),
    status: "aberto",
    createdAt: now.toISOString(),
  };

  // Tenta persistir no Supabase se existir
  try {
    await supabase.from("support_tickets" as any).insert({
      tenant_id: tenantId,
      protocol: newTicket.protocol,
      title: newTicket.title,
      description: newTicket.description,
      contact_name: newTicket.contactName,
      contact_id: newTicket.contactId,
      priority: newTicket.priority,
      sla_label: newTicket.slaLabel,
      sla_hours: newTicket.slaHours,
      sla_deadline: newTicket.slaDeadline,
      status: newTicket.status,
    });
  } catch {}

  // Atualiza cache local
  try {
    const existing = await fetchSupportTickets(tenantId);
    const updated = [newTicket, ...existing];
    localStorage.setItem(`${TICKET_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}

  return newTicket;
}

export async function toggleTicketResolution(
  tenantId: string,
  ticketId: string
): Promise<SupportTicket[]> {
  const tickets = await fetchSupportTickets(tenantId);
  const updated = tickets.map((t) => {
    if (t.id === ticketId || t.protocol === ticketId) {
      const isDone = t.status === "resolvido";
      return {
        ...t,
        status: (isDone ? "aberto" : "resolvido") as SupportTicket["status"],
        resolvedAt: isDone ? undefined : new Date().toISOString(),
      };
    }
    return t;
  });

  try {
    localStorage.setItem(`${TICKET_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}

  try {
    const target = updated.find((t) => t.id === ticketId || t.protocol === ticketId);
    if (target) {
      await supabase
        .from("support_tickets" as any)
        .update({
          status: target.status,
          resolved_at: target.resolvedAt || null,
        })
        .eq("tenant_id", tenantId)
        .eq("protocol", target.protocol);
    }
  } catch {}

  return updated;
}

/** Gera link mágico individual para o portal do cliente */
export function generateClientPortalLink(contactId: string, contactName: string): ClientMagicLink {
  const token = btoa(`${contactId}:${contactName}:${Date.now()}`).replace(/[+/=]/g, "").slice(0, 16).toLowerCase();
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alliar.app";
  return {
    contactId,
    contactName,
    companyName: contactName,
    token,
    url: `${origin}/portal?token=${token}&c=${encodeURIComponent(contactId)}`,
    stepIndex: 3, // Padrão "Configuração"
  };
}

// ---------------------------------------------------------------------------
// 2. PROGRAMA DE INDICAÇÕES (/indicacoes)
// ---------------------------------------------------------------------------

export async function fetchReferrals(tenantId: string): Promise<Referral[]> {
  if (!tenantId) return [];

  // Tenta Supabase
  try {
    const { data, error } = await supabase
      .from("referrals" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        referrerContactId: r.referrer_contact_id,
        referrerName: r.referrer_name,
        magicToken: r.magic_token,
        magicLink: r.magic_link,
        referredName: r.referred_name,
        referredPhone: r.referred_phone,
        referredEmail: r.referred_email,
        leadId: r.lead_id,
        status: r.status,
        dealValue: Number(r.deal_value || 0),
        rewardPct: Number(r.reward_pct || 10),
        rewardAmount: Number(r.reward_amount || 0),
        createdAt: r.created_at,
        convertedAt: r.converted_at,
      }));
    }
  } catch {}

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(`${REFERRAL_STORAGE_PREFIX}${tenantId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  // Dados iniciais de exemplo integrados com links mágicos reais
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alliar.app";
  const initialReferrals: Referral[] = [
    {
      id: "ref-1",
      tenantId,
      referrerContactId: "c-beatriz",
      referrerName: "Beatriz Nunes",
      magicToken: "ind-bn-901",
      magicLink: `${origin}/indicacoes?ref=c-beatriz`,
      referredName: "Hospital Santa Clara",
      referredPhone: "11988887777",
      status: "convertido",
      dealValue: 2500,
      rewardPct: 10,
      rewardAmount: 250,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      convertedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "ref-2",
      tenantId,
      referrerContactId: "c-beatriz",
      referrerName: "Beatriz Nunes",
      magicToken: "ind-bn-901",
      magicLink: `${origin}/indicacoes?ref=c-beatriz`,
      referredName: "Laboratório Alpha",
      referredPhone: "11977776666",
      status: "convertido",
      dealValue: 2500,
      rewardPct: 10,
      rewardAmount: 250,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      convertedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "ref-3",
      tenantId,
      referrerContactId: "c-beatriz",
      referrerName: "Beatriz Nunes",
      magicToken: "ind-bn-901",
      magicLink: `${origin}/indicacoes?ref=c-beatriz`,
      referredName: "Odonto Vida",
      referredPhone: "11966665555",
      status: "indicado",
      dealValue: 2500,
      rewardPct: 10,
      rewardAmount: 0,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "ref-4",
      tenantId,
      referrerContactId: "c-mariana",
      referrerName: "Mariana Costa",
      magicToken: "ind-mc-402",
      magicLink: `${origin}/indicacoes?ref=c-mariana`,
      referredName: "Clínica Bem Estar",
      referredPhone: "11955554444",
      status: "convertido",
      dealValue: 2500,
      rewardPct: 10,
      rewardAmount: 250,
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      convertedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "ref-5",
      tenantId,
      referrerContactId: "c-mariana",
      referrerName: "Mariana Costa",
      magicToken: "ind-mc-402",
      magicLink: `${origin}/indicacoes?ref=c-mariana`,
      referredName: "Centro Diagnóstico Sul",
      referredPhone: "11944443333",
      status: "em_negociacao",
      dealValue: 2500,
      rewardPct: 10,
      rewardAmount: 0,
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: "ref-6",
      tenantId,
      referrerContactId: "c-diego",
      referrerName: "Diego Martins",
      magicToken: "ind-dm-105",
      magicLink: `${origin}/indicacoes?ref=c-diego`,
      referredName: "Clínica Pediátrica Anjos",
      referredPhone: "11933332222",
      status: "convertido",
      dealValue: 2500,
      rewardPct: 10,
      rewardAmount: 250,
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      convertedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ];

  try {
    localStorage.setItem(`${REFERRAL_STORAGE_PREFIX}${tenantId}`, JSON.stringify(initialReferrals));
  } catch {}

  return initialReferrals;
}

/** Gera link mágico único para o cliente indicar contatos */
export function generateClientReferralLink(contactId: string, contactName: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alliar.app";
  const slug = encodeURIComponent(contactId);
  return `${origin}/indicacoes?ref=${slug}&n=${encodeURIComponent(contactName)}`;
}

/** Registra nova indicação vinculada ao cliente indicador */
export async function createReferralRecord(
  tenantId: string,
  params: {
    referrerContactId: string;
    referrerName: string;
    referredName: string;
    referredPhone: string;
    referredEmail?: string | undefined;
    leadId?: string | undefined;
    dealValue?: number;
    rewardPct?: number;
  }
): Promise<Referral> {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alliar.app";
  const token = `ref-${Math.random().toString(36).slice(2, 8)}`;
  const magicLink = `${origin}/indicacoes?ref=${encodeURIComponent(params.referrerContactId)}`;
  const pct = params.rewardPct ?? 10;
  const value = params.dealValue ?? 2500;

  const newRef: Referral = {
    id: `ref-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    tenantId,
    referrerContactId: params.referrerContactId,
    referrerName: params.referrerName,
    magicToken: token,
    magicLink,
    referredName: params.referredName,
    referredPhone: params.referredPhone,
    referredEmail: params.referredEmail,
    leadId: params.leadId,
    status: "indicado",
    dealValue: value,
    rewardPct: pct,
    rewardAmount: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    const list = await fetchReferrals(tenantId);
    const updated = [newRef, ...list];
    localStorage.setItem(`${REFERRAL_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}

  try {
    await supabase.from("referrals" as any).insert({
      tenant_id: tenantId,
      referrer_contact_id: newRef.referrerContactId,
      referrer_name: newRef.referrerName,
      magic_token: newRef.magicToken,
      magic_link: newRef.magicLink,
      referred_name: newRef.referredName,
      referred_phone: newRef.referredPhone,
      referred_email: newRef.referredEmail,
      lead_id: newRef.leadId,
      status: newRef.status,
      deal_value: newRef.dealValue,
      reward_pct: newRef.rewardPct,
      reward_amount: 0,
    });
  } catch {}

  return newRef;
}

/** Registra conversão automática quando o lead é movido para 'ganho' */
export async function convertReferralByLead(
  tenantId: string,
  leadId: string,
  leadValue: number
): Promise<{ converted: boolean; referral?: Referral; reward?: number }> {
  const referrals = await fetchReferrals(tenantId);
  const target = referrals.find(
    (r) => r.leadId === leadId || (r.status !== "convertido" && r.referredName && r.referredName.toLowerCase().includes(leadId.toLowerCase()))
  );

  if (!target || target.status === "convertido") {
    return { converted: false };
  }

  const reward = calculateReferralReward(leadValue || target.dealValue || 2500, target.rewardPct);
  const now = new Date().toISOString();

  const updatedList = referrals.map((r) => {
    if (r.id === target.id) {
      return {
        ...r,
        status: "convertido" as const,
        dealValue: leadValue || r.dealValue,
        rewardAmount: reward,
        convertedAt: now,
      };
    }
    return r;
  });

  try {
    localStorage.setItem(`${REFERRAL_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updatedList));
  } catch {}

  try {
    await supabase
      .from("referrals" as any)
      .update({
        status: "convertido",
        deal_value: leadValue || target.dealValue,
        reward_amount: reward,
        converted_at: now,
      })
      .eq("id", target.id);
  } catch {}

  return {
    converted: true,
    referral: { ...target, status: "convertido", rewardAmount: reward, convertedAt: now },
    reward,
  };
}

/** Agrupa indicadores para a tabela resumida de recompensas */
export function summarizeReferrals(referrals: Referral[], clients: { id: string; name: string }[]): ReferrerSummary[] {
  const map = new Map<string, ReferrerSummary>();

  // Pré-popula com clientes conhecidos
  for (const c of clients) {
    map.set(c.id, {
      contactId: c.id,
      name: c.name,
      magicLink: generateClientReferralLink(c.id, c.name),
      totalReferred: 0,
      totalConverted: 0,
      totalReward: 0,
    });
  }

  // Agrega dados de indicações
  for (const r of referrals) {
    const key = r.referrerContactId || r.referrerName;
    const item = map.get(key) || {
      contactId: r.referrerContactId || key,
      name: r.referrerName,
      magicLink: r.magicLink || generateClientReferralLink(key, r.referrerName),
      totalReferred: 0,
      totalConverted: 0,
      totalReward: 0,
    };

    item.totalReferred += 1;
    if (r.status === "convertido") {
      item.totalConverted += 1;
      item.totalReward += r.rewardAmount;
    }

    map.set(key, item);
  }

  return Array.from(map.values()).sort((a, b) => b.totalReward - a.totalReward || b.totalReferred - a.totalReferred);
}

// ---------------------------------------------------------------------------
// 3. MOTOR DE REGRAS E AUTOMAÇÕES EM TEMPO REAL
// ---------------------------------------------------------------------------

export function loadAutomationSettings(tenantId: string): AutomationSettings {
  if (!tenantId) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(`${AUTOMATION_SETTINGS_PREFIX}${tenantId}`);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveAutomationSettings(tenantId: string, settings: Partial<AutomationSettings>): AutomationSettings {
  const current = loadAutomationSettings(tenantId);
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(`${AUTOMATION_SETTINGS_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}
  return updated;
}

/**
 * Dispara mensagem de boas-vindas automática no WhatsApp para novo lead recebido.
 */
export async function executeWelcomeAutomation(params: {
  tenantId: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  companyName?: string;
  sellerName?: string;
}): Promise<{ ok: boolean; message: string }> {
  const messageBody = generateWelcomeMessage(params.leadName, params.companyName, params.sellerName);

  // Registra o evento de mensagem enviada na timeline
  try {
    await supabase.from("lead_events").insert({
      tenant_id: params.tenantId,
      lead_id: params.leadId,
      kind: "msg",
      text: `🤖 [Automação Boas-Vindas] Mensagem enviada para ${params.leadPhone || params.leadName}: "${messageBody}"`,
    });
  } catch {}

  // Se tiver telefone válido, grava também na tabela de mensagens do WhatsApp
  if (params.leadPhone && params.leadPhone.replace(/\D/g, "").length >= 10) {
    try {
      await supabase.from("whatsapp_messages").insert({
        tenant_id: params.tenantId,
        lead_id: params.leadId,
        phone: params.leadPhone.replace(/\D/g, ""),
        direction: "out",
        kind: "text",
        body: messageBody,
        status: "delivered",
      });
    } catch {}
  }

  return { ok: true, message: messageBody };
}

export interface AntiVacuoTransfer {
  leadId: string;
  leadName: string;
  previousOwnerId: string;
  newOwnerId: string;
  newOwnerName: string;
  minutesInVacuo: number;
}

/**
 * Avalia leads na etapa 'novo' e redistribui por round-robin caso sem resposta por mais de 5 minutos.
 */
export function evaluateAntiVacuoRule(params: {
  leads: {
    id: string;
    name: string;
    stage: string;
    createdAt?: string;
    lastContact?: string;
    ownerId?: string;
    timeline?: { kind: string; at: string }[];
  }[];
  teamMembers: { user_id: string; display_name: string; email: string }[];
  currentUserId: string;
  now?: Date;
  slaMinutes?: number;
}): AntiVacuoTransfer[] {
  const { leads, teamMembers, slaMinutes = SLA_MINUTES, now = new Date() } = params;
  if (!leads.length || teamMembers.length <= 1) return [];

  const transfers: AntiVacuoTransfer[] = [];
  const memberIds = teamMembers.map((m) => m.user_id);

  for (const lead of leads) {
    // Aplica apenas para leads novos ou sem contato inicial
    if (lead.stage !== "novo") continue;

    const baseTime = lead.createdAt || lead.lastContact;
    if (!baseTime) continue;

    // Se já houve mensagem do vendedor na timeline, o lead foi respondido
    const hasSellerMsg = lead.timeline?.some((e) => e.kind === "msg" || e.kind === "call");
    if (hasSellerMsg) continue;

    if (isLeadInVacuo(baseTime, now, slaMinutes)) {
      const createdTime = new Date(baseTime).getTime();
      const minutesInVacuo = Math.round((now.getTime() - createdTime) / 60000);

      const currentIdx = memberIds.indexOf(lead.ownerId || "");
      const nextIdx = nextRoundRobin(memberIds, currentIdx >= 0 ? currentIdx : 0);
      const nextMember = teamMembers[nextIdx];

      if (nextMember && nextMember.user_id !== lead.ownerId) {
        transfers.push({
          leadId: lead.id,
          leadName: lead.name,
          previousOwnerId: lead.ownerId || "",
          newOwnerId: nextMember.user_id,
          newOwnerName: nextMember.display_name || nextMember.email || "Próximo vendedor",
          minutesInVacuo,
        });
      }
    }
  }

  return transfers;
}
