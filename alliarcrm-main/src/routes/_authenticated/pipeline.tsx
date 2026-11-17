import { createFileRoute } from "@tanstack/react-router";
import { NewLead } from "@/components/alliar/NewLead";
import { useState, useMemo } from "react";
import { AlertTriangle, Clock, Eye, RefreshCw, Sparkles, Zap } from "lucide-react";
import { useApp, STAGES, type Stage, type Lead } from "@/lib/store";
import { brl } from "@/lib/pix";
import { beep, antiVacuoMinutesRemaining } from "@/lib/rules";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/alliar/Shell";
import { PriorityBadge, TempBadge } from "@/components/alliar/Badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => seo("Funil de vendas", "Pipeline Kanban com temperatura, prioridade, anti-vácuo em tempo real e automações."),
  component: Pipeline,
});

function Pipeline() {
  const {
    leads,
    updateLead,
    select,
    selected,
    structure,
    stages,
    automationSettings,
    updateAutomationSettings,
    executeAntiVacuoCheck,
    simulateAntiVacuo,
  } = useApp();

  const [over, setOver] = useState<Stage | null>(null);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  // Calcula tempo restante do SLA para cada lead
  const now = useMemo(() => new Date(), [leads]);

  const handleSimulate = async () => {
    await simulateAntiVacuo();
  };

  const handleCheckRules = async () => {
    setChecking(true);
    try {
      await executeAntiVacuoCheck();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <PageHeader title="Funil" sub="Seus negócios por etapa com automações de boas-vindas e anti-vácuo em tempo real">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutomationsOpen(true)}
            className="border-primary/30 text-xs font-medium"
          >
            <Sparkles className="mr-1.5 size-3.5 text-primary" />
            Motor de Automações
          </Button>
          <NewLead />
        </div>
      </PageHeader>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {(stages.length ? stages : STAGES).map((s) => {
          const col = leads.filter((l) => l.stage === s.id);
          return (
            <div
              key={s.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.id as Stage);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("id");
                updateLead(id, { stage: s.id as Stage });
                if (s.id === "ganho") beep(990);
                setOver(null);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-lg bg-muted/40 p-2 transition",
                over === s.id && "ring-1 ring-primary"
              )}
            >
              <div className="flex items-center justify-between px-1 pb-2 text-xs">
                <span className="font-medium">
                  {s.label} <span className="text-muted-foreground">{col.length}</span>
                </span>
                <span className="text-muted-foreground">{brl(col.reduce((a, l) => a + l.value, 0))}</span>
              </div>

              <div className="space-y-2">
                {col.map((l) => {
                  // SLA Anti-vácuo para leads na etapa 'novo'
                  const isNewStage = l.stage === "novo";
                  const minutesLeft = isNewStage ? antiVacuoMinutesRemaining(l.createdAt || l.lastContact, now) : 0;
                  const isExpired = isNewStage && minutesLeft <= 0;

                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("id", l.id)}
                      onClick={() => select(l.id)}
                      className={cn(
                        "cursor-pointer rounded-md border bg-card p-3 transition hover:border-primary/50 relative",
                        selected === l.id && "border-primary"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{l.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{l.company}</div>
                        </div>
                        {l.proposalOpen && <Eye className="size-3.5 shrink-0 animate-pulse text-info" />}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <TempBadge t={l.temp} />
                        <PriorityBadge p={l.priority} />

                        {/* BADGE ANTI-VÁCUO EM TEMPO REAL */}
                        {isNewStage && structure === "equipe" && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              isExpired
                                ? "bg-destructive/15 text-destructive animate-pulse"
                                : "bg-amber-500/10 text-amber-500"
                            )}
                            title={isExpired ? "Lead há mais de 5min sem resposta" : "Tempo até redistribuição"}
                          >
                            {isExpired ? <AlertTriangle className="size-2.5" /> : <Clock className="size-2.5" />}
                            {isExpired ? "SLA 5m expirado" : `SLA: ${minutesLeft}m`}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-semibold">{brl(l.value)}</span>
                        <span className="text-muted-foreground">{structure === "equipe" ? l.owner : l.lastContact}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DO MOTOR DE REGRAS E AUTOMAÇÕES */}
      <Dialog open={automationsOpen} onOpenChange={setAutomationsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              Motor de Automações de Funil
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-sm">
            {/* REGRA 1: BOAS-VINDAS NO WHATSAPP */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs uppercase tracking-wide text-foreground">
                  1. Boas-Vindas Automáticas (WhatsApp)
                </span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                  {automationSettings.welcomeEnabled ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Dispara mensagem de boas-vindas pelo WhatsApp oficial assim que um novo lead é cadastrado no funil ou
                recebido por indicação.
              </p>
              <div className="flex items-center justify-between pt-1 text-xs">
                <span>Disparo automático:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    updateAutomationSettings({ welcomeEnabled: !automationSettings.welcomeEnabled })
                  }
                >
                  {automationSettings.welcomeEnabled ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </div>

            {/* REGRA 2: ANTI-VÁCUO ROUND-ROBIN (5 MIN) */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs uppercase tracking-wide text-foreground">
                  2. Anti-Vácuo Round-Robin (SLA 5 min)
                </span>
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                  {automationSettings.antiVacuoMinutes} minutos
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Se um novo lead ficar sem resposta por mais de 5 minutos, o motor transfere automaticamente para o
                próximo vendedor da fila (round-robin), toca um alerta e registra na linha do tempo.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCheckRules}
                  disabled={checking}
                  className="h-8 text-xs"
                >
                  <RefreshCw className={cn("mr-1.5 size-3", checking && "animate-spin")} />
                  Verificar agora
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSimulate}
                  className="h-8 text-xs"
                >
                  Simular lead sem resposta (&gt;5m)
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
