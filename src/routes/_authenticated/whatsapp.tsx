import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Clock,
  Settings,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";
import { waSend, waStatus, waTemplates } from "@/lib/whatsapp.functions";
import { toE164 } from "@/lib/whatsapp";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => seo("Conexão WhatsApp", "Status da conexão do WhatsApp Business, automações ativas e disparos."),
  component: WhatsAppPage,
});

function WhatsAppPage() {
  const { leads, tenantId, automationSettings } = useApp();
  const status = useServerFn(waStatus);
  const templates = useServerFn(waTemplates);
  const send = useServerFn(waSend);

  const st = useQuery({ queryKey: ["wa-status"], queryFn: () => status() });
  const tp = useQuery({ queryKey: ["wa-templates"], enabled: !!st.data?.connected, queryFn: () => templates() });

  const [tpl, setTpl] = useState("");
  const [leadId, setLead] = useState("");
  const [params, setParams] = useState("");
  const [busy, setBusy] = useState(false);

  const companyNumber = automationSettings.whatsappNumber || "";
  const cleanCompany = toE164(companyNumber);

  const chosen = tp.data?.templates.find((t) => `${t.name}|${t.language}` === tpl);
  const vars = chosen ? (chosen.body.match(/\{\{\d+\}\}/g) ?? []).length : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Conexão WhatsApp"
        sub="Canal oficial do WhatsApp Business, linha de atendimento e automações ativas."
      />

      {/* Card 1: Linha de Atendimento Configurada */}
      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-base">
                {companyNumber ? companyNumber : "Nenhum número cadastrado ainda"}
              </div>
              <div className="text-xs text-muted-foreground">
                {cleanCompany.length >= 10
                  ? "Linha configurada para atendimento ao cliente e links rápidos"
                  : "Defina o número da empresa nas Configurações"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cleanCompany.length >= 10 && (
              <Button asChild variant="outline" size="sm">
                <a href={`https://wa.me/${cleanCompany}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir conversa
                </a>
              </Button>
            )}
            <Button asChild variant="secondary" size="sm">
              <Link to="/configuracoes">
                <Settings className="mr-1 h-3.5 w-3.5" /> Alterar número
              </Link>
            </Button>
          </div>
        </div>

        {/* Status da Meta Cloud API */}
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {st.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : st.data?.connected ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {st.isPending
                  ? "Verificando Meta Cloud API…"
                  : st.data?.connected
                  ? "Meta Cloud API Conectada"
                  : "Meta Cloud API (Disparos Automáticos de Servidor)"}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => st.refetch()} className="text-xs h-7">
              <RefreshCw className="mr-1 h-3 w-3" /> Atualizar status
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {st.data?.connected
              ? `Linha oficial verificada: ${st.data.number || ""}${st.data.quality ? ` · qualidade ${st.data.quality}` : ""}`
              : "A API da Meta permite disparar modelos aprovados diretamente pelo servidor. Para chats do dia a dia, você pode abrir e responder pelo WhatsApp Web em 1 clique na aba Conversas ou nos cards de cada cliente."}
          </p>
        </div>
      </section>

      {/* Card 2: Automações ativas de WhatsApp */}
      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Automações Ativas de WhatsApp</h2>
          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link to="/configuracoes">Editar regras</Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Boas-Vindas
            </div>
            <p className="text-xs text-muted-foreground">
              {automationSettings.welcomeEnabled ? "🟢 Ativado para novos leads" : "⚪ Desativado"}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
              <Clock className="h-3.5 w-3.5" /> Anti-Vácuo (Round-Robin)
            </div>
            <p className="text-xs text-muted-foreground">
              {automationSettings.antiVacuoEnabled
                ? `🟢 Limite de ${automationSettings.antiVacuoMinutes || 5} min`
                : "⚪ Desativado"}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
              <MessageSquare className="h-3.5 w-3.5" /> Lembrete de Reunião
            </div>
            <p className="text-xs text-muted-foreground">
              {automationSettings.reminderEnabled
                ? `🟢 ${automationSettings.reminderMinutes || 120} min antes`
                : "⚪ Desativado"}
            </p>
          </div>
        </div>
      </section>

      {/* Card 3: Iniciar conversa rápida com clientes */}
      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-base">Conversar com Leads no WhatsApp</h2>
        <p className="text-xs text-muted-foreground">
          Abra uma conversa direta no WhatsApp com qualquer cliente cadastrado no funil.
        </p>

        <div className="space-y-2">
          {leads.filter((l) => l.phone).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum cliente com telefone cadastrado no momento.</p>
          ) : (
            leads
              .filter((l) => l.phone)
              .slice(0, 5)
              .map((l) => {
                const phoneDigits = toE164(l.phone);
                return (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                    <div>
                      <div className="text-sm font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.company ? `${l.company} · ` : ""}
                        {l.phone}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer">
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5 text-green-500" /> Conversar
                      </a>
                    </Button>
                  </div>
                );
              })
          )}
        </div>
      </section>

      {/* Card 4: Disparar modelo aprovado pela Meta (se conectado) */}
      {st.data?.connected && (
        <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-base">Disparar modelo aprovado pela Meta</h2>
          <p className="text-xs text-muted-foreground">
            Para iniciar conversa (ou após 24h sem resposta do cliente) o WhatsApp exige um modelo aprovado pela Meta.
          </p>
          {tp.isPending ? (
            <p className="text-sm">Carregando modelos…</p>
          ) : tp.data?.error ? (
            <p className="text-sm text-destructive">{tp.data.error}</p>
          ) : !tp.data?.templates.length ? (
            <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chosen || !leadId || !tenantId) return;
                setBusy(true);
                try {
                  const r = await send({
                    data: {
                      tenantId,
                      leadId,
                      template: {
                        name: chosen.name,
                        language: chosen.language,
                        params: params ? params.split(";").map((s) => s.trim()) : [],
                      },
                    },
                  });
                  if (r.ok) toast.success("Modelo enviado");
                  else toast.error(r.error ?? "Falha");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={tpl}
                onChange={(e) => setTpl(e.target.value)}
                required
              >
                <option value="">Escolha o modelo…</option>
                {tp.data.templates.map((t) => (
                  <option
                    key={`${t.name}|${t.language}`}
                    value={`${t.name}|${t.language}`}
                    disabled={t.status !== "APPROVED"}
                  >
                    {t.name} ({t.language}) {t.status !== "APPROVED" ? `— ${t.status}` : ""}
                  </option>
                ))}
              </select>
              {chosen && <p className="rounded-md bg-muted p-3 text-sm">{chosen.body}</p>}
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={leadId}
                onChange={(e) => setLead(e.target.value)}
                required
              >
                <option value="">Para qual cliente?</option>
                {leads
                  .filter((l) => l.phone)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.phone}
                    </option>
                  ))}
              </select>
              {vars > 0 && (
                <Input
                  value={params}
                  onChange={(e) => setParams(e.target.value)}
                  placeholder={`${vars} valor(es) separados por ; (preenchem {{1}}, {{2}}…)`}
                  required
                />
              )}
              <Button disabled={busy} className="justify-self-start">
                <Send className="mr-1.5 h-3.5 w-3.5" /> Enviar modelo
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
