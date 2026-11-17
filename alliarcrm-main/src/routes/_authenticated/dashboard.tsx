import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { brl } from "@/lib/pix";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/alliar/Shell";
import { NewLead } from "@/components/alliar/NewLead";
import { PriorityBadge, TempBadge } from "@/components/alliar/Badges";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => seo("Painel do dia", "Seus 3 negócios mais importantes do dia e o resumo do funil."),
  component: Dashboard,
});

const tempScore = { quente: 3, morno: 2, frio: 1 } as const;
const prioScore = { alta: 3, "média": 2, baixa: 1 } as const;

function Dashboard() {
  const app = useApp();
  const open = app.leads.filter((l) => l.stage !== "ganho");
  const won = app.leads.filter((l) => l.stage === "ganho");
  const top = [...open].sort((a, b) => tempScore[b.temp] + prioScore[b.priority] - (tempScore[a.temp] + prioScore[a.priority]) || b.value - a.value).slice(0, 3);
  const stats = [
    { label: "Negócios abertos", value: String(open.length) },
    { label: "Em aberto", value: brl(open.reduce((s, l) => s + l.value, 0)) },
    { label: "Ganhos", value: brl(won.reduce((s, l) => s + l.value, 0)) },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Bom dia" sub="Foque nos 3 negócios que mais podem fechar hoje."><NewLead /></PageHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Top 3 negócios do dia</h2>
        {app.loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : !top.length ? (
          <p className="text-sm text-muted-foreground">Nenhum negócio aberto. Crie o primeiro com "Novo negócio".</p>
        ) : (
          <div className="space-y-2">
            {top.map((l, i) => (
              <button key={l.id} onClick={() => app.select(l.id)} className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent">
                <span className="text-2xl font-semibold text-muted-foreground">{i + 1}</span>
                <span className="flex-1"><span className="block font-medium">{l.name}</span><span className="text-xs text-muted-foreground">{l.company}</span></span>
                <TempBadge t={l.temp} /><PriorityBadge p={l.priority} />
                <span className="font-semibold">{brl(l.value)}</span>
              </button>
            ))}
          </div>
        )}
        <Link to="/pipeline" className="mt-4 inline-block text-sm text-primary hover:underline">Ver funil completo →</Link>
      </section>
    </div>
  );
}
