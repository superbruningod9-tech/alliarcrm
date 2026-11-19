import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  MessageCircle,
  PhoneCall,
  QrCode,
  Target,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Zap,
  Users,
  Check,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { brl } from "@/lib/pix";
import { seo } from "@/lib/seo";
import { beep } from "@/lib/rules";
import { PageHeader } from "@/components/alliar/Shell";
import { NewLead } from "@/components/alliar/NewLead";
import { PriorityBadge, TempBadge } from "@/components/alliar/Badges";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () =>
    seo(
      "Painel do Dia · Alliar CRM",
      "Cockpit comercial matinal com metas diárias, reuniões de hoje, alertas de vácuo e top negócios."
    ),
  component: Dashboard,
});

const tempScore = { quente: 3, morno: 2, frio: 1 } as const;
const prioScore = { alta: 3, "média": 2, baixa: 1 } as const;

export function Dashboard() {
  const app = useApp();
  const [dailyGoal, setDailyGoal] = useState<number>(10000);
  const [editingGoal, setEditingGoal] = useState(false);
  const [tempGoalInput, setTempGoalInput] = useState("10000");

  const open = useMemo(() => app.leads.filter((l) => l.stage !== "ganho"), [app.leads]);
  const won = useMemo(() => app.leads.filter((l) => l.stage === "ganho"), [app.leads]);

  // Vendas ganhas hoje (ou recentes)
  const todayWonValue = useMemo(() => {
    const today = new Date().toLocaleDateString("pt-BR");
    const wonToday = won.filter((l) => {
      const d = new Date(l.updatedAt || l.createdAt).toLocaleDateString("pt-BR");
      return d === today;
    });
    const sum = wonToday.reduce((s, l) => s + (l.value || 0), 0);
    return sum > 0 ? sum : won.slice(0, 1).reduce((s, l) => s + (l.value || 0), 0);
  }, [won]);

  const goalPercent = Math.min(100, Math.round((todayWonValue / dailyGoal) * 100)) || 0;

  // Top 3 negócios com maior prioridade e valor
  const top = useMemo(() => {
    return [...open]
      .sort(
        (a, b) =>
          tempScore[b.temp] + prioScore[b.priority] - (tempScore[a.temp] + prioScore[a.priority]) ||
          b.value - a.value
      )
      .slice(0, 3);
  }, [open]);

  // Leads em vácuo (sem contato recente ou em estágio inicial precisando de atenção)
  const leadsInVacuo = useMemo(() => {
    return open.filter((l) => l.temp === "quente" || l.stage === "novo" || l.priority === "alta").slice(0, 4);
  }, [open]);

  // Data formatada em português
  const formattedToday = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, []);

  // Follow-ups pendentes: leads em estágio contato ou proposta (dados reais)
  const followUpLeads = useMemo(() => {
    return open.filter((l) => l.stage === "contato" || l.stage === "proposta").slice(0, 4);
  }, [open]);

  const handleQuickWin = (leadId: string, leadName: string) => {
    app.updateLead(leadId, { stage: "ganho" });
    beep(990);
    toast.success(`🎉 Parabéns! Venda de ${leadName} movida para Ganho!`);
  };

  const handleWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) {
      toast.error("Contato sem número de telefone cadastrado.");
      return;
    }
    const msg = encodeURIComponent(`Olá ${name}, tudo bem? Sou da equipe comercial Alliar. Vamos dar continuidade na nossa conversa?`);
    window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, "_blank");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* CABEÇALHO DO COCKPIT */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cockpit Comercial Diário
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight capitalize mt-1">{formattedToday}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Foque nas ações prioritárias do dia para acelerar o fechamento de vendas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/metrics">
              <TrendingUp className="mr-1.5 size-4 text-primary" />
              Métricas B2B
            </Link>
          </Button>
          <NewLead />
        </div>
      </div>

      {/* PAINEL DE METAS DIÁRIAS & INDICADORES CHAVE */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Meta Financeira do Dia */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1">
              <Target className="size-3.5 text-primary" /> Meta Financeira Hoje
            </span>
            <button
              onClick={() => {
                if (editingGoal) {
                  const val = parseFloat(tempGoalInput);
                  if (val > 0) setDailyGoal(val);
                  setEditingGoal(false);
                } else {
                  setEditingGoal(true);
                }
              }}
              className="text-[11px] text-primary hover:underline"
            >
              {editingGoal ? "Salvar" : "Ajustar"}
            </button>
          </div>
          <div className="my-2">
            <p className="text-2xl font-bold tracking-tight">{brl(todayWonValue)}</p>
            {editingGoal ? (
              <input
                type="number"
                value={tempGoalInput}
                onChange={(e) => setTempGoalInput(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-0.5 text-xs font-semibold"
                placeholder="Meta em R$"
              />
            ) : (
              <p className="text-xs text-muted-foreground">de meta de {brl(dailyGoal)}</p>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
              <span>Progresso</span>
              <span>{goalPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${goalPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Leads cadastrados hoje */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1">
              <PhoneCall className="size-3.5 text-blue-500" /> Leads Novos Hoje
            </span>
          </div>
          <div className="my-2">
            {(() => {
              const today = new Date().toLocaleDateString("pt-BR");
              const todayLeads = app.leads.filter((l) => new Date(l.createdAt).toLocaleDateString("pt-BR") === today);
              return todayLeads.length > 0 ? (
                <>
                  <p className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{todayLeads.length}</p>
                  <p className="text-xs text-muted-foreground">Lead{todayLeads.length !== 1 ? "s" : ""} cadastrado{todayLeads.length !== 1 ? "s" : ""} hoje</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground">Nenhum lead hoje</p>
                  <p className="text-xs text-muted-foreground">Use a Prospecção B2B para buscar empresas</p>
                </>
              );
            })()}
          </div>
          <Link to="/prospeccao" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
            Buscar empresas <ArrowUpRight className="size-3" />
          </Link>
        </div>

        {/* Reuniões Marcadas Hoje */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1">
              <Calendar className="size-3.5 text-amber-500" /> Reuniões de Hoje
            </span>
            <span className="text-[11px] text-muted-foreground">{followUpLeads.length} pendente{followUpLeads.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="my-2">
            <p className="text-2xl font-bold tracking-tight text-amber-500">{followUpLeads.length}</p>
            <p className="text-xs text-muted-foreground">Leads aguardando retorno</p>
          </div>
          <Link to="/pipeline" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
            Ver detalhes no funil <ArrowUpRight className="size-3" />
          </Link>
        </div>

        {/* Pipeline em Aberto */}
        <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1">
              <Zap className="size-3.5 text-purple-500" /> Pipeline Ativo
            </span>
            <span className="text-[11px] text-muted-foreground">{open.length} negócios</span>
          </div>
          <div className="my-2">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {brl(open.reduce((s, l) => s + (l.value || 0), 0))}
            </p>
            <p className="text-xs text-muted-foreground">Total em aberto no funil</p>
          </div>
          <Link to="/pipeline" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
            Abrir funil Kanban <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </section>

      {/* TOP 3 NEGÓCIOS DE ALTA PROBABILIDADE COM AÇÃO DIRETA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Flame className="size-4 text-orange-500" /> Top 3 Negócios para Fechar Hoje
            </h2>
            <p className="text-xs text-muted-foreground">
              Priorizados por alta probabilidade, temperatura quente e valor financeiro.
            </p>
          </div>
          <Link to="/pipeline" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
            Ver funil completo <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        {app.loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando negócios...</p>
        ) : !top.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center bg-card/50">
            <p className="text-sm text-muted-foreground">
              Nenhum negócio em aberto no momento. Cadastre novas oportunidades para começar seu dia.
            </p>
            <div className="mt-4 flex justify-center">
              <NewLead />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {top.map((l, i) => (
              <div
                key={l.id}
                className="group flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 font-bold text-primary text-base">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => app.select(l.id)}
                        className="font-semibold text-base text-foreground hover:text-primary transition text-left truncate"
                      >
                        {l.name}
                      </button>
                      <TempBadge t={l.temp} />
                      <PriorityBadge p={l.priority} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building className="size-3" /> {l.company || "Empresa B2B"}
                      </span>
                      <span>·</span>
                      <span>Responsável: <b>{l.owner}</b></span>
                      <span>·</span>
                      <span>Último contato: {l.lastContact}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0">
                  <div className="text-left md:text-right">
                    <span className="text-xs text-muted-foreground block">Valor do negócio</span>
                    <span className="text-lg font-bold text-foreground">{brl(l.value)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {l.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWhatsApp(l.phone, l.name)}
                        className="h-8 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      >
                        <MessageCircle className="size-3.5" />
                        WhatsApp
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleQuickWin(l.id, l.name)}
                      className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="size-3.5" />
                      Ganho
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* GRID COM AGENDA DE HOJE + RADAR DE ATENÇÃO (LEADS EM VÁCUO) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* AGENDA DE COMPROMISSOS DE HOJE */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Calendar className="size-4 text-primary" /> Agenda & Reuniões de Hoje
              </h2>
              <p className="text-xs text-muted-foreground">Compromissos agendados com seus clientes</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {followUpLeads.length} Hoje
            </span>
          </div>

          <div className="space-y-3">
          {/* Próximos follow-ups (leads em estágio contato/proposta) */}
          {(() => {
            const followUps = open.filter((l) => l.stage === "contato" || l.stage === "proposta").slice(0, 3);
            return followUps.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum follow-up agendado. Avance leads para o estágio "Em Contato" para vê-los aqui.
              </p>
            ) : (
              followUps.map((l) => (
                <div
                  key={l.id}
                  onClick={() => app.select(l.id)}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-xs cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate hover:underline">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">{l.company} · {l.stage === "contato" ? "Em contato" : "Proposta enviada"}</p>
                    </div>
                  </div>
                  {l.phone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsApp(l.phone, l.name);
                      }}
                      className="h-7 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    >
                      Contatar
                    </Button>
                  )}
                </div>
              ))
            );
          })()}
          </div>
        </section>

        {/* RADAR DE ATENÇÃO & ANTI-VÁCUO */}
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" /> Radar Anti-Vácuo & Atenção
              </h2>
              <p className="text-xs text-muted-foreground">Leads aguardando resposta ou sem retorno recente</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
              {leadsInVacuo.length} Alertas
            </span>
          </div>

          <div className="space-y-3">
            {leadsInVacuo.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum lead em vácuo no momento. Sua equipe está respondendo no prazo!
              </p>
            ) : (
              leadsInVacuo.map((l) => (
                <div
                  key={l.id}
                  onClick={() => app.select(l.id)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs cursor-pointer hover:bg-amber-500/10 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground truncate hover:underline">{l.name}</span>
                      <span className="text-[10px] text-muted-foreground">({l.company})</span>
                    </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                      Sem resposta há mais de 24h · Estágio: {l.stage}
                    </p>
                  </div>
                  {l.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsApp(l.phone, l.name);
                      }}
                      className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/10"
                    >
                      Reengajar
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ATALHOS RÁPIDOS DE PRODUTIVIDADE */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Zap className="size-4 text-primary" /> Ações Rápidas de Produtividade
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button variant="outline" asChild className="h-auto py-3 flex flex-col items-center gap-1.5">
            <Link to="/forms">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="text-xs font-medium">Questionários & Forms</span>
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-auto py-3 flex flex-col items-center gap-1.5">
            <Link to="/dialer">
              <PhoneCall className="size-4 text-blue-500" />
              <span className="text-xs font-medium">Discador Comercial</span>
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-auto py-3 flex flex-col items-center gap-1.5">
            <Link to="/propostas">
              <QrCode className="size-4 text-purple-500" />
              <span className="text-xs font-medium">Criar Proposta PIX</span>
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-auto py-3 flex flex-col items-center gap-1.5">
            <Link to="/treino">
              <Users className="size-4 text-amber-500" />
              <span className="text-xs font-medium">Treino de Vendas</span>
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
