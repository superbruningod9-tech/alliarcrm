import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Copy, Gift, Link2, Plus, Send, Share2, Sparkles, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { seo } from "@/lib/seo";
import { brl } from "@/lib/pix";
import { useApp } from "@/lib/store";
import { summarizeReferrals, generateClientReferralLink } from "@/lib/alliar-modules";
import { PageHeader } from "@/components/alliar/Shell";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/indicacoes")({
  head: () => seo("Programa de Indicações", "Member-Get-Member com links mágicos individuais e conversões automáticas."),
  component: ReferralPage,
});

function ReferralPage() {
  const { leads, referrals, addReferral, referralRewardPct, setReferralRewardPct, addLead } = useApp();

  const [pct, setPct] = useState(referralRewardPct || 10);
  const [ticket] = useState(2500);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Formulário de nova indicação
  const [refClient, setRefClient] = useState("");
  const [refClientName, setRefClientName] = useState("");
  const [candName, setCandName] = useState("");
  const [candPhone, setCandPhone] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [candCompany, setCandCompany] = useState("");
  const [candValue, setCandValue] = useState("2500");

  // Lista de clientes disponíveis
  const availableClients = useMemo(() => {
    const list = leads.map((l) => ({
      id: l.contactId || l.id,
      name: l.name || l.company || "Cliente",
    }));

    // Se a lista estiver vazia, adiciona os indicadores padrão
    const defaults = [
      { id: "c-beatriz", name: "Beatriz Nunes" },
      { id: "c-mariana", name: "Mariana Costa" },
      { id: "c-diego", name: "Diego Martins" },
    ];

    const uniqueMap = new Map<string, { id: string; name: string }>();
    defaults.forEach((d) => uniqueMap.set(d.id, d));
    list.forEach((l) => uniqueMap.set(l.id, l));

    return Array.from(uniqueMap.values());
  }, [leads]);

  // Resumo por cliente
  const summary = useMemo(() => {
    return summarizeReferrals(referrals, availableClients);
  }, [referrals, availableClients]);

  const handleSaveRule = () => {
    setReferralRewardPct(pct);
  };

  const handleCopyLink = (url: string, name: string) => {
    void navigator.clipboard?.writeText(url);
    toast.success(`Link mágico copiado para ${name}!`);
  };

  const handleShareWhatsApp = (url: string, name: string) => {
    const msg = encodeURIComponent(
      `Olá, ${name}! Participe do programa de indicações da Alliar: indique amigos e parceiros pelo seu link mágico exclusivo (${url}) e ganhe ${pct}% de cashback em cada venda concluída!`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candName.trim() || !refClient) return;

    setBusy(true);
    try {
      const selectedClientObj = availableClients.find((c) => c.id === refClient);
      const referrerName = selectedClientObj?.name || refClientName || "Cliente Indicador";
      const valueNum = Number(candValue) || 2500;

      // 1. Cria o lead diretamente no funil na etapa "Novos" com tag de indicação
      const newLeadId = await addLead(
        {
          name: candName.trim(),
          company: candCompany.trim() || "Indicado por " + referrerName,
          phone: candPhone.trim(),
          email: candEmail.trim(),
          value: valueNum,
        },
        undefined,
        {
          referrerContactId: refClient,
          referrerName,
        }
      );

      // 2. Registra na tabela de indicações com status "indicado"
      await addReferral({
        referrerContactId: refClient,
        referrerName,
        referredName: candName.trim(),
        referredPhone: candPhone.trim(),
        referredEmail: candEmail.trim(),
        dealValue: valueNum,
      });

      toast.success(`Indicação registrada! Lead criado no Funil com mensagem de boas-vindas automática.`);
      setModalOpen(false);
      setCandName("");
      setCandPhone("");
      setCandEmail("");
      setCandCompany("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar indicação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Programa de Indicações (Member-Get-Member)"
        sub="Links mágicos individuais para cada cliente indicar contatos com registro e conversão de cashback automáticos."
      >
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Registrar Indicação
        </Button>
      </PageHeader>

      {/* REGRAS E CALCULADORA DE CASHBACK */}
      <section className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="size-5 text-primary" />
            <h2 className="text-sm font-semibold">Calculadora e Parâmetros de Recompensa</h2>
          </div>
          <span className="font-mono text-base font-bold text-primary">{pct}%</span>
        </div>

        <Slider value={[pct]} max={30} min={1} step={1} onValueChange={([v]) => setPct(v ?? 10)} />

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
          <p>
            Em um ticket médio de {brl(ticket)}, o cliente que indica recebe{" "}
            <b className="text-foreground font-semibold">{brl((ticket * pct) / 100)}</b> por indicação convertida.
          </p>
          <Button size="sm" onClick={handleSaveRule} className="h-8">
            Salvar regra ({pct}%)
          </Button>
        </div>
      </section>

      {/* BANNER DE FLUXO AUTOMÁTICO */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs">
        <Sparkles className="size-5 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">Como funciona a conversão automática:</p>
          <p className="text-muted-foreground">
            Cada cliente possui seu link mágico único abaixo. Ao receber a indicação, o lead entra na etapa "Novos" do funil. Quando o negócio for movido para <b>"Ganho"</b>, o sistema registra automaticamente a conversão e credita o cashback do cliente indicador!
          </p>
        </div>
      </div>

      {/* TABELA DE RECOMPENSAS E LINKS MÁGICOS INDIVIDUAIS */}
      <section className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b px-5 py-3.5 bg-muted/20 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold">Links Mágicos Individuais e Conversões</h2>
            <p className="text-xs text-muted-foreground">Acompanhe as indicações e compartilhe o link de cada cliente</p>
          </div>
          <span className="text-xs font-mono font-medium text-muted-foreground">
            {summary.reduce((a, s) => a + s.totalConverted, 0)} conversões registradas
          </span>
        </div>

        <div className="divide-y text-sm">
          <div className="grid grid-cols-12 px-5 py-2.5 text-xs font-medium text-muted-foreground bg-muted/10">
            <span className="col-span-4">Cliente Indicador</span>
            <span className="col-span-4">Link Mágico Individual</span>
            <span className="col-span-2 text-center">Indicou / Comprou</span>
            <span className="col-span-2 text-right">Recompensa Total</span>
          </div>

          {summary.map((s) => (
            <div key={s.contactId} className="grid grid-cols-12 items-center px-5 py-3 hover:bg-muted/30 transition">
              <div className="col-span-4 min-w-0 pr-2">
                <div className="font-medium truncate text-foreground">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">ID: {s.contactId}</div>
              </div>

              <div className="col-span-4 flex items-center gap-1.5 pr-2">
                <code className="text-[11px] bg-muted px-2 py-1 rounded truncate flex-1 font-mono text-muted-foreground">
                  {s.magicLink}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  title="Copiar link mágico"
                  onClick={() => handleCopyLink(s.magicLink, s.name)}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-emerald-500 hover:text-emerald-600"
                  title="Enviar convite no WhatsApp"
                  onClick={() => handleShareWhatsApp(s.magicLink, s.name)}
                >
                  <Send className="size-3.5" />
                </Button>
              </div>

              <div className="col-span-2 text-center font-mono">
                <span className="font-medium">{s.totalReferred}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-bold text-emerald-500">{s.totalConverted}</span>
              </div>

              <div className="col-span-2 text-right font-semibold text-primary font-mono">
                {brl(s.totalReward || (s.totalConverted * ticket * pct) / 100)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MODAL PARA REGISTRAR NOVA INDICAÇÃO */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Nova Indicação</DialogTitle>
          </DialogHeader>
          <form className="space-y-3.5" onSubmit={handleCreateReferral}>
            <div>
              <label className="block text-xs font-medium mb-1">Qual cliente está fazendo a indicação?</label>
              <select
                value={refClient}
                onChange={(e) => {
                  setRefClient(e.target.value);
                  const f = availableClients.find((c) => c.id === e.target.value);
                  if (f) setRefClientName(f.name);
                }}
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Selecione o cliente indicador...</option>
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t pt-3 space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dados do Contato Indicado
              </span>
              <div>
                <label className="block text-xs font-medium mb-1">Nome do indicado *</label>
                <Input
                  value={candName}
                  onChange={(e) => setCandName(e.target.value)}
                  placeholder="Nome do contato ou responsável"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Empresa / Clínica</label>
                <Input
                  value={candCompany}
                  onChange={(e) => setCandCompany(e.target.value)}
                  placeholder="Nome da empresa do indicado"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Telefone / WhatsApp</label>
                  <Input
                    value={candPhone}
                    onChange={(e) => setCandPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Valor estimado (R$)</label>
                  <Input
                    type="number"
                    value={candValue}
                    onChange={(e) => setCandValue(e.target.value)}
                    placeholder="2500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || !candName.trim() || !refClient}>
                Criar Lead e Registrar Indicação
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
