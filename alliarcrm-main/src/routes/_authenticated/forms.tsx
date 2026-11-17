import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { listForms, createForm, type FormField } from "@/lib/forms";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/forms")({
  head: () => seo("Formulários", "Formulários de captura de leads da sua empresa."),
  component: FormsPage,
});

const DEFAULT_FIELDS: FormField[] = [
  { name: "nome", label: "Nome", type: "text", required: true },
  { name: "email", label: "E-mail", type: "email", required: true },
  { name: "telefone", label: "Telefone", type: "tel" },
  { name: "mensagem", label: "Mensagem", type: "textarea" },
];

function FormsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const forms = useQuery({ queryKey: ["forms", app.tenantId], enabled: !!app.tenantId, queryFn: () => listForms(app.tenantId!) });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Formulários" />
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const el = e.currentTarget; const f = new FormData(el);
        const name = String(f.get("name")).trim();
        const slug = String(f.get("slug")).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (!name || !slug || !app.tenantId) return;
        try { await createForm(app.tenantId, name, slug, DEFAULT_FIELDS); el.reset(); await qc.invalidateQueries({ queryKey: ["forms"] }); toast.success("Formulário criado"); }
        catch { toast.error("Não foi possível criar (o identificador já existe?)"); }
      }}>
        <Input name="name" placeholder="Nome do formulário" required maxLength={120} className="max-w-xs" />
        <Input name="slug" placeholder="Identificador (ex.: contato)" required maxLength={60} className="max-w-xs" />
        <Button>Criar formulário</Button>
      </form>
      {forms.isPending ? <p className="text-sm text-muted-foreground">Carregando…</p> : forms.error ? <p role="alert">Não foi possível carregar.</p> : !forms.data.length ? (
        <p className="text-sm text-muted-foreground">Nenhum formulário ainda.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {forms.data.map((f) => <li key={f.id} className="flex justify-between p-3 text-sm"><span className="font-medium">{f.name}</span><span className="text-muted-foreground">{f.slug} · {f.fields.length} campos</span></li>)}
        </ul>
      )}
    </div>
  );
}
