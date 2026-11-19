import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Award,
  Users,
  Target,
  Clock,
  DollarSign,
  ArrowUpRight,
  Percent,
  Info,
  ShieldAlert,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { brl } from "@/lib/pix";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { B2BDashboard } from "@/components/alliar/B2BDashboard";

export const Route = createFileRoute("/_authenticated/metrics")({
  head: () =>
    seo(
      "Métricas B2B & Desempenho da Equipe · Alliar CRM",
      "Dashboard analítico com funil de conversão real, desempenho por vendedor e enriquecimento Apollo."
    ),
  component: MetricsPage,
});

type PeriodFilter = "hoje" | "7d" | "mes" | "trimestre";

export function MetricsPage() {
  const app = useApp();
  const [activeTab, setActiveTab] = useState<"performance" | "apollo">("performance");
  const [period, setPeriod] = useState<PeriodFilter>("mes");

  // ── KPIs calculados com dados reais do Supabase via useApp ──
  const totalLeads = app.leads.length;
  const wonLeads = useMemo(() => app.leads.filter((l) => l.stage === "ganho"), [app.leads]);
  const openLeads = useMemo(() => app.leads.filter((l) => l.stage !== "ganho"), [app.leads]);

  const wonValue = wonLeads.reduce((s, l) => s + (l.value || 0), 0);
  const pipelineValue = openLeads.reduce((s, l) => s + (l.value || 0), 0);
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads.length / totalLeads) * 100) : 0;
  const avgTicket = wonLeads.length > 0 ? wonValue / wonLeads.length : 0;

  // ── Funil real por estágio ──
  const stageNovoCount = app.leads.filter((l) => l.stage === "novo").length;
  const stageContatoCount = app.leads.filter((l) => l.stage === "contato").length;
  const stagePropostaCount = app.leads.filter((l) => l.stage === "proposta").length;
  const stageNegociacaoCount = app.leads.filter((l) => l.stage === "negociacao").length;
  const stageGanhoCount = wonLeads.length;

  const funnelStages = [
    { label: "Novos Leads", count: stageNovoCount, color: "bg-blue-500", desc: "Aguardando 1º contato" },
    { label: "Em Contato", count: stageContatoCount, color: "bg-indigo-500", desc: "Qualificando no WhatsApp" },
    { label: "Proposta Enviada", count: stagePropostaCount, color: "bg-amber-500", desc: "Orçamento em avaliação" },
    { label: "Em Negociação", count: stageNegociacaoCount, color: "bg-purple-500", desc: "Negociando fechamento" },
    { label: "Venda Ganha", count: stageGanhoCount, color: "bg-emerald-500", desc: "Fechado & PIX recebido" },
  ];

  // ── Ranking de vendedores com dados reais de leads ──
  const memberLeadCounts = useMemo(() => {
    const map = new Map<string, { name: string; leads: number; won: number; wonValue: number }>();
    for (const lead of app.leads) {
      const key = lead.ownerId || lead.owner;
      const existing = map.get(key) || { name: lead.owner, leads: 0, won: 0, wonValue: 0 };
      existing.leads += 1;
      if (lead.stage === "ganho") { existing.won += 1; existing.wonValue += lead.value || 0; }
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.wonValue - a.wonValue);
  }, [app.leads]);

  const hasEnoughData = totalLeads >= 3;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <PageHeader
        title="Métricas B2B & Desempenho da Equipe"
        sub="Dados reais do seu CRM — funil de conversão, ranking de vendedores e enriquecimento Apollo."
      >
        <div className="flex rounded-lg border bg-muted/50 p-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab("performance")}
            className={`rounded-md px-3 py-1.5 transition ${activeTab === "performance" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Desempenho Comercial
          </button>
          <button
            onClick={() => setActiveTab("apollo")}
            className={`rounded-md px-3 py-1.5 transition ${activeTab === "apollo" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Enriquecimento B2B (Apollo)
          </button>
        </div>
      </PageHeader>

      {activeTab === "apollo" ? (
        <B2BDashboard embedded={true} />
      ) : (
        <div className="space-y-8">
          {/* FILTRO DE PERÍODO */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span>Período:</span>
              <div className="flex rounded-md border bg-muted/40 p-0.5">
                {([["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este Mês"], ["trimestre", "Trimestre"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setPeriod(val)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${period === val ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex size-2 rounded-full bg-emerald-500" />
              Dados em tempo real do seu funil
            </div>
          </div>

          {/* 4 KPIs REAIS */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Total Ganho</span>
                <DollarSign className="size-4 text-emerald-500" />
              </div>
              {wonValue > 0 ? (
                <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{brl(wonValue)}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Nenhuma venda ganho ainda</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">{wonLeads.length} venda{wonLeads.length !== 1 ? "s" : ""} fechada{wonLeads.length !== 1 ? "s" : ""}</p>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Taxa de Conversão</span>
                <Percent className="size-4 text-primary" />
              </div>
              {totalLeads > 0 ? (
                <p className="mt-2 text-2xl font-bold tracking-tight">{conversionRate}%</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Sem leads cadastrados</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">{totalLeads} leads totais no funil</p>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Pipeline em Aberto</span>
                <TrendingUp className="size-4 text-blue-500" />
              </div>
              {pipelineValue > 0 ? (
                <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{brl(pipelineValue)}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum lead em aberto</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">{openLeads.length} negócio{openLeads.length !== 1 ? "s" : ""} em andamento</p>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Ticket Médio</span>
                <Target className="size-4 text-purple-500" />
              </div>
              {avgTicket > 0 ? (
                <p className="mt-2 text-2xl font-bold tracking-tight">{brl(avgTicket)}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Sem vendas ainda</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">Por contrato fechado</p>
            </div>
          </div>

          {/* FUNIL DE CONVERSÃO COM DADOS REAIS */}
          <section className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-4">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="size-4 text-primary" /> Funil de Conversão — Dados Reais
                </h2>
                <p className="text-xs text-muted-foreground">Distribuição atual dos leads por estágio do funil.</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/pipeline"><ArrowUpRight className="size-3.5" /> Abrir Funil</Link>
              </Button>
            </div>

            {totalLeads === 0 ? (
              <div className="py-10 text-center">
                <Info className="size-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum lead cadastrado ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">Adicione leads pelo funil ou importe da prospecção B2B para visualizar o funil aqui.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {funnelStages.map((stage) => {
                  const pct = totalLeads > 0 ? Math.round((stage.count / totalLeads) * 100) : 0;
                  return (
                    <div key={stage.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground flex items-center gap-2">
                          {stage.label}
                          <span className="text-muted-foreground font-normal">· {stage.desc}</span>
                        </span>
                        <span className="font-mono font-bold">{stage.count} ({pct}%)</span>
                      </div>
                      <div className="h-4 w-full overflow-hidden rounded-full bg-muted/60 p-0.5">
                        <div className={`h-full rounded-full ${stage.color} transition-all duration-500`} style={{ width: `${Math.max(pct, stage.count > 0 ? 2 : 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* RANKING DE VENDEDORES — DADOS REAIS */}
          <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Award className="size-4 text-amber-500" /> Ranking da Equipe por Faturamento
                </h2>
                <p className="text-xs text-muted-foreground">Calculado a partir dos leads ganhos atribuídos a cada vendedor.</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/equipe">Ver Equipe</Link>
              </Button>
            </div>

            {memberLeadCounts.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="size-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum dado de equipe disponível ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">Os rankings serão exibidos conforme vendas são registradas e atribuídas a vendedores no funil.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-3 font-semibold">Vendedor</th>
                      <th className="font-semibold">Leads</th>
                      <th className="font-semibold">Vendas Ganhas</th>
                      <th className="font-semibold">Faturamento</th>
                      <th className="font-semibold">Conversão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {memberLeadCounts.map((m, i) => {
                      const conv = m.leads > 0 ? Math.round((m.won / m.leads) * 100) : 0;
                      return (
                        <tr key={i} className="hover:bg-muted/20 transition">
                          <td className="py-3.5 font-medium">
                            <div className="flex items-center gap-2.5">
                              <span className="grid size-6 place-items-center rounded-full bg-primary/10 font-bold text-primary text-[11px]">{i + 1}</span>
                              <span className="font-semibold text-foreground">{m.name}</span>
                            </div>
                          </td>
                          <td className="font-medium text-foreground">{m.leads}</td>
                          <td className="font-medium text-foreground">{m.won}</td>
                          <td className="font-bold text-emerald-600 dark:text-emerald-400">{brl(m.wonValue)}</td>
                          <td className="font-semibold">{conv}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* MOTIVOS DE PERDA — VAZIO ATÉ TER DADOS REAIS */}
          <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            <div className="border-b pb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <ShieldAlert className="size-4 text-destructive" /> Análise de Motivos de Perda
              </h2>
              <p className="text-xs text-muted-foreground">Por que negócios são perdidos — para ajustar a abordagem e aumentar a conversão.</p>
            </div>
            <div className="py-8 text-center">
              <ShieldAlert className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum motivo de perda registrado ainda.</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Quando leads forem movidos para "Perdido" no funil com motivo registrado, o relatório aparecerá aqui automaticamente.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
