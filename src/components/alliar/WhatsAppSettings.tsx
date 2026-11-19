import { useState } from "react";
import { MessageSquare, Phone, Volume2, Play, ExternalLink, ShieldCheck, Clock, BellRing, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { beep } from "@/lib/rules";
import { toE164 } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function WhatsAppSettings() {
  const app = useApp();
  const settings = app.automationSettings;

  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber || "");
  const [businessPhone, setBusinessPhone] = useState(settings.businessPhone || "");
  const [welcomeEnabled, setWelcomeEnabled] = useState(settings.welcomeEnabled ?? true);
  const [welcomeMessage, setWelcomeMessage] = useState(
    settings.welcomeMessage ||
      "Olá, {{nome}}! Recebemos seu interesse na {{empresa}}. Me chamo {{vendedor}} e vou te ajudar com o seu projeto. Como posso te atender hoje?"
  );
  const [antiVacuoEnabled, setAntiVacuoEnabled] = useState(settings.antiVacuoEnabled ?? true);
  const [antiVacuoMinutes, setAntiVacuoMinutes] = useState(settings.antiVacuoMinutes || 5);
  const [antiVacuoSound, setAntiVacuoSound] = useState(settings.antiVacuoSound ?? true);
  const [reminderEnabled, setReminderEnabled] = useState(settings.reminderEnabled ?? true);
  const [reminderMinutes, setReminderMinutes] = useState(settings.reminderMinutes || 120);

  const [simulating, setSimulating] = useState(false);

  function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    app.updateAutomationSettings({
      whatsappNumber,
      businessPhone,
      welcomeEnabled,
      welcomeMessage,
      antiVacuoEnabled,
      antiVacuoMinutes: Number(antiVacuoMinutes) || 5,
      antiVacuoSound,
      reminderEnabled,
      reminderMinutes: Number(reminderMinutes) || 120,
    });
    toast.success("Configurações de WhatsApp e automações salvas com sucesso!");
  }

  function handleTestSound() {
    beep();
    toast.info("Alerta sonoro emitido!");
  }

  async function handleSimulateAntiVacuo() {
    setSimulating(true);
    try {
      await app.simulateAntiVacuo();
    } finally {
      setSimulating(false);
    }
  }

  const cleanPhone = toE164(whatsappNumber);
  const hasValidPhone = cleanPhone.length >= 10;

  return (
    <section className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">WhatsApp & Linhas de Atendimento</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre os números de contato da empresa e configure mensagens e regras automáticas.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Números da Empresa */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center justify-between">
              <span>Número de WhatsApp da Empresa</span>
              {hasValidPhone ? (
                <span className="flex items-center text-xs text-green-400 font-normal">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Configurado
                </span>
              ) : (
                <span className="text-xs text-muted-foreground font-normal">Opcional</span>
              )}
            </label>
            <Input
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="Ex: (11) 98765-4321 ou +55 11 9..."
              maxLength={25}
            />
            {hasValidPhone && (
              <div className="pt-1">
                <a
                  href={`https://wa.me/${cleanPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs text-primary hover:underline"
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> Testar link direto: wa.me/{cleanPhone}
                </a>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center justify-between">
              <span>Telefone Comercial / 0800</span>
              <span className="text-xs text-muted-foreground font-normal">Opcional</span>
            </label>
            <Input
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              placeholder="Ex: (11) 4004-1234"
              maxLength={25}
            />
            <p className="text-xs text-muted-foreground">Exibido nas propostas e cabeçalho de atendimento.</p>
          </div>
        </div>

        {/* Automação 1: Boas-Vindas */}
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Disparo de Boas-Vindas Automático</span>
            </div>
            <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} />
          </div>
          <p className="text-xs text-muted-foreground">
            Envia uma mensagem automática de boas-vindas no WhatsApp assim que um novo lead entra no funil.
          </p>

          {welcomeEnabled && (
            <div className="space-y-2 pt-1">
              <label className="text-xs font-medium text-muted-foreground">Mensagem de Boas-Vindas:</label>
              <Textarea
                rows={3}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Digite o texto da mensagem..."
              />
              <p className="text-xs text-muted-foreground">
                Dica: você pode usar as tags <code className="bg-background px-1 py-0.5 rounded border text-[11px]">&#123;&#123;nome&#125;&#125;</code>, <code className="bg-background px-1 py-0.5 rounded border text-[11px]">&#123;&#123;empresa&#125;&#125;</code> e <code className="bg-background px-1 py-0.5 rounded border text-[11px]">&#123;&#123;vendedor&#125;&#125;</code> para preenchimento automático.
              </p>
            </div>
          )}
        </div>

        {/* Automação 2: Anti-Vácuo */}
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="font-medium text-sm">Regra Anti-Vácuo (Round-Robin)</span>
            </div>
            <Switch checked={antiVacuoEnabled} onCheckedChange={setAntiVacuoEnabled} />
          </div>
          <p className="text-xs text-muted-foreground">
            Se o lead estiver na etapa "Novos" e nenhum vendedor responder no tempo estipulado, o lead é transferido para o próximo vendedor da fila.
          </p>

          {antiVacuoEnabled && (
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Tempo limite para resposta (minutos):</label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={antiVacuoMinutes}
                  onChange={(e) => setAntiVacuoMinutes(Number(e.target.value))}
                  className="w-32"
                />
              </div>

              <div className="flex flex-col justify-end gap-2">
                <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                  <span className="text-xs font-medium">Alerta sonoro ao expirar SLA:</span>
                  <Switch checked={antiVacuoSound} onCheckedChange={setAntiVacuoSound} />
                  <Button type="button" variant="outline" size="sm" onClick={handleTestSound} className="text-xs h-7">
                    <Volume2 className="h-3 w-3 mr-1" /> Testar som
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Quer ver a regra agindo em tempo real?</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={simulating}
              onClick={handleSimulateAntiVacuo}
              className="text-xs"
            >
              <Play className="h-3 w-3 mr-1" /> {simulating ? "Simulando…" : "Simular transferência agora"}
            </Button>
          </div>
        </div>

        {/* Automação 3: Lembretes de Reunião */}
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-blue-400" />
              <span className="font-medium text-sm">Lembretes Automáticos de Reunião</span>
            </div>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>
          <p className="text-xs text-muted-foreground">
            Dispara automaticamente um lembrete com confirmação via WhatsApp para reduzir a taxa de faltas (no-show).
          </p>

          {reminderEnabled && (
            <div className="flex items-center gap-2 pt-1">
              <label className="text-xs font-medium">Antecedência do lembrete:</label>
              <Input
                type="number"
                min={15}
                max={1440}
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                className="w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">minutos antes da reunião (padrão: 120 = 2h)</span>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Salvar Configurações de WhatsApp & Automações</Button>
        </div>
      </form>
    </section>
  );
}
