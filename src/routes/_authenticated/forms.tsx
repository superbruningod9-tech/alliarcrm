import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Copy,
  ExternalLink,
  Code2,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  MessageSquare,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { listForms, createForm, type FormField } from "@/lib/forms";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/forms")({
  head: () =>
    seo(
      "Questionários & Formulários",
      "Crie questionários interativos estilo Typeform para qualificar clientes e captar leads."
    ),
  component: FormsPage,
});

const DEFAULT_FIELDS: FormField[] = [
  { name: "nome", label: "Nome", type: "text", required: true },
  { name: "whatsapp", label: "WhatsApp", type: "tel", required: true },
  { name: "email", label: "E-mail", type: "email", required: true },
  { name: "segmento", label: "Segmento da Empresa", type: "text", required: true },
  { name: "faturamento", label: "Faturamento Mensal", type: "text" },
  { name: "desafio", label: "Maior Desafio Atual", type: "textarea" },
];

function FormsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showEmbed, setShowEmbed] = useState<string | null>(null);

  const forms = useQuery({
    queryKey: ["forms", app.tenantId],
    enabled: !!app.tenantId,
    queryFn: () => listForms(app.tenantId!),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "https://charming-figolla-bc7439.netlify.app";
  const defaultPublicUrl = `${origin}/formulario?t=${app.tenantId || "default"}`;

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const f = new FormData(el);
    const name = String(f.get("name")).trim();
    const slug = String(f.get("slug")).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

    if (!name || !slug || !app.tenantId) return;

    setBusy(true);
    try {
      await createForm(app.tenantId, name, slug, DEFAULT_FIELDS);
      el.reset();
      await qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Questionário criado com sucesso!");
    } catch {
      toast.error("Não foi possível criar. Verifique se o identificador já existe.");
    } finally {
      setBusy(false);
    }
  }

  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Questionários & Formulários de Qualificação"
        sub="Crie fluxos interativos passo a passo estilo Typeform para captar e qualificar leads no WhatsApp."
      />

      {/* Card Destaque: Questionário Padrão Ativo */}
      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base">Questionário de Qualificação Comercial Alliar</h2>
                <span className="flex items-center text-xs text-green-400 font-medium bg-green-950/40 border border-green-800 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Formulário interativo com barra de progresso, WhatsApp, faturamento e qualificação rápida.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyText(defaultPublicUrl, "Link do questionário")}
              className="text-xs"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar Link
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setShowEmbed(
                  showEmbed
                    ? null
                    : `<iframe src="${defaultPublicUrl}" width="100%" height="650" frameborder="0"></iframe>`
                )
              }
              className="text-xs"
            >
              <Code2 className="mr-1.5 h-3.5 w-3.5" /> Código Embed
            </Button>

            <Button asChild size="sm" className="text-xs">
              <a href={defaultPublicUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir Questionário
              </a>
            </Button>
          </div>
        </div>

        {/* Snippet do Embed (se aberto) */}
        {showEmbed && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Código para colar no seu site ou Landing Page:</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => copyText(showEmbed, "Código embed")}
              >
                <Copy className="mr-1 h-3 w-3" /> Copiar Código
              </Button>
            </div>
            <pre className="text-xs bg-background p-3 rounded border overflow-x-auto text-muted-foreground">
              {showEmbed}
            </pre>
          </div>
        )}

        <div className="rounded-lg border bg-muted/20 p-4 grid gap-3 sm:grid-cols-3 text-xs">
          <div>
            <span className="text-muted-foreground block">Fluxo Interativo:</span>
            <strong className="text-foreground">Passo a passo estilo Typeform</strong>
          </div>
          <div>
            <span className="text-muted-foreground block">Destino do Lead:</span>
            <strong className="text-foreground">Funil de Vendas (Etapa "Novos")</strong>
          </div>
          <div>
            <span className="text-muted-foreground block">Disparo de Boas-Vindas:</span>
            <strong className="text-foreground">Automático via WhatsApp</strong>
          </div>
        </div>
      </section>

      {/* Criar Novo Formulário / Questionário */}
      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Criar Novo Questionário Customizado
          </h2>
          <p className="text-xs text-muted-foreground">
            Defina um nome e um link exclusivo para a sua campanha ou segmento.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <Input
            name="name"
            placeholder="Nome (ex: Diagnóstico Odonto)"
            required
            maxLength={120}
            className="max-w-xs"
          />
          <Input
            name="slug"
            placeholder="Identificador no link (ex: odonto)"
            required
            maxLength={60}
            className="max-w-xs"
          />
          <Button disabled={busy}>{busy ? "Criando…" : "Criar Questionário"}</Button>
        </form>
      </section>

      {/* Lista de Questionários Cadastrados */}
      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-base">Questionários Registrados</h2>

        {forms.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando questionários…</p>
        ) : forms.error ? (
          <p className="text-sm text-destructive">Não foi possível carregar os questionários.</p>
        ) : !forms.data.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhum formulário customizado criado ainda. O questionário principal acima está pronto para uso!
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {forms.data.map((f) => {
              const formUrl = `${origin}/formulario?slug=${f.slug}&t=${app.tenantId || "default"}`;
              return (
                <div key={f.id} className="flex flex-wrap items-center justify-between p-4 gap-3">
                  <div>
                    <div className="font-medium text-sm">{f.name}</div>
                    <div className="text-xs text-muted-foreground">
                      slug: <code>{f.slug}</code> · {f.fields?.length || 0} perguntas configuradas
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => copyText(formUrl, "Link do questionário")}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Copiar Link
                    </Button>
                    <Button asChild variant="secondary" size="sm" className="text-xs h-8">
                      <a href={formUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" /> Testar
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
