import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Phone,
  PhoneOff,
  QrCode,
  Sparkles,
  MessageSquare,
  Mic,
  MicOff,
  Loader2,
  Delete,
  Search,
  Smartphone,
  Headphones,
  Copy,
  AlertTriangle,
  User,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { aiAssist } from "@/lib/ai.functions";
import { normalizePhoneForDialer, phoneKey } from "@/lib/whatsapp";
import {
  CALL_OUTCOMES,
  buildCallActivityText,
  getExternalActionLabel,
  getInitialOutcomeForMode,
  type CallMode,
  type CallStatus,
} from "@/lib/dialer";
import { PageHeader } from "@/components/alliar/Shell";
import { PhoneQrPanel } from "@/components/alliar/PhoneQrDialog";
import { useVoice } from "@/components/alliar/Voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/dialer")({
  head: () =>
    seo(
      "Discador Inteligente",
      "Discador telefônico, ligação via WhatsApp, click-to-call e teleprompter de IA em tempo real."
    ),
  component: DialerPage,
});

// Frequências DTMF padrão
const DTMF_FREQS: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

const DIALPAD = [
  { key: "1", sub: "" },
  { key: "2", sub: "ABC" },
  { key: "3", sub: "DEF" },
  { key: "4", sub: "GHI" },
  { key: "5", sub: "JKL" },
  { key: "6", sub: "MNO" },
  { key: "7", sub: "PQRS" },
  { key: "8", sub: "TUV" },
  { key: "9", sub: "WXYZ" },
  { key: "*", sub: "" },
  { key: "0", sub: "+" },
  { key: "#", sub: "" },
];

function triggerTelProtocol(telUri: string) {
  const link = document.createElement("a");
  link.href = telUri;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function DialerPage() {
  const { leads, members, currentUserId, select, addEvent, updateLead } = useApp();
  const ai = useServerFn(aiAssist);

  // Estados de chamada
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchLead, setSearchLead] = useState("");
  const [callActive, setCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callMode, setCallMode] = useState<CallMode>("whatsapp");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<string>("Apenas abriu discador / WhatsApp");
  const [nextContactAt, setNextContactAt] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Áudio DTMF
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Preenche número/lead via parâmetros de URL (?leadId=...&phone=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paramLeadId = params.get("leadId");
    const paramPhone = params.get("phone");
    if (paramLeadId) {
      setSelectedLeadId(paramLeadId);
      const found = leads.find((l) => l.id === paramLeadId);
      if (found?.phone && !paramPhone) {
        setPhoneNumber(found.phone);
      }
    }
    if (paramPhone) {
      setPhoneNumber(paramPhone);
    }
  }, [leads]);

  // Limpa recursos de áudio ao sair da página
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playDtmfTone = (digit: string) => {
    const freqs = DTMF_FREQS[digit];
    if (!freqs) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];

      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  // Microfone / Ditado automático da ligação
  const voice = useVoice((transcription) => {
    setNotes((prev) => `${prev}${prev ? "\n" : ""}${transcription}`);
  });

  // Identificação do vendedor atual
  const sellerName = useMemo(() => {
    const me = members.find((m) => m.user_id === currentUserId);
    return me?.display_name || me?.email || "Vendedor";
  }, [members, currentUserId]);

  // Validação e normalização do telefone atual
  const parsedPhone = useMemo(() => normalizePhoneForDialer(phoneNumber), [phoneNumber]);

  // Lead selecionado
  const currentLead = useMemo(() => {
    if (selectedLeadId) {
      return leads.find((l) => l.id === selectedLeadId) ?? null;
    }
    const key = phoneKey(phoneNumber);
    if (!key || key.length < 10) return null;
    return leads.find((l) => l.phone && phoneKey(l.phone) === key) ?? null;
  }, [leads, selectedLeadId, phoneNumber]);

  // Carregar dados de um lead ao clicar na lista
  const handleSelectLead = (leadId: string) => {
    const l = leads.find((x) => x.id === leadId);
    if (!l) return;
    setSelectedLeadId(l.id);
    if (l.phone) {
      setPhoneNumber(l.phone);
    }
  };

  // Teleprompter IA
  const promptAi = async (currentNotes = notes) => {
    if (!currentLead) return;
    setBusy(true);
    try {
      const res = await ai({
        data: {
          task: "teleprompter",
          context: `Cliente: ${currentLead.name} (empresa: ${currentLead.company || "não informada"}), valor em negociação: R$ ${currentLead.value || 0}, etapa do funil: ${currentLead.stage}, temperatura: ${currentLead.temp}. Últimas interações: ${currentLead.timeline.slice(-4).map((e) => e.text).join(" | ") || "nenhuma registrada"}.`,
          messages: [
            {
              role: "user",
              content: currentNotes
                ? `Anotações da chamada atual: ${currentNotes}`
                : "O vendedor iniciou contato com este cliente. Dê um roteiro objetivo de abertura consultiva.",
            },
          ],
        },
      });
      if (res.error) toast.error(res.error);
      else setScript(res.text);
    } finally {
      setBusy(false);
    }
  };

  const pressKey = (key: string) => {
    playDtmfTone(key);
    setPhoneNumber((prev) => prev + key);
  };

  const handleCopyNumber = async () => {
    const valueToCopy = parsedPhone.valid ? parsedPhone.display : phoneNumber.trim();
    if (!valueToCopy) {
      toast.error("Digite um número para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(valueToCopy);
      toast.success(`Número copiado: ${valueToCopy}`);
    } catch {
      toast.error("Não foi possível copiar o número.");
    }
  };

  // Iniciar ação de chamada
  const startCall = (mode: CallMode) => {
    if (mode === "browser") {
      setCallMode("browser");
      setCallStatus("sip_unconfigured");
      setCallActive(false);
      toast.info(
        "Softphone SIP no navegador ainda não está configurado para este tenant. Use Celular (tel:), WhatsApp ou QR Code.",
        { duration: 5000 }
      );
      return;
    }

    if (!parsedPhone.valid) {
      toast.error(parsedPhone.error || "Digite um número de telefone válido com DDD.");
      return;
    }

    setCallMode(mode);
    setCallActive(true);
    setCallStatus("external_opened");
    setOutcome(getInitialOutcomeForMode(mode));
    setNotes("");
    setNextContactAt("");
    setScript("");

    if (mode === "whatsapp") {
      window.open(parsedPhone.waUrl, "_blank", "noopener,noreferrer");
      toast.info("WhatsApp aberto em nova aba. Após a conversa/ligação, registre manualmente o resultado real.");
    } else if (mode === "tel") {
      triggerTelProtocol(parsedPhone.telUri);
      toast.info(
        "Discador do dispositivo acionado (tel:). Em computadores sem app de telefonia, use o QR Code ou copie o número.",
        { duration: 5000 }
      );
    }

    if (currentLead) {
      setTimeout(() => void promptAi(""), 400);
    }
  };

  // Registrar resultado real da ação/chamada
  const finishCall = async () => {
    if (voice.rec) voice.toggle();

    const phoneDisplay = parsedPhone.valid ? parsedPhone.display : phoneNumber.trim();
    const activityText = buildCallActivityText({
      mode: callMode,
      status: callStatus,
      outcome,
      phoneDisplay,
      sellerName,
      notes,
      nextContactAt,
    });

    if (currentLead) {
      await addEvent(currentLead.id, {
        kind: "call",
        text: activityText,
      });

      const leadPatch: { lastContact: string; nextAction?: string } = {
        lastContact: new Date().toISOString(),
      };
      if (nextContactAt.trim()) {
        leadPatch.nextAction = nextContactAt.trim();
      }
      await updateLead(currentLead.id, leadPatch);

      toast.success(`Registro salvo no histórico de ${currentLead.name}.`);
    } else {
      toast.info("Registro encerrado (nenhum lead vinculado ao número).");
    }

    setCallActive(false);
    setCallStatus("ended");
    setNotes("");
    setNextContactAt("");
    setScript("");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Alliar Voice · Central de Ligações"
        sub="Ligue pelo celular (tel:), abra no WhatsApp ou escaneie o QR Code com registro manual no histórico."
      />

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* COLUNA ESQUERDA: LISTA DE LEADS PARA DISCAGEM RÁPIDA (4 colunas) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#E0D5C3] bg-[#FFFDF9] shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#554D43]">
              Contatos & Funil
            </span>
            <span className="text-[11px] text-[#7A6F62]">{leads.length} leads</span>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchLead}
              onChange={(e) => setSearchLead(e.target.value)}
              placeholder="Buscar por nome ou número…"
              className="pl-8 h-8 text-xs bg-[#FBF9F5] border-[#DED4C5]"
            />
          </div>

          <div className="max-h-[500px] overflow-y-auto divide-y divide-[#EAE2D5] rounded-xl border border-[#EAE2D5] bg-white">
            {leads
              .filter(
                (l) =>
                  l.name.toLowerCase().includes(searchLead.toLowerCase()) ||
                  (l.phone && l.phone.includes(searchLead)) ||
                  (l.company && l.company.toLowerCase().includes(searchLead.toLowerCase()))
              )
              .map((l) => {
                const isSelected = selectedLeadId === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleSelectLead(l.id)}
                    className={cn(
                      "w-full p-2.5 text-left transition-colors flex items-center justify-between hover:bg-[#F7F3EB]",
                      isSelected && "bg-[#EFE8DC] font-semibold"
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-xs font-bold text-[#2B2520]">{l.name}</div>
                      <div className="truncate text-[10px] text-[#7A6F62]">
                        {l.company ? `${l.company} · ` : ""}
                        <span className="font-mono">{l.phone || "sem fone"}</span>
                      </div>
                    </div>
                    <div className="shrink-0 size-7 rounded-lg bg-[#C25E38]/10 text-[#C25E38] grid place-items-center">
                      <Phone className="size-3.5" />
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* COLUNA CENTRAL: TECLADO NUMÉRICO E CONTROLES DE CHAMADA (5 colunas) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#E0D5C3] bg-[#FFFDF9] shadow-sm p-5 space-y-4">
          {/* DISPLAY DO NÚMERO */}
          <div className="rounded-xl border border-[#DED4C5] bg-[#FBF9F5] p-3 text-center space-y-1.5">
            <div className="text-xs text-[#7A6F62] font-medium flex items-center justify-center gap-1.5">
              {currentLead ? (
                <>
                  <User className="size-3 text-[#C25E38]" />
                  <span>
                    Contato: <strong>{currentLead.name}</strong>
                    {currentLead.company ? ` (${currentLead.company})` : ""}
                  </span>
                </>
              ) : (
                <span>Vendedor: {sellerName} · Digite o número com DDD</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-1">
              <Input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    startCall("tel");
                  }
                }}
                placeholder="(DDD) 90000-0000"
                className="text-xl sm:text-2xl font-bold font-mono text-center tracking-wider text-[#2B2520] bg-white border-[#DED4C5] h-12 rounded-xl"
              />
              {phoneNumber && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyNumber}
                    className="p-2.5 rounded-xl text-[#7A6F62] hover:text-[#2B2520] hover:bg-stone-200 transition-colors shrink-0"
                    title="Copiar número"
                    aria-label="Copiar número"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoneNumber("")}
                    className="p-2.5 rounded-xl text-[#7A6F62] hover:text-[#C25E38] hover:bg-stone-200 transition-colors shrink-0"
                    title="Limpar número"
                    aria-label="Limpar número"
                  >
                    <Delete className="size-5" />
                  </button>
                </>
              )}
            </div>

            {phoneNumber.trim() && (
              <div className="text-[11px]">
                {parsedPhone.valid ? (
                  <span className="font-mono text-emerald-700">{parsedPhone.display}</span>
                ) : (
                  <span className="text-amber-700">{parsedPhone.error}</span>
                )}
              </div>
            )}
          </div>

          {callStatus === "sip_unconfigured" && !callActive && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
              <div className="space-y-1">
                <p className="font-bold">Softphone SIP não configurado</p>
                <p className="text-[11px] text-amber-900">
                  Este ambiente ainda não possui servidor Asterisk/SIP conectado para ligações diretas pelo navegador.
                  Utilize <strong>Celular (tel:)</strong>, <strong>WhatsApp</strong> ou o <strong>QR Code</strong> abaixo.
                </p>
              </div>
            </div>
          )}

          {/* TECLADO NUMÉRICO (DIALPAD) */}
          {!callActive && (
            <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto py-1">
              {DIALPAD.map(({ key, sub }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  className="size-16 rounded-2xl border border-[#E0D5C3] bg-white hover:bg-[#F7F3EB] active:scale-95 transition-all shadow-2xs flex flex-col items-center justify-center cursor-pointer group"
                >
                  <span className="text-xl font-bold text-[#2B2520] group-hover:text-[#C25E38]">
                    {key}
                  </span>
                  {sub && (
                    <span className="text-[9px] font-semibold tracking-widest text-[#9C9082]">
                      {sub}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* BOTÕES DE DISCAGEM */}
          {!callActive ? (
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                onClick={() => startCall("whatsapp")}
                className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <MessageSquare className="size-4" /> Abrir no WhatsApp (wa.me)
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startCall("tel")}
                  className="h-10 rounded-xl border-[#DED4C5] font-semibold text-xs flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="size-4 text-blue-600" /> Celular (tel:)
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startCall("browser")}
                  className="h-10 rounded-xl border-[#DED4C5] font-semibold text-xs flex items-center justify-center gap-1.5 text-muted-foreground"
                >
                  <Headphones className="size-4" /> Softphone SIP
                </Button>
              </div>

              {/* QR CODE PARA CELULAR / WHATSAPP / JITSI */}
              <div className="text-center pt-1 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className="text-[11px] text-[#7A6F62] hover:text-[#2B2520] underline inline-flex items-center gap-1"
                >
                  <QrCode className="size-3" />
                  {showQr ? "Ocultar QR Code" : "QR Code para ligar ou abrir WhatsApp no celular"}
                </button>
                {showQr && (
                  <PhoneQrPanel
                    phone={phoneNumber}
                    leadName={currentLead?.name}
                    compact
                  />
                )}
              </div>
            </div>
          ) : (
            /* PAINEL DE REGISTRO MANUAL APÓS AÇÃO EXTERNA */
            <div className="rounded-2xl border-2 border-[#C25E38]/30 bg-[#FFFDF9] p-4 space-y-4 shadow-sm animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-bold text-amber-800">
                    {getExternalActionLabel(callMode, callStatus)}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#7A6F62]">
                  {parsedPhone.valid ? parsedPhone.display : phoneNumber}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={voice.rec ? "destructive" : "secondary"}
                  onClick={voice.toggle}
                  className="text-xs"
                >
                  {voice.rec ? (
                    <>
                      <MicOff className="mr-1 size-3.5" /> Parar Ditado
                    </>
                  ) : (
                    <>
                      <Mic className="mr-1 size-3.5" /> Ditar Anotação
                    </>
                  )}
                </Button>

                {currentLead && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      select(currentLead.id);
                      setTimeout(() => window.dispatchEvent(new Event("alliar:pix")), 50);
                    }}
                    className="text-xs border-[#C25E38]/30 text-[#C25E38]"
                  >
                    <QrCode className="mr-1 size-3.5" /> Enviar PIX
                  </Button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#554D43] mb-1">
                  Resultado real da tentativa:
                </label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="w-full text-xs h-9 rounded-lg border border-[#DED4C5] bg-white px-2"
                >
                  {CALL_OUTCOMES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#554D43] mb-1">
                  Observações da conversa:
                </label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anote detalhes tratados com o cliente..."
                  className="text-xs bg-[#FBF9F5] border-[#DED4C5]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#554D43] mb-1 flex items-center gap-1">
                  <Calendar className="size-3" /> Próximo contato (opcional):
                </label>
                <Input
                  type="text"
                  value={nextContactAt}
                  onChange={(e) => setNextContactAt(e.target.value)}
                  placeholder="Ex: Amanhã às 14h - enviar proposta"
                  className="text-xs h-8 bg-[#FBF9F5] border-[#DED4C5]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCallActive(false);
                    setCallStatus("idle");
                  }}
                  className="h-11 rounded-xl border-[#DED4C5]"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={finishCall}
                  className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <PhoneOff className="size-4" /> Registrar no Histórico
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: TELEPROMPTER DE IA E PONTOS DO LEAD (3 colunas) */}
        <div className="lg:col-span-3 rounded-2xl border border-[#E0D5C3] bg-[#FFFDF9] shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#C25E38] flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> Teleprompter IA
            </span>
            {busy && <Loader2 className="size-3.5 animate-spin text-[#C25E38]" />}
          </div>

          <p className="text-[11px] text-[#7A6F62] leading-relaxed">
            Dicas perspicazes e roteiro de negociação gerados com base no perfil do cliente.
          </p>

          <div className="min-h-36 rounded-xl border border-[#E0D5C3] bg-[#F7F3EB] p-3 text-xs text-[#2B2520] leading-relaxed whitespace-pre-wrap">
            {script ||
              (busy
                ? "Consultando inteligência comercial…"
                : "Selecione um cliente e inicie a chamada para receber o roteiro em tempo real.")}
          </div>

          {currentLead && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => promptAi()}
              disabled={busy}
              className="w-full text-xs border-[#C25E38]/30 text-[#C25E38] hover:bg-[#C25E38]/10"
            >
              <Sparkles className="mr-1.5 size-3" /> Atualizar Argumentos
            </Button>
          )}

          {currentLead && (
            <div className="rounded-xl border border-[#EAE2D5] bg-white p-3 space-y-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase text-[#9C9082] block">
                Dados Comerciais
              </span>
              <div className="flex justify-between">
                <span className="text-[#7A6F62]">Negócio:</span>
                <span className="font-bold text-[#166534]">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    currentLead.value || 0
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A6F62]">Etapa:</span>
                <span className="font-semibold capitalize text-[#2B2520]">{currentLead.stage}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
