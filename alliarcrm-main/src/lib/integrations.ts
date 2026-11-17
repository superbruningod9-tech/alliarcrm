import { supabase } from "@/integrations/supabase/client";
import { persistTicket, generateClientPortalLink } from "./alliar-modules";

export interface WebhookLog {
  id: string;
  tenantId: string;
  source: "meta_ads" | "google_ads" | "kiwify" | "hotmart" | "asaas" | "stripe" | "mercadopago" | "custom";
  event: string;
  payload: Record<string, any>;
  status: "success" | "error" | "pending";
  summary: string;
  createdAt: string;
}

export interface IntegrationSettings {
  // Meta Ads (Instagram / Facebook)
  metaVerifyToken: string;
  metaLeadAdsActive: boolean;

  // Google Ads
  googleAdsKey: string;
  googleAdsActive: boolean;

  // Gateways de Pagamento
  kiwifySecret: string;
  kiwifyActive: boolean;
  hotmartToken: string;
  hotmartActive: boolean;
  asaasApiKey: string;
  asaasActive: boolean;
  stripeWebhookSecret: string;
  stripeActive: boolean;
  mercadoPagoToken: string;
  mercadoPagoActive: boolean;

  // Automações de Pagamento
  autoMoveToGanho: boolean;
  autoOpenPortalProject: boolean;
  autoSendPortalMagicLink: boolean;

  // WhatsApp Conector
  whatsappProvider: "meta_cloud" | "evolution_api" | "z_api";
  whatsappApiKey: string;
  whatsappPhoneNumberId: string;
  whatsappInstanceUrl: string;
  whatsappInstanceToken: string;
}

const SETTINGS_STORAGE_PREFIX = "alliar:integrations:";
const LOGS_STORAGE_PREFIX = "alliar:webhook_logs:";

const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  metaVerifyToken: "alliar_meta_token_secret_2026",
  metaLeadAdsActive: true,
  googleAdsKey: "alliar_gads_key_2026",
  googleAdsActive: true,
  kiwifySecret: "kiwify_wh_sec_alliar",
  kiwifyActive: true,
  hotmartToken: "hotmart_tok_alliar",
  hotmartActive: true,
  asaasApiKey: "asaas_alliar_key",
  asaasActive: true,
  stripeWebhookSecret: "whsec_alliar_stripe",
  stripeActive: true,
  mercadoPagoToken: "mp_token_alliar",
  mercadoPagoActive: true,
  autoMoveToGanho: true,
  autoOpenPortalProject: true,
  autoSendPortalMagicLink: true,
  whatsappProvider: "meta_cloud",
  whatsappApiKey: "",
  whatsappPhoneNumberId: "",
  whatsappInstanceUrl: "https://api.evolution-api.com",
  whatsappInstanceToken: "",
};

export function loadIntegrationSettings(tenantId: string): IntegrationSettings {
  if (!tenantId) return DEFAULT_INTEGRATION_SETTINGS;
  try {
    const raw = localStorage.getItem(`${SETTINGS_STORAGE_PREFIX}${tenantId}`);
    if (raw) return { ...DEFAULT_INTEGRATION_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_INTEGRATION_SETTINGS;
}

export function saveIntegrationSettings(tenantId: string, settings: Partial<IntegrationSettings>): IntegrationSettings {
  const current = loadIntegrationSettings(tenantId);
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(`${SETTINGS_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function fetchWebhookLogs(tenantId: string): WebhookLog[] {
  if (!tenantId) return [];
  try {
    const raw = localStorage.getItem(`${LOGS_STORAGE_PREFIX}${tenantId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  // Dados iniciais de histórico para demonstração
  const initialLogs: WebhookLog[] = [
    {
      id: "log-1",
      tenantId,
      source: "meta_ads",
      event: "leadgen",
      status: "success",
      summary: "Lead 'Dra. Camila Siqueira' recebido via Instagram Ads (Campanha Odonto)",
      payload: {
        campaign_name: "Implantes Odonto BH - Nov 2026",
        lead_name: "Dra. Camila Siqueira",
        lead_phone: "31998765432",
        lead_email: "camila@odontosiqueira.com.br",
        form_id: "form_meta_88291",
      },
      createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    {
      id: "log-2",
      tenantId,
      source: "kiwify",
      event: "order_approved",
      status: "success",
      summary: "Pagamento PIX R$ 2.500 aprovado (Cliente: Clínica Sorriso). Movido para Ganho e Pós-Venda aberto.",
      payload: {
        order_id: "kw_998124",
        order_status: "paid",
        payment_method: "pix",
        amount: 2500,
        customer: {
          name: "Clínica Sorriso",
          email: "financeiro@clinicasorriso.com.br",
          mobile: "11988887777",
        },
      },
      createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    },
  ];

  try {
    localStorage.setItem(`${LOGS_STORAGE_PREFIX}${tenantId}`, JSON.stringify(initialLogs));
  } catch {}

  return initialLogs;
}

export function recordWebhookLog(tenantId: string, log: Omit<WebhookLog, "id" | "tenantId" | "createdAt">): WebhookLog {
  const newLog: WebhookLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    tenantId,
    createdAt: new Date().toISOString(),
    ...log,
  };

  try {
    const current = fetchWebhookLogs(tenantId);
    const updated = [newLog, ...current].slice(0, 50); // Mantém últimos 50 logs
    localStorage.setItem(`${LOGS_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}

  return newLog;
}

export function getWebhookUrl(tenantId: string, endpoint: "meta_ads" | "google_ads" | "payment", gateway?: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alliar.app";
  const t = encodeURIComponent(tenantId || "default");
  if (endpoint === "payment") {
    return `${origin}/api/public/webhooks/payment?t=${t}${gateway ? `&gateway=${gateway}` : ""}`;
  }
  return `${origin}/api/public/webhooks/${endpoint.replace("_", "-")}?t=${t}`;
}

/**
 * Processador central de pagamentos (Kiwify, Hotmart, Asaas, Stripe, Mercado Pago)
 * 1. Localiza ou cria o lead/contato
 * 2. Move para a etapa 'ganho'
 * 3. Cria chamado de implantação/onboarding no pós-venda (/portal)
 * 4. Dispara mensagem com link mágico do portal do cliente no WhatsApp
 */
export async function processPaymentWebhook(params: {
  tenantId: string;
  gateway: "kiwify" | "hotmart" | "asaas" | "stripe" | "mercadopago";
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  amount: number;
  orderId: string;
  paymentMethod?: string;
}) {
  const { tenantId, gateway, customerName, customerPhone, customerEmail, amount, orderId, paymentMethod = "PIX" } = params;
  const settings = loadIntegrationSettings(tenantId);

  // 1. Encontra ou cria lead
  let leadId = "";
  try {
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("id, contact_id, contacts(name, phone)")
      .eq("tenant_id", tenantId);

    const match = existingLeads?.find((l: any) =>
      l.contacts?.name?.toLowerCase().includes(customerName.toLowerCase()) ||
      (customerPhone && l.contacts?.phone && l.contacts.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, ""))
    );

    if (match) {
      leadId = match.id;
      if (settings.autoMoveToGanho) {
        await supabase
          .from("leads")
          .update({ stage: "ganho", value: amount, updated_at: new Date().toISOString() })
          .eq("id", match.id);
      }
    } else {
      // Cria novo lead e move para ganho
      const { data: newId } = await supabase.rpc("create_lead", {
        t: tenantId,
        contact_name: customerName,
        contact_company: customerName,
        contact_phone: customerPhone || "",
        contact_email: customerEmail || "",
        deal_value: amount,
      });
      if (newId) {
        leadId = newId;
        if (settings.autoMoveToGanho) {
          await supabase
            .from("leads")
            .update({ stage: "ganho", updated_at: new Date().toISOString() })
            .eq("id", newId);
        }
      }
    }
  } catch (err) {
    console.warn("Erro ao associar lead no Supabase, processando em memória:", err);
  }

  // 2. Registra na timeline do lead
  if (leadId) {
    try {
      await supabase.from("lead_events").insert({
        tenant_id: tenantId,
        lead_id: leadId,
        kind: "pix",
        text: `💰 [Webhook ${gateway.toUpperCase()}] Pagamento de R$ ${amount.toFixed(2)} confirmado via ${paymentMethod} (Pedido #${orderId}). Movido para Ganho!`,
      });
    } catch {}
  }

  // 3. Abre chamado/projeto de pós-venda no portal do cliente
  let magicLinkUrl = "";
  if (settings.autoOpenPortalProject) {
    const createdTicket = await persistTicket(tenantId, {
      title: `Implantação e Onboarding · Pedido #${orderId} (${gateway.toUpperCase()})`,
      description: `Venda aprovada de R$ ${amount.toFixed(2)} via ${paymentMethod}. Iniciar etapas de onboarding e configuração.`,
      contactName: customerName,
      contactId: leadId || undefined,
      priority: "alta",
    });

    const magic = generateClientPortalLink(leadId || `client-${Date.now()}`, customerName);
    magicLinkUrl = magic.url;

    // 4. Envia mensagem de WhatsApp de confirmação com o Link Mágico
    if (settings.autoSendPortalMagicLink && customerPhone) {
      const welcomeMsg = `Olá, ${customerName}! 🎉 Seu pagamento de R$ ${amount.toFixed(2)} foi confirmado com sucesso!\n\nSeu acesso ao Portal do Cliente Alliar já está liberado (sem senha): ${magicLinkUrl}\n\nPor lá você acompanha a implantação, emite recibos e fala com nosso suporte. Seja muito bem-vindo(a)!`;

      try {
        await supabase.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          lead_id: leadId || null,
          phone: customerPhone.replace(/\D/g, ""),
          direction: "out",
          kind: "text",
          body: welcomeMsg,
          status: "delivered",
        });
      } catch {}
    }
  }

  // 5. Registra log do webhook
  recordWebhookLog(tenantId, {
    source: gateway,
    event: "compra_aprovada",
    status: "success",
    summary: `Compra aprovada via ${gateway.toUpperCase()} (R$ ${amount.toFixed(2)}) para ${customerName}`,
    payload: {
      orderId,
      gateway,
      amount,
      customerName,
      customerPhone,
      customerEmail,
      paymentMethod,
      leadMovedToGanho: settings.autoMoveToGanho,
      postSalesOpened: settings.autoOpenPortalProject,
      magicLink: magicLinkUrl,
    },
  });

  return { ok: true, leadId, magicLinkUrl };
}

/**
 * Processador de Leads recebidos de campanhas do Meta Lead Ads (Facebook & Instagram)
 */
export async function processMetaAdsWebhook(params: {
  tenantId: string;
  leadName: string;
  leadPhone: string;
  leadEmail?: string;
  campaignName?: string;
  adName?: string;
  formId?: string;
}) {
  const { tenantId, leadName, leadPhone, leadEmail, campaignName, adName, formId } = params;

  // Cria lead no funil na etapa 'novo'
  let leadId = "";
  try {
    const { data: newId, error } = await supabase.rpc("create_lead", {
      t: tenantId,
      contact_name: leadName,
      contact_company: campaignName ? `Meta Ads: ${campaignName}` : "Anúncio Instagram/Facebook",
      contact_phone: leadPhone,
      contact_email: leadEmail || "",
      deal_value: 0,
    });
    if (!error && newId) {
      leadId = newId;

      await supabase.from("lead_events").insert({
        tenant_id: tenantId,
        lead_id: newId,
        kind: "msg",
        text: `🎯 Lead capturado via Meta Ads!\nCampanha: ${campaignName || "Padrão"}\nAnúncio: ${adName || "Feed/Stories"}\nFormulário: ${formId || "ID_8829"}`,
      });
    }
  } catch {}

  recordWebhookLog(tenantId, {
    source: "meta_ads",
    event: "leadgen",
    status: "success",
    summary: `Novo lead "${leadName}" capturado via anúncio ${campaignName || "Meta Ads"}`,
    payload: {
      leadName,
      leadPhone,
      leadEmail,
      campaignName,
      adName,
      formId,
      leadId,
    },
  });

  return { ok: true, leadId };
}
