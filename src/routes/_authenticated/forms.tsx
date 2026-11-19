import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
  Phone,
  User,
  Save,
  Send,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { listForms, createForm, type FormField } from "@/lib/forms";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

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

export function FormsPage() {
  const app = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showEmbed, setShowEmbed] = useState<string | null>(null);

  // Configurações do Vendedor & WhatsApp
  const [sellerName, setSellerName] = useState(app.userName || "Consultor Comercial");
  const [sellerPhone, setSellerPhone] = useState(app.automationSettings?.whatsappNumber || "5511999999999");
  const [whatsappMsg, setWhatsappMsg] = useState(
    "Olá, {{vendedor}}! Acabei de responder ao questionário de qualificação da {{empresa}} (meu nome é {{cliente}}). Gostaria de receber meu atendimento e proposta personalizada!"
  );
  const [savingConfig, setSavingConfig] = useState(false);

  // Carrega configurações salvas do vendedor para este tenant
  useEffect(() => {
    if (!app.tenantId) return;
    try {
      const raw = localStorage.getItem(`alliar:forms_seller_config:${app.tenantId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.sellerName) setSellerName(parsed.sellerName);
        if (parsed.sellerPhone) setSellerPhone(parsed.sellerPhone);
        if (parsed.whatsappMsg) setWhatsappMsg(parsed.whatsappMsg);
      } else {
        if (app.userName) setSellerName(app.userName);
      }
    } catch {}
  }, [app.tenantId, app.userName]);

  const forms = useQuery({
    queryKey: ["forms", app.tenantId],
    enabled: !!app.tenantId,
    queryFn: () => listForms(app.tenantId!),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "https://charming-figolla-bc7439.netlify.app";

  // URL dinâmica com parâmetros configurados do vendedor
  const dynamicFormUrl = `${origin}/formulario?t=${app.tenantId || "default"}&vendedor=${encodeURIComponent(
    sellerName.trim()
  )}&whatsapp=${encodeURIComponent(sellerPhone.trim())}&msg=${encodeURIComponent(whatsappMsg.trim())}`;

  async function handleSaveSellerConfig() {
    if (!app.tenantId) return;
    setSavingConfig(true);
    try {
      const payload = {
        sellerName: sellerName.trim(),
        sellerPhone: sellerPhone.trim(),
        whatsappMsg: whatsappMsg.trim(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Salva no localStorage para carregamento instantâneo
      localStorage.setItem(`alliar:forms_seller_config:${app.tenantId}`, JSON.stringify(payload));

      // 2. Salva no banco de dados (b2b_connections)
      try {
        await supabase.from("b2b_connections").upsert({
          user_id: app.tenantId,
          tenant_id: app.tenantId,
          provider: "form_whatsapp_config",
          key_ciphertext: JSON.stringify(payload),
          connected_at: new Date().toISOString(),
        });
      } catch {}

      toast.success("Dados do vendedor e mensagem de WhatsApp salvos com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar dados");
    } finally {
      setSavingConfig(false);
    }
  }

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
        sub="Crie formulários interativos estilo Typeform para captar leads e direcionar clientes direto para o WhatsApp do vendedor."
      />

      {/* SEÇÃO 1: CONFIGURAÇÃO DO VENDEDOR E MENSAGEM AUTOMÁTICA DE WHATSAPP */}
      <section className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Zap className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Configuração do Vendedor & Mensagem Automática
              </h2>
              <p className="text-xs text-muted-foreground">
                Estes dados são puxados automaticamente pelo questionário para o cliente acionar o vendedor no WhatsApp.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSaveSellerConfig}
            disabled={savingConfig}
            className="gap-1.5 h-8 text-xs font-semibold"
          >
            <Save className="size-3.5" />
            {savingConfig ? "Salvando…" : "Salvar Dados"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Nome do Vendedor / Consultor
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Ex: Carlos Mendes"
                className="pl-9 text-sm rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Número de WhatsApp do Vendedor (com DDD)
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                value={sellerPhone}
                onChange={(e) => setSellerPhone(e.target.value)}
                placeholder="Ex: 5511999999999"
                className="pl-9 text-sm font-mono rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* MENSAGEM AUTOMÁTICA DE WHATSAPP QUE O CLIENTE VAI ENVIAR */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mensagem Pré-Escrita de WhatsApp (Enviada pelo Cliente)
            </label>
            <span className="text-[11px] text-muted-foreground font-mono">
              Tags: {'{{vendedor}}'}, {'{{cliente}}'}, {'{{empresa}}'}
            </span>
          </div>
          <textarea
            value={whatsappMsg}
            onChange={(e) => setWhatsappMsg(e.target.value)}
            rows={3}
            className="w-full rounded-xl border bg-background p-3 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Digite o texto que o cliente enviará para o vendedor..."
          />
        </div>

        {/* PRÉVIA VISUAL DO LINK */}
        <div className="rounded-xl border bg-muted/20 p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Link Oficial com Dados do Vendedor Integrados:</span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyText(dynamicFormUrl, "Link completo do questionário")}
                className="h-7 text-xs gap-1"
              >
                <Copy className="size-3" /> Copiar Link
              </Button>
              <Button asChild size="sm" className="h-7 text-xs gap-1">
                <a href={dynamicFormUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3" /> Testar Formulário
                </a>
              </Button>
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground truncate bg-background p-2 rounded-lg border">
            {dynamicFormUrl}
          </p>
        </div>
      </section>

      {/* SEÇÃO 2: QUESTIONÁRIO PADRÃO ATIVO */}
      <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base">Questionário de Qualificação Comercial Alliar</h2>
                <span className="flex items-center text-xs text-green-500 font-medium bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Passo a passo com barra de progresso, WhatsApp, faturamento e qualificação imediata.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setShowEmbed(
                  showEmbed
                    ? null
                    : `<iframe src="${dynamicFormUrl}" width="100%" height="650" frameborder="0"></iframe>`
                )
              }
              className="text-xs h-8"
            >
              <Code2 className="mr-1.5 h-3.5 w-3.5" /> Código Embed
            </Button>

            <Button asChild size="sm" className="text-xs h-8">
              <a href={dynamicFormUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir Questionário
              </a>
            </Button>
          </div>
        </div>

        {/* Snippet do Embed */}
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
            <pre className="text-xs bg-background p-3 rounded border overflow-x-auto text-muted-foreground font-mono">
              {showEmbed}
            </pre>
          </div>
        )}

        <div className="rounded-xl border bg-muted/20 p-4 grid gap-3 sm:grid-cols-3 text-xs">
          <div>
            <span className="text-muted-foreground block">Fluxo Interativo:</span>
            <strong className="text-foreground">Passo a passo estilo Typeform</strong>
          </div>
          <div>
            <span className="text-muted-foreground block">Destino do Lead:</span>
            <strong className="text-foreground">Funil de Vendas (Etapa "Novos")</strong>
          </div>
          <div>
            <span className="text-muted-foreground block">Disparo de WhatsApp:</span>
            <strong className="text-foreground">Automático com Mensagem Pré-definida</strong>
          </div>
        </div>
      </section>

      {/* SEÇÃO 3: CRIAR NOVO FORMULÁRIO */}
      <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
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
            className="max-w-xs text-sm rounded-xl"
          />
          <Input
            name="slug"
            placeholder="Identificador no link (ex: odonto)"
            required
            maxLength={60}
            className="max-w-xs text-sm rounded-xl"
          />
          <Button disabled={busy} className="rounded-xl text-sm">
            {busy ? "Criando…" : "Criar Questionário"}
          </Button>
        </form>
      </section>

      {/* SEÇÃO 4: QUESTIONÁRIOS CADASTRADOS */}
      <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
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
          <div className="divide-y rounded-xl border bg-card overflow-hidden">
            {forms.data.map((f) => {
              const customFormUrl = `${origin}/formulario?slug=${f.slug}&t=${app.tenantId || "default"}&vendedor=${encodeURIComponent(
                sellerName
              )}&whatsapp=${encodeURIComponent(sellerPhone)}&msg=${encodeURIComponent(whatsappMsg)}`;
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
                      onClick={() => copyText(customFormUrl, "Link do questionário")}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Copiar Link
                    </Button>
                    <Button asChild variant="secondary" size="sm" className="text-xs h-8">
                      <a href={customFormUrl} target="_blank" rel="noreferrer">
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
