import { useState, useRef, useEffect, useMemo } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Copy,
  Check,
  Bot,
  User,
  ArrowRight,
  Zap,
  HelpCircle,
  MessageSquare,
  Building2,
  Minimize2,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useApp, type Lead, type Stage } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { loadUserApiKeys, type UserApiKeys } from "@/lib/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
  actionExecuted?: string;
  suggestedAction?: {
    type: "create_lead" | "move_stage" | "add_note";
    payload: any;
  };
}

export function AiCopilot({ activePath }: { activePath?: string }) {
  const { user } = useAuth();
  const app = useApp();

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userKeys, setUserKeys] = useState<UserApiKeys>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carrega chaves salvas do usuário
  useEffect(() => {
    if (user?.id) {
      void loadUserApiKeys(user.id, app.tenantId ?? "").then(setUserKeys);
    }
  }, [user?.id, app.tenantId, open]);

  // Mensagens iniciais de boas-vindas do Copiloto
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome-1",
      sender: "copilot",
      text: "Olá! Sou seu Copiloto de Vendas com IA na Alliar. 👋\n\nPosso te ajudar a:\n• ✍️ Criar mensagens persuasivas para WhatsApp\n• 🎯 Sugerir o próximo passo para fechar um lead\n• ➕ Executar ações no CRM (ex: *\"Criar lead Dr. Carlos da Clínica Sorriso, tel 11999998888\"*)\n• ❓ Tirar qualquer dúvida sobre o sistema e APIs.",
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  // Rola até o final das mensagens
  useEffect(() => {
    if (open && !minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimized]);

  // Identifica o modelo de IA ativo
  const activeAiModel = useMemo(() => {
    if (userKeys.geminiKey) return { name: "Google Gemini", type: "byok" };
    if (userKeys.openaiKey) return { name: "OpenAI GPT-4o", type: "byok" };
    if (userKeys.groqKey) return { name: "Groq Llama 3", type: "byok" };
    return { name: "Alliar Sales Engine", type: "built_in" };
  }, [userKeys]);

  // Execução de IA usando a API configurada pelo usuário (ou inteligência nativa)
  async function generateAiResponse(prompt: string, context: string): Promise<string> {
    const systemPrompt = `Você é o Copiloto de Vendas com IA do Alliar CRM.
Seu objetivo é ajudar o vendedor/empresa a vender mais pelo WhatsApp, negociar melhor, tirar dúvidas e organizar o funil.
Responda sempre em Português do Brasil com tom profissional, encorajador, prático e objetivo.
Quando sugerir mensagens para WhatsApp, coloque-as prontas para envio com emojis adequados e sem enrolação.
Contexto atual da plataforma:
${context}`;

    // 1. Google Gemini (se configurada pelo usuário)
    if (userKeys.geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userKeys.geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${systemPrompt}\n\nPergunta do Vendedor:\n${prompt}` }],
                },
              ],
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) return reply;
        }
      } catch (e) {
        console.warn("Erro ao chamar Gemini:", e);
      }
    }

    // 2. OpenAI (se configurada pelo usuário)
    if (userKeys.openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userKeys.openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) return reply;
        }
      } catch (e) {
        console.warn("Erro ao chamar OpenAI:", e);
      }
    }

    // 3. Groq (se configurada pelo usuário)
    if (userKeys.groqKey) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userKeys.groqKey}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) return reply;
        }
      } catch (e) {
        console.warn("Erro ao chamar Groq:", e);
      }
    }

    // 4. Mecanismo Inteligente Nativo do Alliar (quando ainda sem chave de IA externa)
    const p = prompt.toLowerCase();

    // Dúvidas sobre prospecção e APIs
    if (p.includes("api") || p.includes("google places") || p.includes("chave") || p.includes("maps")) {
      return `🔑 **Como configurar suas Chaves de API na Alliar:**\n\n1. Acesse **Configurações > Canais & APIs** no menu lateral;\n2. **Para Prospecção B2B (Google Maps):** pegue sua chave gratuita no *Google Cloud Console* (o Google dá $200 dólares/mês grátis);\n3. **Para Inteligência Artificial:** você pode usar o *Google Gemini* (100% gratuito no Google AI Studio) ou *OpenAI*;\n4. **Para CNPJ:** a Receita Federal (BrasilAPI) já está 100% integrada e gratuita, não precisa de nenhuma chave!\n\nCole a chave e clique em Salvar. Ela fica salva com segurança na sua conta.`;
    }

    // Mensagem de WhatsApp persuasiva
    if (p.includes("whatsapp") || p.includes("mensagem") || p.includes("abordagem") || p.includes("texto")) {
      return `Aqui está um roteiro persuasivo de alta conversão para você enviar pelo WhatsApp:\n\n---\n*Olá, {{nome}}! Tudo bem?*\n\nMe chamo ${app.userName} e falo aqui da ${app.tenants.find((t) => t.id === app.tenantId)?.name || "nossa empresa"}.\n\nVi que você tem interesse em soluções para otimizar suas operações comerciais e gostaria de compartilhar uma prévia exclusiva que preparamos para o seu perfil.\n\nVocê teria 5 minutinhos hoje à tarde ou amanhã de manhã para eu te mostrar como funciona?\n---\n\n💡 *Dica do Copiloto:* Sempre termine sua mensagem com uma pergunta fechada de duas opções (ex: "hoje à tarde ou amanhã?") para aumentar a taxa de resposta em até 40%!`;
    }

    // Como fechar venda / próximo passo
    if (p.includes("fechar") || p.includes("objeção") || p.includes("caro") || p.includes("desconto")) {
      return `🎯 **Como contornar a objeção "Está caro":**\n\n1. **Nunca discorde do cliente:** Diga: *"Entendo perfeitamente sua preocupação com o investimento..."*\n2. **Isole a objeção:** *"Fora a questão do valor, a nossa solução atende exatamente o que você precisa?"*\n3. **Mostre o Retorno (ROI):** Explique quanto ele deixa de faturar ou quanto tempo perde todo mês sem a solução;\n4. **Facilite a decisão:** Ofereça parcelamento no PIX ou entrada + condições especiais se fechar hoje.`;
    }

    // Resumo de funcionalidades
    if (p.includes("funil") || p.includes("lead") || p.includes("anti-vácuo") || p.includes("etapas")) {
      return `📊 **Como funciona o Funil de Vendas Alliar:**\n\n• **Novos:** Leads recém-chegados. Se você estiver no Modo Equipe, a regra *Anti-Vácuo de 5 minutos* garante que nenhum cliente fique sem resposta!\n• **Em contato:** Quando você já iniciou a conversa pelo WhatsApp ou ligação.\n• **Proposta enviada:** Gere sua proposta com QR Code PIX embutido com 1 clique.\n• **Negociação:** Ajuste valores e condições.\n• **Ganho:** Cliente pagou! O sistema comemora com som animado e já abre a área de Pós-Venda.`;
    }

    // Resposta padrão
    return `Entendido! Posso te ajudar a elaborar mensagens personalizadas de vendas, contornar objeções de clientes, resumir contatos do B2B ou cadastrar novos leads diretamente no funil.\n\nExperimente me pedir:\n• *"Crie uma mensagem de follow-up para cliente que sumiu"*\n• *"Criar lead Clínica São Bento tel 11988887777 valor 3500"*\n• *"Como ativar o Google Maps no B2B?"*`;
  }

  // Tenta interpretar comandos de ação em linguagem natural no CRM
  function tryExecuteCrmCommand(text: string): { ok: boolean; message?: string } {
    const t = text.trim();
    const lower = t.toLowerCase();

    // Comando: Criar lead [Nome] [Empresa] [Telefone] [Valor]
    // Ex: "criar lead Carlos da Clínica Sorriso tel 11999998888 valor 4000"
    if (lower.startsWith("criar lead") || lower.startsWith("adicionar lead") || lower.startsWith("novo lead")) {
      // Extrai informações básicas
      const nameMatch = t.match(/(?:lead|adicionar|novo)\s+([^,]+?)(?:\s+da|\s+empresa|\s+tel|\s+telefone|\s+valor|$)/i);
      const companyMatch = t.match(/(?:empresa|da)\s+([^,]+?)(?:\s+tel|\s+telefone|\s+valor|$)/i);
      const phoneMatch = t.match(/(?:tel|telefone|celular|whats|whatsapp)\s*[:=]?\s*(\d[\d\s\-()]+)/i);
      const valueMatch = t.match(/(?:valor|r\$)\s*[:=]?\s*(\d+)/i);

      const leadName = nameMatch ? nameMatch[1]!.trim() : "Novo Contato";
      const leadCompany = companyMatch ? companyMatch[1]!.trim() : leadName;
      const leadPhone = phoneMatch ? phoneMatch[1]!.replace(/\D/g, "") : "";
      const leadValue = valueMatch ? Number(valueMatch[1]) : 1500;

      void app.addLead({
        name: leadName,
        company: leadCompany,
        phone: leadPhone,
        value: leadValue,
        stage: "novo",
        temp: "quente",
        priority: "alta",
      });

      return {
        ok: true,
        message: `✅ **Lead criado com sucesso no seu funil!**\n\n• **Nome:** ${leadName}\n• **Empresa:** ${leadCompany}\n• **Telefone:** ${leadPhone || "Não informado"}\n• **Valor:** R$ ${leadValue.toLocaleString("pt-BR")}\n• **Etapa:** Novos`,
      };
    }

    return { ok: false };
  }

  // Enviar mensagem
  async function handleSend() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);

    try {
      // 1. Verifica se é um comando rápido do CRM
      const actionResult = tryExecuteCrmCommand(userText);
      if (actionResult.ok && actionResult.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `reply-${Date.now()}`,
            sender: "copilot",
            text: actionResult.message!,
            timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        toast.success("Ação executada no CRM!");
        return;
      }

      // 2. Chama a IA
      const context = `Página atual: ${activePath || "CRM"}; Leads no funil: ${app.leads.length}; Empresa ativa: ${
        app.tenants.find((t) => t.id === app.tenantId)?.name || "Alliar"
      }; Modo: ${app.structure}; Vendedor: ${app.userName}`;

      const reply = await generateAiResponse(userText, context);

      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          sender: "copilot",
          text: reply,
          timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "copilot",
          text: "Desculpe, tive uma instabilidade momentânea ao processar sua pergunta. Pode tentar novamente em instantes?",
          timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const handleCopyText = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Mensagem copiada para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <>
      {/* BOTÃO FLUTUANTE DISCRETO (CANTO INFERIOR DIREITO) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/95 px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-primary hover:shadow-xl active:scale-95"
          title="Abrir Copiloto de IA"
        >
          <div className="grid size-5 place-items-center rounded-full bg-white/20">
            <Sparkles className="size-3 text-white animate-pulse" />
          </div>
          <span>Copiloto IA</span>
          <span className="flex size-2 rounded-full bg-emerald-400" />
        </button>
      )}

      {/* PAINEL LATERAL DE CHAT ELEGANTE */}
      {open && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 flex flex-col rounded-2xl border border-border/80 bg-card shadow-2xl backdrop-blur-xl transition-all duration-200",
            minimized ? "h-14 w-80" : "h-[540px] w-96 max-w-[calc(100vw-24px)]"
          )}
        >
          {/* CABEÇALHO DO CHAT */}
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30 rounded-t-2xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-xs text-foreground truncate">Copiloto Alliar IA</h3>
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-600">
                    Online
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{activeAiModel.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-lg text-muted-foreground"
                onClick={() => setMinimized(!minimized)}
                title={minimized ? "Expandir" : "Minimizar"}
              >
                {minimized ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-lg text-muted-foreground hover:text-destructive"
                onClick={() => setOpen(false)}
                title="Fechar Copiloto"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* CORPO DO CHAT (SE NÃO MINIMIZADO) */}
          {!minimized && (
            <>
              {/* LISTA DE MENSAGENS */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
                {messages.map((m) => {
                  const isCopilot = m.sender === "copilot";
                  return (
                    <div
                      key={m.id}
                      className={cn("flex flex-col gap-1 max-w-[88%]", isCopilot ? "mr-auto" : "ml-auto items-end")}
                    >
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap break-words",
                          isCopilot
                            ? "bg-muted/60 text-foreground border border-border/40"
                            : "bg-primary text-primary-foreground font-medium shadow-sm"
                        )}
                      >
                        {m.text}

                        {/* Botão de cópia caso a mensagem pareça um template de WhatsApp */}
                        {isCopilot && (m.text.includes("---") || m.text.includes("Olá")) && (
                          <div className="mt-2 pt-2 border-t border-border/40 flex justify-end">
                            <button
                              onClick={() => handleCopyText(m.text, m.id)}
                              className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                            >
                              {copiedId === m.id ? (
                                <>
                                  <Check className="size-3 text-emerald-500" /> Copiado!
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3" /> Copiar mensagem
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground px-1">{m.timestamp}</span>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex items-center gap-2 rounded-2xl bg-muted/40 p-3 text-muted-foreground text-xs mr-auto">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    <span>Copiloto pensando…</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ATALHOS RÁPIDOS SUGERIDOS */}
              <div className="border-t px-3 py-2 bg-muted/20 flex flex-wrap gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setInput("Sugerir mensagem para cliente no WhatsApp")}
                  className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                >
                  💬 Mensagem WhatsApp
                </button>
                <button
                  onClick={() => setInput("Como contornar a objeção 'está caro'?")}
                  className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                >
                  💡 Objeção: Tá caro
                </button>
                <button
                  onClick={() => setInput("Criar lead Dr. Ricardo da Clínica Vital tel 11988887777 valor 3500")}
                  className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                >
                  ➕ Criar lead rápido
                </button>
                <button
                  onClick={() => setInput("Como configurar minha chave de API do Google Maps?")}
                  className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                >
                  🔑 Ajuda com APIs
                </button>
              </div>

              {/* INPUT DE MENSAGEM */}
              <div className="border-t p-3 bg-card rounded-b-2xl">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Peça uma mensagem, ação ou tire dúvidas…"
                    className="text-xs h-9 rounded-xl"
                    disabled={loading}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={loading || !input.trim()}
                    className="h-9 px-3 rounded-xl gap-1 shrink-0"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
