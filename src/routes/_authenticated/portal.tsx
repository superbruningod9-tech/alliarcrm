import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Check, Clock, Copy, ExternalLink, FileText, Link2, MessageSquare, Plus, QrCode, Send, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { generateClientPortalLink } from "@/lib/alliar-modules";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => seo("Pós-venda e Chamados", "Portal do cliente com link mágico, rastreio de entrega e chamados com SLA persistidos."),
  component: Portal,
});

const STEPS = ["Pagamento confirmado", "Contrato assinado", "Onboarding agendado", "Configuração", "Entregue"];

function Portal() {
  const { leads, tickets, addTicket, toggleTicket } = useApp();

  // Seleção de cliente para o portal
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"alta" | "média" | "baixa">("média");
  const [filterStatus, setFilterStatus] = useState<"todos" | "aberto" | "resolvido">("todos");
  const [busy, setBusy] = useState(false);
  const [customStep, setCustomStep] = useState(3);

  // Lista de clientes disponíveis a partir dos leads
  const clients = useMemo(() => {
    const list = leads.map((l) => ({
      id: l.contactId || l.id,
      name: l.name || l.company || "Cliente",
      company: l.company,
      phone: l.phone,
    }));
    if (list.length === 0) {
      return [{ id: "c-default", name: "Clínica Sorriso", company: "Clínica Sorriso Ltda", phone: "11988887777" }];
    }
    return list;
  }, [leads]);

  const activeClient = (clients.find((c) => c.id === selectedClientId) || clients[0])!;

  // Gera o link mágico individual para o cliente ativo
  const magicLink = useMemo(() => {
    return generateClientPortalLink(activeClient.id, activeClient.name);
  }, [activeClient]);

  // Filtra tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterStatus === "aberto") return t.status !== "resolvido";
      if (filterStatus === "resolvido") return t.status === "resolvido";
      return true;
    });
  }, [tickets, filterStatus]);

  const handleCopyMagicLink = () => {
    void navigator.clipboard?.writeText(magicLink.url);
    toast.success(`Link mágico copiado para ${activeClient.name} — o cliente entra sem senha`);
  };

  const handleSendWhatsApp = () => {
    const phone = activeClient.phone?.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Olá, ${activeClient.name}! Aqui está o seu link de acesso exclusivo ao Portal do Cliente Alliar (sem senha): ${magicLink.url}\n\nPor ele você acompanha a implantação, 2ª via do PIX e abre chamados com protocolo direto com nossa equipe.`
    );
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
    toast.success("Abrindo WhatsApp com o link mágico...");
  };

  const handleOpenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await addTicket({
        title: title.trim(),
        description: description.trim(),
        contactName: activeClient.name,
        contactId: activeClient.id,
        priority,
      });
      setTitle("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Pós-venda e Chamados"
        sub="Gestão de implantação, links mágicos sem senha e chamados com protocolo e SLA persistidos no banco."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopyMagicLink}>
            <Link2 className="size-3.5" />
            Copiar link mágico ({activeClient.name})
          </Button>
          {activeClient.phone && (
            <Button variant="outline" size="sm" onClick={handleSendWhatsApp}>
              <Send className="size-3.5 text-emerald-500" />
              Enviar no WhatsApp
            </Button>
          )}
        </div>
      </PageHeader>

      {/* SELETOR DE CLIENTE DO PORTAL */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cliente selecionado:</span>
          <select
            value={activeClient.id}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.company ? `(${c.company})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-500" />
          Link mágico autenticado por token individual
        </div>
      </section>

      {/* RASTREIO DA IMPLANTAÇÃO */}
      <section className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Rastreio da implantação · <span className="text-primary">{activeClient.name}</span>
          </h2>
          <span className="text-xs text-muted-foreground">Clique nas etapas para atualizar o progresso</span>
        </div>
        <ol className="flex flex-col gap-3 md:flex-row md:gap-0">
          {STEPS.map((s, i) => (
            <li
              key={s}
              onClick={() => {
                setCustomStep(i);
                toast.success(`Etapa atualizada para: ${s}`);
              }}
              className="flex flex-1 cursor-pointer items-center gap-2 transition hover:opacity-80 md:flex-col md:text-center"
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border text-xs font-medium",
                  i <= customStep
                    ? "border-primary bg-primary text-primary-foreground"
                    : i === customStep + 1
                    ? "animate-pulse border-primary text-primary"
                    : "text-muted-foreground"
                )}
              >
                {i <= customStep ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-xs", i > customStep + 1 && "text-muted-foreground")}>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* DOCUMENTOS E 2ª VIA */}
        <section className="rounded-lg border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Documentos e Faturas</h2>
            <span className="text-xs text-muted-foreground">Disponíveis no link mágico</span>
          </div>
          {[
            ["Fatura nov/2026", QrCode, "2ª via PIX", "Cópia e Cola disponível"],
            ["Contrato assinado", FileText, "Baixar", "Assinado com certificado digital"],
            ["Fatura out/2026 · paga", FileText, "Recibo", "Comprovante de liquidação"],
          ].map(([n, I, a, desc]) => {
            const Icon = I as typeof QrCode;
            return (
              <div key={n as string} className="flex items-center justify-between border-b py-3 text-sm last:border-0">
                <div className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{n as string}</div>
                    <div className="text-xs text-muted-foreground">{desc as string}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toast.success(`${a} disponibilizado para o cliente`)}>
                  {a as string}
                </Button>
              </div>
            );
          })}
        </section>

        {/* CHAMADOS COM PROTOCOLO E SLA PERSISTIDOS */}
        <section className="flex flex-col rounded-lg border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Chamados de Suporte (SLA)</h2>
              <p className="text-xs text-muted-foreground">Persistidos no banco com protocolo e prazo</p>
            </div>
            <div className="flex rounded-md border text-xs">
              {(["todos", "aberto", "resolvido"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={cn(
                    "px-2.5 py-1 capitalize transition",
                    filterStatus === st ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* FORMULÁRIO DE NOVO CHAMADO */}
          <form className="mb-4 space-y-2 rounded-md border bg-muted/30 p-3" onSubmit={handleOpenTicket}>
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do problema (ex: Dúvida sobre fatura)..."
                required
                className="text-sm"
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="rounded-md border bg-background px-2 text-xs font-medium"
              >
                <option value="alta">Alta (SLA 2h)</option>
                <option value="média">Média (SLA 4h)</option>
                <option value="baixa">Baixa (SLA 24h)</option>
              </select>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais (opcional)..."
              rows={2}
              className="text-xs"
            />
            <div className="flex justify-between items-center pt-1">
              <span className="text-[11px] text-muted-foreground">
                Cliente: <b className="text-foreground">{activeClient.name}</b>
              </span>
              <Button size="sm" disabled={busy || !title.trim()} className="h-8">
                <Plus className="mr-1 size-3.5" /> Abrir chamado
              </Button>
            </div>
          </form>

          {/* LISTA DE CHAMADOS PERSISTIDOS */}
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[340px]">
            {filteredTickets.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum chamado encontrado nesta categoria.</p>
            ) : (
              filteredTickets.map((k) => {
                const isDone = k.status === "resolvido";
                return (
                  <div
                    key={k.id}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-md border p-3 text-sm transition",
                      isDone ? "bg-muted/30 opacity-70" : "bg-card hover:border-primary/40"
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">{k.protocol || k.id}</span>
                        <span className="text-xs text-muted-foreground">· {k.contactName}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                            k.priority === "alta"
                              ? "bg-destructive/10 text-destructive"
                              : k.priority === "média"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {k.priority}
                        </span>
                      </div>
                      <div className="font-medium text-foreground text-xs">{k.title}</div>
                      {k.description && <div className="text-[11px] text-muted-foreground line-clamp-2">{k.description}</div>}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleTicket(k.id)}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition",
                          isDone
                            ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                            : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                        )}
                      >
                        {isDone ? (
                          <>
                            <Check className="size-3" /> Resolvido
                          </>
                        ) : (
                          <>
                            <Clock className="size-3" /> {k.slaLabel}
                          </>
                        )}
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(k.createdAt).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
