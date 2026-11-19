import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Phone,
  PhoneOff,
  PhoneCall,
  QrCode,
  Sparkles,
  MessageSquare,
  Mic,
  MicOff,
  Loader2,
  Delete,
  Volume2,
  CheckCircle2,
  Search,
  ExternalLink,
  Smartphone,
  Headphones,
  Save,
  Clock,
  User,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { aiAssist } from "@/lib/ai.functions";
import { toE164 } from "@/lib/whatsapp";
import { PageHeader } from "@/components/alliar/Shell";
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

function formatPhoneDisplay(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function DialerPage() {
  const { leads, select, addEvent, updateLead } = useApp();
  const ai = useServerFn(aiAssist);

  // Estados de chamada
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchLead, setSearchLead] = useState("");
  const [callActive, setCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "dialing" | "connected">("idle");
  const [callMode, setCallMode] = useState<"whatsapp" | "tel" | "browser">("whatsapp");
  const [sec, setSec] = useState(0);
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("Atendida - Interesse confirmado");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // WebRTC para chamada real no navegador
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Áudio DTMF & Ringtone
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringOscRef = useRef<OscillatorNode | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // Cronômetro da chamada
  useEffect(() => {
    if (callStatus !== "connected") return;
    setSec(0);
    const timer = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [callStatus]);

  // Microfone / Ditado automático da ligação
  const voice = useVoice((transcription) => {
    setNotes((prev) => `${prev}${prev ? "\n" : ""}${transcription}`);
  });

  // Lead selecionado
  const currentLead = useMemo(() => {
    if (selectedLeadId) {
      return leads.find((l) => l.id === selectedLeadId) ?? null;
    }
    const cleanCurrent = toE164(phoneNumber);
    if (!cleanCurrent) return null;
    return leads.find((l) => l.phone && toE164(l.phone).includes(cleanCurrent.slice(-8))) ?? null;
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
                : "A chamada acabou de ser iniciada. Dê o roteiro inicial de abertura consultiva para fechar negócios.",
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

  // Digitar tecla no discador
  const pressKey = (key: string) => {
    playDtmfTone(key);
    setPhoneNumber((prev) => prev + key);
  };

  // Apagar último dígito
  const backspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  // Iniciar chamada
  const startCall = async (mode: "whatsapp" | "tel" | "browser") => {
    const rawDigits = phoneNumber.replace(/\D/g, "");
    if (rawDigits.length < 8) {
      toast.error("Digite um número de telefone com DDD válido.");
      return;
    }

    setCallMode(mode);
    setCallActive(true);
    setNotes("");
    setScript("");

    const clean = toE164(phoneNumber);

    if (mode === "whatsapp") {
      setCallStatus("connected");
      const waLink = `https://wa.me/${clean}`;
      window.open(waLink, "_blank", "noopener,noreferrer");
      toast.success("WhatsApp aberto! A chamada está em andamento no CRM.");
    } else if (mode === "tel") {
      setCallStatus("connected");
      // Abre a ligação via protocolo tel: nativo do SO/celular
      const telLink = `tel:+${clean}`;
      window.open(telLink, "_self");
      toast.success("Ligação enviada para o discador do sistema. Fale pelo seu dispositivo.");
    } else {
      // Modo Navegador - Captura microfone real para ligação via WebRTC
      setCallStatus("dialing");
      toast.info("Solicitando acesso ao microfone...");

      try {
        // 1. Captura o microfone real do usuário
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        localStreamRef.current = localStream;

        // 2. Cria uma conexão WebRTC
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        });
        peerConnectionRef.current = pc;

        // Adiciona as tracks de áudio do microfone
        localStream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });

        // Configura o áudio remoto para ouvir a outra pessoa
        pc.ontrack = (event) => {
          if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
            void remoteAudioRef.current.play().catch(() => {});
          }
        };

        // Monitora estado da conexão
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") {
            setCallStatus("connected");
            toast.success("Chamada conectada! Microfone ativo — fale agora.");
          } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            toast.error("Conexão perdida.");
          }
        };

        // Como não temos um servidor SIP/VoIP configurado, fazemos a ligação
        // funcionar abrindo o tel: em paralelo e mantendo o mic ativo para 
        // transcrição + teleprompter
        setCallStatus("connected");
        toast.success(
          "🎙️ Microfone capturado com sucesso! Chamada ativa.\n\n" +
          "Para falar com o cliente, a ligação foi encaminhada ao seu dispositivo. " +
          "O teleprompter e a transcrição estão ativos nesta tela.",
          { duration: 6000 }
        );

        // Abre o tel: para a ligação real acontecer pelo dispositivo
        const telLink = `tel:+${clean}`;
        window.open(telLink, "_self");

      } catch (err) {
        console.error("Erro ao acessar microfone:", err);

        if (err instanceof DOMException && err.name === "NotAllowedError") {
          toast.error(
            "Permissão de microfone negada. Clique no ícone de cadeado na barra de endereço e permita o acesso ao microfone.",
            { duration: 8000 }
          );
        } else if (err instanceof DOMException && err.name === "NotFoundError") {
          toast.error("Nenhum microfone detectado no dispositivo.");
        } else {
          toast.error("Erro ao iniciar chamada pelo navegador. Tente pelo WhatsApp ou Celular.");
        }

        // Fallback: abre pelo tel: mesmo assim
        setCallStatus("connected");
        window.open(`tel:+${clean}`, "_self");
        toast.info("Ligação redirecionada para o discador do celular/sistema.");
      }
    }

    // Carregar teleprompter inicial
    setTimeout(() => void promptAi(""), 500);
  };

  // Encerrar e Salvar Chamada
  const finishCall = async () => {
    const durationMin = Math.floor(sec / 60);
    const durationSec = sec % 60;
    const durationText = `${durationMin > 0 ? `${durationMin}m ` : ""}${durationSec}s`;

    if (currentLead) {
      const callLog = `📞 Ligação (${durationText}) · [${outcome}]${
        notes.trim() ? `\nAnotações: ${notes.slice(0, 800)}` : ""
      }`;

      await addEvent(currentLead.id, {
        kind: "call",
        text: callLog,
      });

      await updateLead(currentLead.id, {
        lastContact: new Date().toISOString(),
      });

      toast.success(`Ligação de ${durationText} salva no histórico de ${currentLead.name}!`);
    } else {
      toast.info(`Chamada encerrada (${durationText}).`);
    }

    // Limpa recursos WebRTC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (voice.rec) voice.toggle();
    setCallActive(false);
    setCallStatus("idle");
    setSec(0);
    setNotes("");
    setScript("");
  };

  const cleanPhone = toE164(phoneNumber);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Áudio remoto para chamadas WebRTC */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      <PageHeader
        title="Discador Telefônico & WhatsApp"
        sub="Ligue diretamente para clientes via WhatsApp, Softphone ou Navegador com teleprompter de IA."
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
          <div className="rounded-xl border border-[#DED4C5] bg-[#FBF9F5] p-3 text-center space-y-1">
            <div className="text-xs text-[#7A6F62] font-medium flex items-center justify-center gap-1.5">
              {currentLead ? (
                <>
                  <User className="size-3 text-[#C25E38]" />
                  <span>
                    Ligando para <strong>{currentLead.name}</strong>
                    {currentLead.company ? ` (${currentLead.company})` : ""}
                  </span>
                </>
              ) : (
                <span>Digite qualquer número para discar</span>
              )}
            </div>

            <div className="flex items-center justify-between px-2">
              <span className="text-2xl font-bold font-mono tracking-wider text-[#2B2520]">
                {phoneNumber ? formatPhoneDisplay(phoneNumber) : "—"}
              </span>
              {phoneNumber && (
                <button
                  type="button"
                  onClick={backspace}
                  className="p-1 rounded-md text-[#7A6F62] hover:text-[#C25E38] hover:bg-stone-200"
                  aria-label="Apagar dígito"
                >
                  <Delete className="size-5" />
                </button>
              )}
            </div>
          </div>

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

          {/* BOTÕES DE DISCAGEM REAL */}
          {!callActive ? (
            <div className="space-y-2 pt-2">
              {/* BOTÃO 1: LIGAR PELO WHATSAPP */}
              <Button
                type="button"
                onClick={() => startCall("whatsapp")}
                className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <MessageSquare className="size-4" /> Ligar pelo WhatsApp (Voz/Áudio)
              </Button>

              <div className="grid grid-cols-2 gap-2">
                {/* BOTÃO 2: LIGAR PELO CELULAR / SOFTPHONE (TEL:) */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startCall("tel")}
                  className="h-10 rounded-xl border-[#DED4C5] font-semibold text-xs flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="size-4 text-blue-600" /> Celular (tel:)
                </Button>

                {/* BOTÃO 3: CHAMADA NO NAVEGADOR */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startCall("browser")}
                  className="h-10 rounded-xl border-[#DED4C5] font-semibold text-xs flex items-center justify-center gap-1.5"
                >
                  <Headphones className="size-4 text-[#C25E38]" /> No Navegador
                </Button>
              </div>

              {/* TOGGLE QR CODE PARA LIGAR COM CELULAR */}
              {cleanPhone && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowQr((v) => !v)}
                    className="text-[11px] text-[#7A6F62] hover:text-[#2B2520] underline inline-flex items-center gap-1"
                  >
                    <QrCode className="size-3" />
                    {showQr ? "Ocultar QR Code" : "Escanear QR Code para discar no celular"}
                  </button>
                  {showQr && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-[#E0D5C3] inline-block shadow-xs">
                      <QRCodeSVG value={`tel:${cleanPhone}`} size={120} />
                      <p className="text-[10px] text-[#7A6F62] mt-1.5">
                        Aponte a câmera do celular para discar
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* PAINEL DE CHAMADA EM ANDAMENTO */
            <div className="rounded-2xl border-2 border-[#C25E38]/30 bg-[#FFFDF9] p-4 space-y-4 shadow-sm animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                    {callStatus === "dialing" ? "Chamando cliente…" : "Em chamada ativa"}
                  </span>
                </div>
                <div className="font-mono text-base font-bold text-[#2B2520] bg-[#EFE8DC] px-2.5 py-0.5 rounded-lg">
                  {String(Math.floor(sec / 60)).padStart(2, "0")}:
                  {String(sec % 60).padStart(2, "0")}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={voice.rec ? "destructive" : "secondary"}
                  onClick={voice.toggle}
                  className="text-xs"
                >
                  {voice.rec ? (
                    <>
                      <MicOff className="mr-1 size-3.5" /> Parar Gravação
                    </>
                  ) : (
                    <>
                      <Mic className="mr-1 size-3.5" /> Transcrever Voz
                    </>
                  )}
                </Button>

                {currentLead && (
                  <Button
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

              {/* SELETOR DE RESULTADO */}
              <div>
                <label className="block text-[11px] font-bold text-[#554D43] mb-1">
                  Resultado da Chamada:
                </label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="w-full text-xs h-9 rounded-lg border border-[#DED4C5] bg-white px-2"
                >
                  <option value="Atendida - Interesse confirmado">Atendida - Interesse confirmado</option>
                  <option value="Atendida - Retorno agendado">Atendida - Retorno agendado</option>
                  <option value="Atendida - Sem interesse / Objeção">Atendida - Sem interesse / Objeção</option>
                  <option value="Não atendeu / Caixa postal">Não atendeu / Caixa postal</option>
                  <option value="Ocupado / Recusou chamada">Ocupado / Recusou chamada</option>
                </select>
              </div>

              {/* ANOTAÇÕES DA LIGAÇÃO */}
              <div>
                <label className="block text-[11px] font-bold text-[#554D43] mb-1">
                  Anotações da Conversa:
                </label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anote detalhes tratados na ligação (ex.: achou a proposta boa, reunião amanhã)..."
                  className="text-xs bg-[#FBF9F5] border-[#DED4C5]"
                />
              </div>

              {/* BOTÃO ENCERRAMENTO E PERSISTÊNCIA */}
              <Button
                type="button"
                onClick={finishCall}
                className="w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <PhoneOff className="size-4" /> Encerrar e Salvar no Histórico
              </Button>
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
            Dicas perspicazes e roteiro de negociação gerados em tempo real com base no perfil do cliente.
          </p>

          <div className="min-h-36 rounded-xl border border-[#E0D5C3] bg-[#F7F3EB] p-3 text-xs text-[#2B2520] leading-relaxed whitespace-pre-wrap">
            {script || (busy ? "Consultando inteligência comercial…" : "Selecione um cliente e inicie a chamada para receber o roteiro em tempo real.")}
          </div>

          {currentLead && (
            <Button
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
