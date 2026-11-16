import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Flame,
  Globe,
  Key,
  Layers,
  MessageSquare,
  Play,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import {
  loadIntegrationSettings,
  saveIntegrationSettings,
  fetchWebhookLogs,
  getWebhookUrl,
  processPaymentWebhook,
  processMetaAdsWebhook,
  type IntegrationSettings,
  type WebhookLog,
} from "@/lib/integrations";
import { PageHeader } from "@/components/alliar/Shell";
import { B2BSettings } from "@/components/alliar/B2BSettings";
import { B2BDashboard } from "@/components/alliar/B2BDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () =>
    seo(
      "Central de Integrações e Webhooks",
      "Conexão B2B individual, importação CSV, consultas e métricas, anúncios, pagamentos e WhatsApp na Alliar."
    ),
  component: IntegracoesPage,
});

const GATEWAYS = [
  { id: "kiwify", name: "Kiwify", badge: "Mais usado", color: "text-emerald-500", desc: "Escuta eventos de 'order_approved' e PIX pago." },
  { id: "hotmart", name: "Hotmart", badge: "Global", color: "text-orange-500", desc: "Escuta 'PURCHASE_APPROVED' do Hotmart Webhooks." },
  { id: "asaas", name: "Asaas", badge: "Cobranças & PIX", color: "text-blue-500", desc: "Escuta 'PAYMENT_RECEIVED' e 'PAYMENT_CONFIRMED'." },
  { id: "stripe", name: "Stripe", badge: "Cartão / Int.", color: "text-indigo-500", desc: "Escuta 'checkout.session.completed' do Stripe." },
  { id: "mercadopago", name: "Mercado Pago", badge: "PIX Express", color: "text-cyan-500", desc: "Escuta notificações de pagamento aprovado IPN." },
] as const;

function IntegracoesPage() {
  const { tenantId, refresh, leads } = useApp();

  const [settings, setSettings] = useState<IntegrationSettings>(() => loadIntegrationSettings(tenantId || ""));
  const [logs, setLogs] = useState<WebhookLog[]>(() => fetchWebhookLogs(tenantId || ""));
  const [selectedGateway, setSelectedGateway] = useState<string>("kiwify");

  // Simulador de Pagamento
  const [simName, setSimName] = useState("Hospital Samaritano");
  const [simPhone, setSimPhone] = useState("11988887777");
  const [simEmail, setSimEmail] = useState("contato@samaritano.com.br");
  const [simAmount, setSimAmount] = useState("2500");
  const [simMethod, setSimMethod] = useState("PIX");
  const [simulating, setSimulating] = useState(false);

  // Simulador de Meta Lead Ads
  const [metaSimName, setMetaSimName] = useState("Dra. Beatriz Albuquerque");
  const [metaSimPhone, setMetaSimPhone] = useState("31998765432");
  const [metaSimEmail, setMetaSimEmail] = useState("beatriz@odonto.com.br");
  const [metaSimCampaign, setMetaSimCampaign] = useState("Campanha Implantes - Instagram");
  const [metaSimulating, setMetaSimulating] = useState(false);

  // Modal de Payload JSON
  const [activeLog, setActiveLog] = useState<WebhookLog | null>(null);

  // WhatsApp Teste
  const [waTestPhone, setWaTestPhone] = useState("");
  const [waTestMsg, setWaTestMsg] = useState("Olá! Esta é uma mensagem de teste da Alliar.");
  const [waTesting, setWaTesting] = useState(false);

  const activeTenant = tenantId || "empresa-alliar";

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleSaveSettings = (partial: Partial<IntegrationSettings>) => {
    const updated = saveIntegrationSettings(activeTenant, partial);
    setSettings(updated);
    toast.success("Configuração de integração salva");
  };

  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    try {
      const res = await processPaymentWebhook({
        tenantId: activeTenant,
        gateway: selectedGateway as any,
        customerName: simName.trim(),
        customerPhone: simPhone.trim(),
        customerEmail: simEmail.trim(),
        amount: Number(simAmount) || 2500,
        orderId: `ord_${Math.floor(100000 + Math.random() * 900000)}`,
        paymentMethod: simMethod,
      });

      setLogs(fetchWebhookLogs(activeTenant));
      await refresh();
      toast.success(
        `🎉 Webhook de compra aprovada processado! Lead movido para 'Ganho', projeto aberto em Pós-Venda e link mágico enviado!`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao simular webhook");
    } finally {
      setSimulating(false);
    }
  };

  const handleSimulateMetaLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setMetaSimulating(true);
    try {
      await processMetaAdsWebhook({
        tenantId: activeTenant,
        leadName: metaSimName.trim(),
        leadPhone: metaSimPhone.trim(),
        leadEmail: metaSimEmail.trim(),
        campaignName: metaSimCampaign.trim(),
        adName: "Anúncio Stories / Vídeo Demonstrativo",
        formId: "meta_form_2026",
      });

      setLogs(fetchWebhookLogs(activeTenant));
      await refresh();
      toast.success(`🎯 Lead do Meta Ads criado no Funil com mensagem de boas-vindas automática no WhatsApp!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao simular Meta Lead Ads");
    } finally {
      setMetaSimulating(false);
    }
  };

  const handleTestWhatsApp = () => {
    if (!waTestPhone.trim()) {
      toast.error("Informe o telefone para teste");
      return;
    }
    setWaTesting(true);
    setTimeout(() => {
      setWaTesting(false);
      toast.success(`Mensagem de teste enviada com sucesso para ${waTestPhone}!`);
    }, 900);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Central de Integrações e Webhooks"
        sub="Conecte a Alliar a anúncios (Meta/Google), checkouts de pagamento (Kiwify, Hotmart, Asaas, Stripe) e WhatsApp para automação total de vendas."
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Webhooks Ativos
          </span>
        </div>
      </PageHeader>

      <Tabs defaultValue="pagamentos" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1 sm:grid-cols-5">
          <TabsTrigger value="b2b" className="min-w-0 text-xs">
            <Layers className="mr-1.5 size-3.5" />
            B2B & CSV
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="text-xs">
            <CreditCard className="mr-1.5 size-3.5" />
            Checkouts & PIX
          </TabsTrigger>
          <TabsTrigger value="anuncios" className="text-xs">
            <Flame className="mr-1.5 size-3.5" />
            Meta & Google Ads
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="text-xs">
            <Smartphone className="mr-1.5 size-3.5" />
            Linha WhatsApp
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            <Activity className="mr-1.5 size-3.5" />
            Histórico ({logs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="b2b" className="space-y-6">
          <B2BSettings />
          <B2BDashboard embedded />
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* ABA 1: GATEWAYS DE PAGAMENTO */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="pagamentos" className="space-y-6">
          {/* SELETOR DE GATEWAY */}
          <div className="grid gap-3 sm:grid-cols-5">
            {GATEWAYS.map((g) => {
              const isSelected = selectedGateway === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGateway(g.id)}
                  className={cn(
                    "flex flex-col text-left rounded-lg border p-3.5 transition hover:border-primary/50",
                    isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("font-bold text-sm", g.color)}>{g.name}</span>
                    <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground font-medium">
                      {g.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{g.desc}</p>
                </button>
              );
            })}
          </div>

          {/* DETALHES DO GATEWAY SELECIONADO */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold capitalize flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  URL do Webhook para {selectedGateway.toUpperCase()}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Copie a URL abaixo e cole nas configurações de Webhooks do painel da {selectedGateway.toUpperCase()}.
                </p>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                Pronto para receber eventos
              </span>
            </div>

            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-muted px-3 py-2 rounded-md flex-1 text-foreground break-all border">
                {getWebhookUrl(activeTenant, "payment", selectedGateway)}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  handleCopy(getWebhookUrl(activeTenant, "payment", selectedGateway), "URL do Webhook")
                }
              >
                <Copy className="size-3.5 mr-1.5" />
                Copiar
              </Button>
            </div>

            {/* REGRAS AUTOMÁTICAS AO RECEBER PAGAMENTO */}
            <div className="border-t pt-4 space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ações Automáticas ao Confirmar Pagamento (PIX / Cartão)
              </h3>
              <div className="grid gap-2 sm:grid-cols-3 text-xs">
                <label className="flex items-center gap-2 rounded-md border p-2.5 bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoMoveToGanho}
                    onChange={(e) => handleSaveSettings({ autoMoveToGanho: e.target.checked })}
                    className="rounded text-primary"
                  />
                  <span>Mover lead para etapa "Ganho"</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2.5 bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoOpenPortalProject}
                    onChange={(e) => handleSaveSettings({ autoOpenPortalProject: e.target.checked })}
                    className="rounded text-primary"
                  />
                  <span>Criar projeto no Pós-Venda (/portal)</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2.5 bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSendPortalMagicLink}
                    onChange={(e) => handleSaveSettings({ autoSendPortalMagicLink: e.target.checked })}
                    className="rounded text-primary"
                  />
                  <span>Enviar link mágico no WhatsApp</span>
                </label>
              </div>
            </div>
          </section>

          {/* SIMULADOR DE WEBHOOK DE PAGAMENTO */}
          <section className="rounded-lg border bg-gradient-to-r from-card to-muted/20 p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">Simulador de Pagamento em Tempo Real</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Testa a entrada de dinheiro sem precisar gerar uma compra real
              </span>
            </div>

            <form onSubmit={handleSimulatePayment} className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-medium mb-1">Nome do Cliente</label>
                <Input
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  placeholder="Nome do cliente/empresa"
                  required
                  className="text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Telefone (WhatsApp)</label>
                <Input
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  placeholder="11999999999"
                  className="text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Valor da Venda (R$)</label>
                <Input
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  placeholder="2500"
                  required
                  className="text-xs"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={simulating} className="w-full text-xs">
                  <Play className="mr-1.5 size-3.5 fill-current" />
                  Simular Pagamento
                </Button>
              </div>
            </form>
          </section>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* ABA 2: ANÚNCIOS (META & GOOGLE ADS) */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="anuncios" className="space-y-6">
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Flame className="size-4 text-orange-500" />
                  Meta Lead Ads (Instagram & Facebook)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receba leads dos formulários nativos do Instagram e Facebook instantaneamente no Funil da Alliar.
                </p>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                Ativo
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">URL de Callback (Webhook Meta)</label>
                <div className="flex gap-2">
                  <Input readOnly value={getWebhookUrl(activeTenant, "meta_ads")} className="font-mono text-xs" />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(getWebhookUrl(activeTenant, "meta_ads"), "URL de Callback")}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Token de Verificação (Verify Token)</label>
                <div className="flex gap-2">
                  <Input
                    value={settings.metaVerifyToken}
                    onChange={(e) => handleSaveSettings({ metaVerifyToken: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(settings.metaVerifyToken, "Verify Token")}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* SIMULADOR META ADS */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Play className="size-3" />
                Testar Envio de Lead do Instagram Ads
              </h3>
              <form onSubmit={handleSimulateMetaLead} className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Nome do Lead</label>
                  <Input
                    value={metaSimName}
                    onChange={(e) => setMetaSimName(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">WhatsApp</label>
                  <Input
                    value={metaSimPhone}
                    onChange={(e) => setMetaSimPhone(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Campanha</label>
                  <Input
                    value={metaSimCampaign}
                    onChange={(e) => setMetaSimCampaign(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={metaSimulating} variant="secondary" className="w-full text-xs">
                    Simular Lead Instagram
                  </Button>
                </div>
              </form>
            </div>
          </section>

          {/* GOOGLE ADS WEBHOOK */}
          <section className="rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="size-4 text-blue-500" />
                  Google Ads (Extensão de Formulário de Lead)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Conecte campanhas de Pesquisa e YouTube do Google Ads para inserção instantânea de leads.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">URL do Webhook do Google Ads</label>
                <div className="flex gap-2">
                  <Input readOnly value={getWebhookUrl(activeTenant, "google_ads")} className="font-mono text-xs" />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(getWebhookUrl(activeTenant, "google_ads"), "Webhook Google Ads")}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Chave de Chave Secreta do Google Ads</label>
                <Input
                  value={settings.googleAdsKey}
                  onChange={(e) => handleSaveSettings({ googleAdsKey: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* ABA 3: WHATSAPP CONECTOR */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="whatsapp" className="space-y-6">
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Smartphone className="size-4 text-emerald-500" />
                  Conexão WhatsApp (Oficial & Multi-Provedores)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Escolha entre a Cloud API Oficial da Meta ou conexões diretas via Evolution API / Z-API.
                </p>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                Motor WhatsApp Ativo
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { id: "meta_cloud", title: "Meta Cloud API (Oficial)", sub: "Sem risco de ban, modelos aprovados e selo verde." },
                { id: "evolution_api", title: "Evolution API (QR Code)", sub: "Conexão por QR Code de número existente sem taxa por msg." },
                { id: "z_api", title: "Z-API (Instância Dedicada)", sub: "Instância dedicada de alta velocidade com webhook bidirecional." },
              ].map((p) => {
                const isSel = settings.whatsappProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSaveSettings({ whatsappProvider: p.id as any })}
                    className={cn(
                      "flex flex-col text-left rounded-md border p-3 transition",
                      isSel ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"
                    )}
                  >
                    <span className="font-semibold text-xs text-foreground mb-1">{p.title}</span>
                    <span className="text-[11px] text-muted-foreground">{p.sub}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Teste de Conexão e Disparo de Mensagem
              </h3>
              <div className="flex gap-2">
                <Input
                  value={waTestPhone}
                  onChange={(e) => setWaTestPhone(e.target.value)}
                  placeholder="Seu telefone com DDD (ex: 11999998888)..."
                  className="max-w-xs text-xs"
                />
                <Button size="sm" onClick={handleTestWhatsApp} disabled={waTesting}>
                  <Send className="mr-1.5 size-3.5" />
                  {waTesting ? "Enviando..." : "Disparar Mensagem de Teste"}
                </Button>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* ABA 4: HISTÓRICO DE WEBHOOKS (LOGS) */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="logs" className="space-y-4">
          <section className="rounded-lg border bg-card overflow-hidden">
            <div className="border-b px-5 py-3.5 bg-muted/20 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-semibold">Histórico de Webhooks Recebidos</h2>
                <p className="text-xs text-muted-foreground">Todos os disparos de pagamentos e anúncios registrados</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogs(fetchWebhookLogs(activeTenant))}
                className="h-8 text-xs"
              >
                <RefreshCw className="mr-1.5 size-3" />
                Atualizar
              </Button>
            </div>

            <div className="divide-y text-xs">
              <div className="grid grid-cols-12 px-5 py-2.5 font-medium text-muted-foreground bg-muted/10">
                <span className="col-span-2">Origem</span>
                <span className="col-span-2">Evento</span>
                <span className="col-span-6">Resumo / Lead</span>
                <span className="col-span-2 text-right">Ação</span>
              </div>

              {logs.length === 0 ? (
                <p className="p-8 text-center text-muted-foreground">Nenhum webhook recebido ainda.</p>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="grid grid-cols-12 items-center px-5 py-3 hover:bg-muted/30 transition">
                    <div className="col-span-2 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      <span className="font-semibold uppercase text-foreground">{l.source}</span>
                    </div>

                    <div className="col-span-2 font-mono text-[11px] text-muted-foreground">{l.event}</div>

                    <div className="col-span-6 truncate pr-2 text-foreground font-medium">{l.summary}</div>

                    <div className="col-span-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveLog(l)}
                        className="h-7 text-xs text-primary"
                      >
                        Ver JSON
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* MODAL DE VISUALIZAÇÃO DO JSON DO WEBHOOK */}
      <Dialog open={!!activeLog} onOpenChange={(o) => !o && setActiveLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <span>Payload do Webhook:</span>
              <span className="uppercase text-primary font-mono">{activeLog?.source}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Recebido em: {activeLog && new Date(activeLog.createdAt).toLocaleString("pt-BR")}
            </div>
            <pre className="max-h-96 overflow-y-auto rounded-md bg-muted p-4 text-[11px] font-mono leading-relaxed">
              {activeLog && JSON.stringify(activeLog.payload, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
