import { supabase } from "@/integrations/supabase/client";

export interface UserApiKeys {
  // Prospecção B2B & Google Maps
  googlePlacesKey?: string;
  apolloKey?: string;
  serperKey?: string;

  // Inteligência Artificial
  geminiKey?: string;
  openaiKey?: string;
  groqKey?: string;

  // WhatsApp & Mensageria
  whatsappApiUrl?: string;
  whatsappApiKey?: string;
  whatsappInstance?: string;
}

export interface ApiProviderRecommendation {
  id: keyof UserApiKeys | "brasilapi";
  category: "ai" | "b2b" | "whatsapp";
  name: string;
  badge: "Gratuito" | "Mais Famoso" | "Recomendado" | "Ultra Rápido";
  description: string;
  url: string;
  freeTier: string;
}

export const API_RECOMMENDATIONS: ApiProviderRecommendation[] = [
  // IA
  {
    id: "geminiKey",
    category: "ai",
    name: "Google Gemini AI",
    badge: "Gratuito",
    description: "Inteligência artificial do Google de última geração (Gemini 1.5 Flash).",
    url: "https://aistudio.google.com/app/apikey",
    freeTier: "100% gratuito (até 15 requisições/minuto no Google AI Studio)",
  },
  {
    id: "openaiKey",
    category: "ai",
    name: "OpenAI ChatGPT",
    badge: "Mais Famoso",
    description: "Modelos GPT-4o e GPT-4o-mini com alta precisão comercial.",
    url: "https://platform.openai.com/api-keys",
    freeTier: "Créditos iniciais e custo por uso em centavos de dólar",
  },
  {
    id: "groqKey",
    category: "ai",
    name: "Groq Cloud (Llama 3.3)",
    badge: "Ultra Rápido",
    description: "Inferência de IA mais rápida do mundo rodando Llama 3.",
    url: "https://console.groq.com/keys",
    freeTier: "Camada gratuita generosa com limites altos por minuto",
  },

  // B2B
  {
    id: "brasilapi",
    category: "b2b",
    name: "BrasilAPI / Receita Federal",
    badge: "Gratuito",
    description: "Consulta oficial de CNPJs, razão social, endereço, sócios e CNAE.",
    url: "https://brasilapi.com.br",
    freeTier: "100% gratuito e público, sem cartão de crédito e já embutido no Alliar",
  },
  {
    id: "googlePlacesKey",
    category: "b2b",
    name: "Google Places API (Google Maps)",
    badge: "Recomendado",
    description: "Busca estabelecimentos reais com telefones, sites e avaliações no mapa.",
    url: "https://console.cloud.google.com/google/maps-apis",
    freeTier: "Google dá $200 dólares mensais grátis (equivale a ~6.000 buscas gratuitas/mês)",
  },
  {
    id: "apolloKey",
    category: "b2b",
    name: "Apollo.io B2B",
    badge: "Mais Famoso",
    description: "Enriquecimento de domínios corporativos com e-mails verificados de decisores.",
    url: "https://app.apollo.io/#/settings/integrations/api",
    freeTier: "Plano Free inclui créditos mensais para enriquecimento",
  },
];

const STORAGE_PREFIX = "alliar:byok_keys:";

/**
 * Carrega as chaves salvas do usuário / empresa
 */
export async function loadUserApiKeys(userId: string, tenantId?: string): Promise<UserApiKeys> {
  const defaults: UserApiKeys = {};
  if (!userId) return defaults;

  // 1. Tenta carregar do localStorage do usuário para resposta instantânea
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw) Object.assign(defaults, JSON.parse(raw));
  } catch {}

  // 2. Sincroniza com o Supabase (tabela b2b_connections) se disponível
  try {
    const { data } = await supabase
      .from("b2b_connections")
      .select("provider,key_ciphertext")
      .eq("user_id", userId);

    if (data) {
      for (const row of data) {
        if (row.provider === "google_places") defaults.googlePlacesKey = row.key_ciphertext;
        if (row.provider === "apollo") defaults.apolloKey = row.key_ciphertext;
        if (row.provider === "gemini") defaults.geminiKey = row.key_ciphertext;
        if (row.provider === "openai") defaults.openaiKey = row.key_ciphertext;
        if (row.provider === "groq") defaults.groqKey = row.key_ciphertext;
        if (row.provider === "whatsapp_api") defaults.whatsappApiKey = row.key_ciphertext;
      }
    }
  } catch {}

  return defaults;
}

/**
 * Salva as chaves de API com persistência no Supabase e no localStorage
 */
export async function saveUserApiKeys(
  userId: string,
  tenantId: string,
  keys: Partial<UserApiKeys>
): Promise<UserApiKeys> {
  if (!userId) throw new Error("Usuário não autenticado");

  // Salva no localStorage local
  const current = await loadUserApiKeys(userId, tenantId);
  const updated: UserApiKeys = { ...current, ...keys };

  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(updated));
  } catch {}

  // Salva no banco de dados Supabase para persistência definitiva entre computadores e logins
  if (tenantId) {
    const entries: { provider: string; key: string | undefined }[] = [
      { provider: "google_places", key: keys.googlePlacesKey },
      { provider: "apollo", key: keys.apolloKey },
      { provider: "gemini", key: keys.geminiKey },
      { provider: "openai", key: keys.openaiKey },
      { provider: "groq", key: keys.groqKey },
      { provider: "whatsapp_api", key: keys.whatsappApiKey },
    ];

    for (const item of entries) {
      if (item.key !== undefined) {
        if (item.key.trim() === "") {
          // Remove chave
          try {
            await supabase
              .from("b2b_connections")
              .delete()
              .eq("user_id", userId)
              .eq("tenant_id", tenantId)
              .eq("provider", item.provider);
          } catch {}
        } else {
          // Insere/atualiza chave
          try {
            await supabase.from("b2b_connections").upsert({
              user_id: userId,
              tenant_id: tenantId,
              provider: item.provider,
              key_ciphertext: item.key.trim(),
              connected_at: new Date().toISOString(),
            });
          } catch (e) {
            console.warn("Aviso ao salvar conexão no banco:", e);
          }
        }
      }
    }
  }

  return updated;
}
