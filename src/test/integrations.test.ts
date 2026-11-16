import { describe, expect, it } from "vitest";
import { isValidCnpj, formatCnpj } from "@/lib/cnpj";
import { phoneKey, statusRank, toE164 } from "@/lib/whatsapp";
import { getWebhookUrl, loadIntegrationSettings, recordWebhookLog, fetchWebhookLogs } from "@/lib/integrations";

describe("cnpj", () => {
  it("aceita CNPJ válido", () => expect(isValidCnpj("19.131.243/0001-97")).toBe(true));
  it("rejeita dígito errado", () => expect(isValidCnpj("19131243000198")).toBe(false));
  it("formata", () => expect(formatCnpj("19131243000197")).toBe("19.131.243/0001-97"));
});

describe("whatsapp", () => {
  it("adiciona 55 a números brasileiros", () => expect(toE164("(11) 99999-0000")).toBe("5511999990000"));
  it("casa números com e sem nono dígito", () => expect(phoneKey("551199990000")).toBe(phoneKey("(11) 9 9999-0000")));
  it("status não regride de lida para enviada", () => expect(statusRank("sent")).toBeLessThan(statusRank("read")));
});

describe("central de integracoes e webhooks", () => {
  it("gera URLs de webhooks formatadas com tenant e gateway", () => {
    const metaUrl = getWebhookUrl("tenant-123", "meta_ads");
    expect(metaUrl).toContain("/api/public/webhooks/meta-ads?t=tenant-123");

    const paymentUrl = getWebhookUrl("tenant-123", "payment", "kiwify");
    expect(paymentUrl).toContain("/api/public/webhooks/payment?t=tenant-123&gateway=kiwify");

    const asaasUrl = getWebhookUrl("tenant-123", "payment", "asaas");
    expect(asaasUrl).toContain("/api/public/webhooks/payment?t=tenant-123&gateway=asaas");
  });

  it("carrega configurações padrão de integração", () => {
    const settings = loadIntegrationSettings("tenant-test");
    expect(settings.metaLeadAdsActive).toBe(true);
    expect(settings.autoMoveToGanho).toBe(true);
    expect(settings.autoOpenPortalProject).toBe(true);
  });
});
