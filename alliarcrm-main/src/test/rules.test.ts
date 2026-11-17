import { describe, expect, it } from "vitest";
import {
  needsApproval,
  nextRoundRobin,
  isLeadInVacuo,
  antiVacuoMinutesRemaining,
  calculateReferralReward,
  calculateTicketSla,
  generateWelcomeMessage,
} from "@/lib/rules";
import { applyDiscount, crc16 } from "@/lib/pix";

describe("regras Alliar", () => {
  it("desconto acima de 15% exige aprovação só no Modo Equipe", () => {
    expect(needsApproval("equipe", 16)).toBe(true);
    expect(needsApproval("equipe", 15)).toBe(false);
    expect(needsApproval("solo", 40)).toBe(false);
  });

  it("calcula desconto", () => {
    expect(applyDiscount(1000, 10)).toBe(900);
  });

  it("round-robin volta ao primeiro", () => {
    expect(nextRoundRobin(["a", "b", "c"], 2)).toBe(0);
    expect(nextRoundRobin(["a", "b", "c"], 0)).toBe(1);
    expect(nextRoundRobin([], 0)).toBe(0);
  });

  it("CRC16 do PIX segue CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("anti-vácuo detecta leads sem resposta há mais de 5 minutos", () => {
    const now = new Date("2026-11-12T17:30:00Z");
    const leadRecente = new Date("2026-11-12T17:28:00Z"); // 2 min atrás
    const leadNoVacuo = new Date("2026-11-12T17:24:00Z"); // 6 min atrás

    expect(isLeadInVacuo(leadRecente, now, 5)).toBe(false);
    expect(isLeadInVacuo(leadNoVacuo, now, 5)).toBe(true);
    expect(antiVacuoMinutesRemaining(leadRecente, now, 5)).toBe(3);
    expect(antiVacuoMinutesRemaining(leadNoVacuo, now, 5)).toBe(0);
  });

  it("calcula recompensa de cashback do programa de indicações", () => {
    expect(calculateReferralReward(2500, 10)).toBe(250);
    expect(calculateReferralReward(5000, 15)).toBe(750);
    expect(calculateReferralReward(0, 10)).toBe(0);
  });

  it("calcula SLA de chamados de pós-venda conforme prioridade", () => {
    expect(calculateTicketSla("alta")).toEqual({ hours: 2, label: "Responder em 2h" });
    expect(calculateTicketSla("média")).toEqual({ hours: 4, label: "Responder em 4h" });
    expect(calculateTicketSla("baixa")).toEqual({ hours: 24, label: "Responder em 24h" });
  });

  it("gera mensagem de boas-vindas personalizada para WhatsApp", () => {
    const msg = generateWelcomeMessage("Dr. Roberto", "Hospital Central", "Carlos");
    expect(msg).toContain("Dr. Roberto");
    expect(msg).toContain("Hospital Central");
    expect(msg).toContain("Carlos");
  });
});
