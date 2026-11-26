import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, Maximize2, MessageSquare, Phone, QrCode, Video, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizePhoneForDialer } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type QrMode = "tel" | "whatsapp" | "jitsi";

export interface QrPayloadResult {
  valid: boolean;
  value: string;
  label: string;
  instruction: string;
  displayPhone?: string;
  error?: string;
}

/** Constrói e valida o conteúdo codificado no QR Code para Ligação, WhatsApp ou Jitsi. */
export function buildQrPayload(mode: QrMode, phone: string, jitsiUrl?: string): QrPayloadResult {
  if (mode === "jitsi") {
    const cleanUrl = (jitsiUrl || "").trim();
    if (!cleanUrl || !/^https:\/\/[a-z0-9.-]+/i.test(cleanUrl)) {
      return {
        valid: false,
        value: "",
        label: "Chamada de Áudio Jitsi",
        instruction: "Gere uma sala de áudio Jitsi na Fase 3 para obter o QR Code de convite.",
        error: "Nenhuma sala de áudio Jitsi ativa no momento.",
      };
    }
    return {
      valid: true,
      value: cleanUrl,
      label: "Entrar na Chamada Jitsi",
      instruction: "Aponte a câmera do celular para entrar diretamente na sala de áudio.",
    };
  }

  const parsed = normalizePhoneForDialer(phone);
  if (!parsed.valid) {
    return {
      valid: false,
      value: "",
      label: mode === "tel" ? "Ligação Telefônica" : "Conversa no WhatsApp",
      instruction: "Informe um telefone válido com DDD para gerar o QR Code.",
      error: parsed.error || "Número de telefone inválido.",
    };
  }

  if (mode === "tel") {
    return {
      valid: true,
      value: parsed.telUri,
      label: "Ligação no Celular",
      displayPhone: parsed.display,
      instruction: "Aponte a câmera do celular para abrir o discador nativo com o número preenchido.",
    };
  }

  return {
    valid: true,
    value: parsed.waUrl,
    label: "Abrir no WhatsApp",
    displayPhone: parsed.display,
    instruction: "Aponte a câmera do celular para iniciar conversa ou chamada pelo WhatsApp.",
  };
}

interface PhoneQrPanelProps {
  phone: string;
  leadName?: string;
  jitsiUrl?: string;
  initialMode?: QrMode;
  compact?: boolean;
}

export function PhoneQrPanel({
  phone,
  leadName,
  jitsiUrl,
  initialMode = "tel",
  compact = false,
}: PhoneQrPanelProps) {
  const [mode, setMode] = useState<QrMode>(initialMode);
  const [zoomOpen, setZoomOpen] = useState(false);
  const svgWrapRef = useRef<HTMLDivElement>(null);

  const payload = useMemo(() => buildQrPayload(mode, phone, jitsiUrl), [mode, phone, jitsiUrl]);

  const handleCopy = async () => {
    if (!payload.valid) return;
    try {
      await navigator.clipboard.writeText(payload.value);
      toast.success("Link copiado para a área de transferência!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleDownload = () => {
    if (!payload.valid) return;
    const svg = svgWrapRef.current?.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qrcode-${mode}-${(leadName || "contato").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR Code baixado!");
  };

  return (
    <div className="rounded-xl border border-[#E0D5C3] bg-white p-3.5 space-y-3 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#2B2520] flex items-center gap-1.5">
            <QrCode className="size-3.5 text-[#C25E38]" />
            <span>{leadName ? leadName : "QR Code de Contato"}</span>
          </div>
          {payload.displayPhone && (
            <div className="text-[11px] font-mono text-[#7A6F62]">{payload.displayPhone}</div>
          )}
        </div>

        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "tel" ? "default" : "outline"}
            onClick={() => setMode("tel")}
            className="h-7 px-2 text-[11px]"
          >
            <Phone className="mr-1 size-3" /> Ligação
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "whatsapp" ? "default" : "outline"}
            onClick={() => setMode("whatsapp")}
            className="h-7 px-2 text-[11px]"
          >
            <MessageSquare className="mr-1 size-3" /> WhatsApp
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "jitsi" ? "default" : "outline"}
            onClick={() => setMode("jitsi")}
            className="h-7 px-2 text-[11px]"
          >
            <Video className="mr-1 size-3" /> Jitsi
          </Button>
        </div>
      </div>

      {payload.valid ? (
        <div className="flex flex-col items-center gap-2.5 pt-1">
          <div ref={svgWrapRef} className="rounded-xl border border-[#EAE2D5] bg-white p-3 shadow-2xs">
            <QRCodeSVG value={payload.value} size={compact ? 128 : 156} level="M" />
          </div>
          <div className="w-full rounded-lg bg-[#FBF9F5] border border-[#EAE2D5] px-2.5 py-1.5 text-center">
            <p className="text-[11px] font-mono text-[#2B2520] break-all">{payload.value}</p>
            <p className="text-[10px] text-[#7A6F62] mt-0.5">{payload.instruction}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setZoomOpen(true)} className="h-7 text-[11px]">
              <Maximize2 className="mr-1 size-3" /> Ampliar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleCopy} className="h-7 text-[11px]">
              <Copy className="mr-1 size-3" /> Copiar link
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleDownload} className="h-7 text-[11px]">
              <Download className="mr-1 size-3" /> Baixar
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold">{payload.error}</p>
            <p className="text-[11px] text-amber-800 mt-0.5">{payload.instruction}</p>
          </div>
        </div>
      )}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{payload.label}</DialogTitle>
          </DialogHeader>
          {payload.valid && (
            <div className="flex flex-col items-center gap-3 py-2">
              {leadName && <p className="text-sm font-semibold text-[#2B2520]">{leadName}</p>}
              {payload.displayPhone && <p className="text-xs font-mono text-[#7A6F62]">{payload.displayPhone}</p>}
              <div className="rounded-2xl border bg-white p-4 shadow-xs">
                <QRCodeSVG value={payload.value} size={240} level="M" />
              </div>
              <p className="text-xs text-center text-muted-foreground">{payload.instruction}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                  <Copy className="mr-1.5 size-3.5" /> Copiar link
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleDownload}>
                  <Download className="mr-1.5 size-3.5" /> Baixar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PhoneQrDialogProps extends PhoneQrPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhoneQrDialog({ open, onOpenChange, ...panelProps }: PhoneQrDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code de Telefone & Contato</DialogTitle>
        </DialogHeader>
        <PhoneQrPanel {...panelProps} />
      </DialogContent>
    </Dialog>
  );
}
