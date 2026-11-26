import { describe, expect, it } from "vitest";
import { toE164, normalizePhoneForDialer, phoneKey } from "@/lib/whatsapp";
import { buildQrPayload } from "@/components/alliar/PhoneQrDialog";
import {
  buildCallActivityText,
  getExternalActionLabel,
  getInitialOutcomeForMode,
} from "@/lib/dialer";

describe("Alliar Voice Fase 2 — Normalização de Telefones BR", () => {
  it("normaliza DDI 55, prefixo 0 de tronco, 0055 e DDD sem duplicar 55", () => {
    expect(toE164("(51) 98888-7777")).toBe("5551988887777");
    expect(toE164("+55 (51) 98888-7777")).toBe("5551988887777");
    expect(toE164("051988887777")).toBe("5551988887777");
    expect(toE164("05133334444")).toBe("555133334444");
    expect(toE164("005551988887777")).toBe("5551988887777");
    expect(toE164("(55) 99999-1234")).toBe("5555999991234");
    expect(phoneKey("051 98888-7777")).toBe(phoneKey("+55 51 8888-7777"));
  });

  it("rejeita números inválidos, curtos, repetidos ou com DDD inexistente", () => {
    expect(normalizePhoneForDialer("").valid).toBe(false);
    expect(normalizePhoneForDialer("12345").valid).toBe(false);
    expect(normalizePhoneForDialer("11111111111").valid).toBe(false);
    expect(normalizePhoneForDialer("(00) 98888-7777").valid).toBe(false);
    expect(normalizePhoneForDialer("(20) 98888-7777").valid).toBe(false);
    expect(normalizePhoneForDialer("(51) 88888-7777").valid).toBe(false);
  });

  it("gera telUri com +55 e waUrl sem duplicar DDI para número válido", () => {
    const res = normalizePhoneForDialer("+55 (51) 98888-7777");
    expect(res.valid).toBe(true);
    expect(res.e164).toBe("5551988887777");
    expect(res.telUri).toBe("tel:+5551988887777");
    expect(res.waUrl).toBe("https://wa.me/5551988887777");
    expect(res.display).toBe("+55 (51) 98888-7777");
  });
});

describe("Alliar Voice Fase 2 — QR Codes (tel:, WhatsApp, Jitsi)", () => {
  it("gera QR Code tel:+55 válido e bloqueia números inválidos", () => {
    const ok = buildQrPayload("tel", "051 98888-7777");
    expect(ok.valid).toBe(true);
    expect(ok.value).toBe("tel:+5551988887777");

    const bad = buildQrPayload("tel", "123");
    expect(bad.valid).toBe(false);
    expect(bad.value).toBe("");
  });

  it("gera QR Code WhatsApp wa.me sem duplicar DDI 55", () => {
    const ok = buildQrPayload("whatsapp", "+55 (51) 98888-7777");
    expect(ok.valid).toBe(true);
    expect(ok.value).toBe("https://wa.me/5551988887777");
  });

  it("suporta QR Code Jitsi apenas quando houver URL válida da sala", () => {
    const empty = buildQrPayload("jitsi", "51988887777");
    expect(empty.valid).toBe(false);
    expect(empty.value).toBe("");

    const valid = buildQrPayload("jitsi", "51988887777", "https://meet.jit.si/alliar-abc123");
    expect(valid.valid).toBe(true);
    expect(valid.value).toBe("https://meet.jit.si/alliar-abc123");
  });
});

describe("Alliar Voice Fase 2 — Estados de Chamada Externa e Histórico", () => {
  it("nunca assume chamada atendida ao abrir discador externo ou WhatsApp", () => {
    expect(getInitialOutcomeForMode("tel")).toBe("Apenas abriu discador / WhatsApp");
    expect(getInitialOutcomeForMode("whatsapp")).toBe("Apenas abriu discador / WhatsApp");
    expect(getExternalActionLabel("browser", "sip_unconfigured")).toBe("Softphone SIP não configurado");
  });

  it("diferencia ação externa sem confirmação de resultado confirmado pelo vendedor", () => {
    const externalOnly = buildCallActivityText({
      mode: "whatsapp",
      status: "external_opened",
      outcome: "Apenas abriu discador / WhatsApp",
      phoneDisplay: "+55 (51) 98888-7777",
      sellerName: "Gustavo",
    });
    expect(externalOnly).toContain("Sem confirmação de atendimento");
    expect(externalOnly).toContain("Vendedor: Gustavo");

    const confirmed = buildCallActivityText({
      mode: "tel",
      status: "external_opened",
      outcome: "Reunião agendada",
      phoneDisplay: "+55 (51) 98888-7777",
      sellerName: "Gustavo",
      notes: "Cliente pediu proposta para amanhã.",
      nextContactAt: "Amanhã 14h",
    });
    expect(confirmed).toContain("[Reunião agendada]");
    expect(confirmed).toContain("Próximo contato agendado: Amanhã 14h");
  });
});
