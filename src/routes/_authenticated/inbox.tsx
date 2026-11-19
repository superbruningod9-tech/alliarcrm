import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Check,
  CheckCheck,
  Loader2,
  QrCode,
  Send,
  Sparkles,
  ExternalLink,
  Phone,
  MessageSquare,
  PlusCircle,
  User,
  Search,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { aiAssist } from "@/lib/ai.functions";
import { waSend, waReceive } from "@/lib/whatsapp.functions";
import { toE164 } from "@/lib/whatsapp";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () =>
    seo(
      "Conversas WhatsApp",
      "Caixa de entrada integrada ao WhatsApp com histórico persistente no CRM e Copiloto de IA."
    ),
  component: InboxPage,
});

const SNIPPETS = [
  "Oi! Tudo bem? Como posso te ajudar hoje? 😊",
  "Acabei de preparar sua proposta personalizada, segue o link:",
  "Qual seria o melhor dia e horário para alinharmos os detalhes?",
  "Te envio a chave PIX para garantir essas condições exclusivas?",
  "Ficou alguma dúvida sobre o escopo que conversamos?",
];

function InboxPage() {
  const { leads, select, structure, tenantId, refresh } = useApp();
  const qc = useQueryClient();
  const nav = useNavigate();
  const ai = useServerFn(aiAssist);
  const send = useServerFn(waSend);
  const receive = useServerFn(waReceive);

  const [activeId, setActive] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [openInWhatsApp, setOpenInWhatsApp] = useState(true);
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "ai" | "receive">("");

  // Modal para registrar resposta recebida do cliente
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyText, setReplyText] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Filtrar leads
  const filteredLeads = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      (l.phone && l.phone.includes(search)) ||
      (l.company && l.company.toLowerCase().includes(search.toLowerCase()))
  );

  const lead = leads.find((l) => l.id === activeId) ?? filteredLeads[0] ?? leads[0];

  // Buscar mensagens do lead selecionado
  const msgs = useQuery({
    queryKey: ["wa", tenantId, lead?.id],
    enabled: !!lead && !!tenantId,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("lead_id", lead!.id)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Rolagem automática para o final do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.data]);

  // Inscrição Realtime no Supabase para mensagens instantâneas
  useEffect(() => {
    if (!tenantId || !lead?.id) return;
    const channel = supabase
      .channel(`inbox-realtime-${lead.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `lead_id=eq.${lead.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["wa", tenantId, lead.id] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, lead?.id, qc]);

  if (!lead) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Conversas WhatsApp" sub="Atendimento e histórico em tempo real" />
        <div className="rounded-2xl border border-[#E0D5C3] bg-[#FFFDF9] p-12 text-center shadow-xs">
          <MessageSquare className="mx-auto size-12 text-[#C25E38]/50 mb-3" />
          <h3 className="text-lg font-bold text-[#2B2520]">Nenhum cliente cadastrado ainda</h3>
          <p className="text-sm text-[#7A6F62] max-w-md mx-auto mt-1 mb-6">
            Adicione seu primeiro lead pelo Funil de Vendas ou pela aba Contatos com telefone para iniciar conversas.
          </p>
          <Button asChild className="bg-[#C25E38] hover:bg-[#A84F2E] text-white">
            <Link to="/pipeline">Ir para o Funil de Vendas</Link>
          </Button>
        </div>
      </div>
    );
  }

  const cleanPhone = lead.phone ? toE164(lead.phone) : "";

  // Enviar mensagem
  const doSend = async (msgText: string) => {
    if (!msgText.trim() || !tenantId) return;
    setBusy("send");
    try {
      const res = await send({
        data: {
          tenantId,
          leadId: lead.id,
          text: msgText.trim(),
        },
      });

      if (!res.ok) {
        toast.error(res.error || "Não foi possível enviar");
        return;
      }

      setText("");
      toast.success("Mensagem salva e sincronizada no CRM!");
      await qc.invalidateQueries({ queryKey: ["wa", tenantId, lead.id] });
      void refresh();

      // Abrir no WhatsApp Web caso solicitado
      if (openInWhatsApp && cleanPhone) {
        const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(
          msgText.trim()
        )}`;
        window.open(waLink, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no envio");
    } finally {
      setBusy("");
    }
  };

  // Registrar resposta recebida do cliente
  const handleSaveClientReply = async () => {
    if (!replyText.trim() || !tenantId) return;
    setBusy("receive");
    try {
      const res = await receive({
        data: {
          tenantId,
          leadId: lead.id,
          text: replyText.trim(),
        },
      });
      if (res.ok) {
        toast.success("Resposta do cliente registrada no histórico!");
        setReplyText("");
        setReplyDialogOpen(false);
        await qc.invalidateQueries({ queryKey: ["wa", tenantId, lead.id] });
        void refresh();
      }
    } finally {
      setBusy("");
    }
  };

  // Copiloto IA de sugestão de resposta
  const suggest = async () => {
    setBusy("ai");
    try {
      const history = (msgs.data ?? []).slice(-20).map((m) => ({
        role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
        content: m.body,
      }));
      const r = await ai({
        data: {
          task: "copilot",
          context: `Cliente: ${lead.name}, empresa ${lead.company || "não informada"}, valor R$ ${lead.value}, etapa ${lead.stage}, histórico de notas: ${lead.timeline.slice(-3).map((e) => e.text).join(" | ")}.`,
          messages: history.length
            ? history
            : [{ role: "user", content: "Ainda não há mensagens trocadas. Sugira uma abordagem consultiva de alta conversão para o WhatsApp." }],
        },
      });
      if (r.error) toast.error(r.error);
      else setTip(r.text);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conversas WhatsApp"
        sub={
          structure === "equipe"
            ? "Atendimento compartilhado e histórico centralizado de clientes"
            : "Central de atendimento inteligente e sincronizada com WhatsApp"
        }
      >
        <div className="flex items-center gap-2">
          {cleanPhone && (
            <Button asChild size="sm" variant="outline" className="text-xs border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10">
              <a href={`https://wa.me/${cleanPhone}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 size-3.5" /> Abrir no WhatsApp Web
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="secondary" className="text-xs">
            <Link to="/whatsapp">Configurar Linha</Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 overflow-hidden rounded-2xl border border-[#E0D5C3] bg-[#FFFDF9] shadow-sm md:grid-cols-[280px_1fr_300px]">
        {/* COLUNA ESQUERDA: LISTA DE CLIENTES */}
        <div className="flex flex-col border-r border-[#EAE2D5] bg-[#FBF9F5]">
          <div className="p-3 border-b border-[#EAE2D5]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente ou telefone…"
                className="pl-8 h-9 text-xs bg-white rounded-lg border-[#DED4C5]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#EAE2D5]">
            {filteredLeads.map((l) => {
              const isSelected = lead.id === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    setActive(l.id);
                    setTip("");
                  }}
                  className={cn(
                    "w-full p-3 text-left transition-colors flex items-start gap-3 hover:bg-[#F3EDE2]",
                    isSelected && "bg-[#EFE8DC] font-medium"
                  )}
                >
                  <div className="size-8 rounded-full bg-[#C25E38]/15 text-[#C25E38] font-bold text-xs grid place-items-center shrink-0 mt-0.5">
                    {l.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs font-semibold text-[#2B2520]">
                        {l.name}
                      </span>
                      {l.temp && (
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase",
                            l.temp === "quente"
                              ? "bg-rose-100 text-rose-700"
                              : l.temp === "morno"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {l.temp}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-[#7A6F62]">
                      {l.company || "Sem empresa"}
                    </div>
                    <div className="truncate text-[10px] font-mono text-[#9C9082]">
                      {l.phone || "Sem telefone"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* COLUNA CENTRAL: CHAT EM TEMPO REAL */}
        <div className="flex flex-col min-h-0 bg-[#FAF7F2]">
          {/* TOPO DO CHAT */}
          <div className="flex items-center justify-between border-b border-[#EAE2D5] bg-white px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-[#166534]/15 text-[#166534] font-bold text-sm grid place-items-center">
                {lead.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <button
                  onClick={() => select(lead.id)}
                  className="text-sm font-bold text-[#2B2520] hover:text-[#C25E38] flex items-center gap-1.5"
                >
                  {lead.name}
                </button>
                <div className="text-[11px] text-[#7A6F62] flex items-center gap-2">
                  <span>{lead.phone || "Telefone não cadastrado"}</span>
                  {lead.company && <span>· {lead.company}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Registrar resposta do cliente */}
              <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-xs h-8 border-[#DED4C5]">
                    <PlusCircle className="mr-1 size-3.5 text-[#166534]" /> + Resposta do Cliente
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registrar resposta recebida de {lead.name}</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-muted-foreground">
                    Cole ou digite o que o cliente enviou no WhatsApp para manter o histórico 100% completo e alimentar o Copiloto de IA:
                  </p>
                  <Textarea
                    rows={4}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Ex: 'Gostei da proposta, podemos assinar amanhã às 10h'..."
                  />
                  <DialogFooter>
                    <Button
                      onClick={handleSaveClientReply}
                      disabled={busy === "receive" || !replyText.trim()}
                      className="bg-[#166534] text-white hover:bg-[#114B26]"
                    >
                      {busy === "receive" ? "Salvando…" : "Salvar no Histórico"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Ligar no discador */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 border-[#DED4C5]"
                onClick={() => void nav({ to: "/dialer" })}
              >
                <Phone className="mr-1 size-3.5 text-[#C25E38]" /> Discador
              </Button>

              {/* Enviar proposta / PIX */}
              <Button
                size="sm"
                className="text-xs h-8 bg-[#C25E38] hover:bg-[#A84F2E] text-white"
                onClick={() => {
                  select(lead.id);
                  setTimeout(() => window.dispatchEvent(new Event("alliar:pix")), 50);
                }}
              >
                <QrCode className="mr-1 size-3.5" /> Enviar PIX
              </Button>
            </div>
          </div>

          {/* MENSAGENS */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.isPending ? (
              <div className="py-20 text-center">
                <Loader2 className="mx-auto size-6 animate-spin text-[#C25E38]" />
                <p className="mt-2 text-xs text-[#7A6F62]">Carregando conversas do cliente…</p>
              </div>
            ) : !msgs.data?.length ? (
              <div className="py-16 text-center max-w-sm mx-auto space-y-3">
                <div className="size-12 rounded-full bg-[#EFE8DC] text-[#C25E38] grid place-items-center mx-auto">
                  <MessageSquare className="size-6" />
                </div>
                <h4 className="text-sm font-bold text-[#2B2520]">Nenhuma mensagem registrada ainda</h4>
                <p className="text-xs text-[#7A6F62] leading-relaxed">
                  Digite sua mensagem abaixo para registrar no sistema e abrir diretamente no WhatsApp de <strong>{lead.name}</strong>.
                </p>
              </div>
            ) : (
              msgs.data.map((m) => {
                const isOut = m.direction === "out";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[80%] rounded-2xl p-3.5 shadow-2xs text-xs sm:text-sm leading-relaxed transition-all",
                      isOut
                        ? "ml-auto bg-[#E7F8EE] border border-[#B9EAC8] text-[#134E27] rounded-tr-xs"
                        : "mr-auto bg-white border border-[#E7DED0] text-[#2B2520] rounded-tl-xs"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div
                      className={cn(
                        "mt-1.5 flex items-center gap-1.5 text-[10px]",
                        isOut ? "justify-end text-[#166534]/70" : "text-[#7A6F62]"
                      )}
                    >
                      <span>
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isOut && (
                        <span title={m.status}>
                          {m.status === "read" ? (
                            <CheckCheck className="size-3.5 text-blue-500" />
                          ) : m.status === "delivered" || m.status === "sent" ? (
                            <CheckCheck className="size-3.5 text-emerald-600" />
                          ) : (
                            <Check className="size-3.5 text-stone-500" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ATALHOS RÁPIDOS */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-[#EAE2D5] bg-white px-3 py-2">
            {SNIPPETS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(s)}
                className="shrink-0 rounded-full border border-[#E0D5C3] bg-[#F7F3EB] px-2.5 py-1 text-[11px] text-[#554D43] hover:bg-[#EFE8DC] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {/* BARRA DE ENVIO */}
          <form
            className="border-t border-[#EAE2D5] bg-white p-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void doSend(text);
            }}
          >
            <div className="flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Mensagem para ${lead.name}…`}
                maxLength={4000}
                className="h-10 text-xs sm:text-sm bg-[#FBF9F5] border-[#DED4C5] rounded-xl focus:border-[#C25E38]"
              />
              <Button
                type="submit"
                disabled={busy === "send" || !text.trim()}
                className="h-10 px-4 rounded-xl bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold cursor-pointer disabled:opacity-50"
              >
                {busy === "send" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Send className="size-4 mr-1.5" /> Enviar
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#7A6F62] px-1">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={openInWhatsApp}
                  onChange={(e) => setOpenInWhatsApp(e.target.checked)}
                  className="rounded border-[#DED4C5] text-[#166534] focus:ring-[#166534]"
                />
                <span>Abrir WhatsApp Web automaticamente ao enviar</span>
              </label>

              <span className="text-[10px] text-[#9C9082]">
                As mensagens são registradas permanentemente no histórico do CRM.
              </span>
            </div>
          </form>
        </div>

        {/* COLUNA DIREITA: COPILOTO IA E FICHA RÁPIDA */}
        <aside className="flex flex-col border-l border-[#EAE2D5] bg-[#FBF9F5] p-4 space-y-4 overflow-y-auto">
          {/* COPILOTO IA */}
          <div className="rounded-xl border border-[#E0D5C3] bg-white p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C25E38]">
              <Bot className="size-4 text-[#C25E38]" /> Copiloto IA de Vendas
            </div>
            <p className="text-xs text-[#7A6F62] leading-relaxed">
              Analisa a conversa e sugere respostas perspicazes para quebrar objeções e avançar a venda.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={suggest}
              disabled={busy === "ai"}
              className="w-full text-xs border-[#C25E38]/30 text-[#C25E38] hover:bg-[#C25E38]/10"
            >
              {busy === "ai" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              Sugerir Resposta
            </Button>

            {tip && (
              <div className="mt-2 space-y-2">
                <div className="whitespace-pre-wrap rounded-lg bg-[#F7F3EB] p-3 text-xs text-[#2B2520] border border-[#E0D5C3]">
                  {tip}
                </div>
                <Button
                  size="sm"
                  onClick={() => setText(tip)}
                  className="w-full text-xs bg-[#C25E38] hover:bg-[#A84F2E] text-white"
                >
                  Inserir no chat
                </Button>
              </div>
            )}
          </div>

          {/* DADOS DO CLIENTE */}
          <div className="rounded-xl border border-[#EAE2D5] bg-white p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#554D43]">
                Ficha do Negócio
              </span>
              <button
                onClick={() => select(lead.id)}
                className="text-[11px] font-bold text-[#C25E38] hover:underline"
              >
                Abrir Completa
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[#9C9082] block text-[10px]">Valor da Negociação</span>
                <span className="font-bold text-[#166534] text-sm">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(lead.value || 0)}
                </span>
              </div>

              <div>
                <span className="text-[#9C9082] block text-[10px]">Etapa do Funil</span>
                <span className="font-semibold text-[#2B2520] capitalize">
                  {lead.stage}
                </span>
              </div>

              <div>
                <span className="text-[#9C9082] block text-[10px]">Telefone Principal</span>
                <span className="font-mono text-[#2B2520]">{lead.phone || "Não informado"}</span>
              </div>

              {lead.company && (
                <div>
                  <span className="text-[#9C9082] block text-[10px]">Empresa</span>
                  <span className="font-semibold text-[#2B2520]">{lead.company}</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#EAE2D5]">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full text-xs border-[#DED4C5]"
              >
                <Link to="/pipeline">Ver no Funil</Link>
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
