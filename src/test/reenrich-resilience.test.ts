import { describe, expect, it, vi } from "vitest";
import { enrichSingleLead } from "../lib/discovery/enrichment";
import { mergeSingleLeadUpdate } from "../lib/discovery/smart-update";
import type { MasterLead } from "../lib/discovery/types";

describe("Reenriquecimento B2B — resiliência e preservação de campos", () => {
  it("não quebra quando o lead não tem categories, website é nulo e fontes externas falham", async () => {
    const mockFailingFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const bareLead: MasterLead = {
      key: "lead-bare-1",
      name: "Empresa Sem Categorias",
      sources: ["site"],
      fieldSources: {},
      phones: [],
      emails: [],
      score: 50,
      triggers: [],
    };

    const res = await enrichSingleLead(bareLead, { forceRefresh: true }, mockFailingFetch as any);
    expect(res).toBeDefined();
    expect(res.name).toBe("Empresa Sem Categorias");
    expect(Array.isArray(res.phones)).toBe(true);
    expect(Array.isArray(res.emails)).toBe(true);
    expect(res.completeness).toBeDefined();
    expect(res.completeness?.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("preserva categorias, coordenadas e metadados originais ao mesclar atualização", () => {
    const existing: MasterLead = {
      key: "lead-orig-1",
      name: "Clínica Exemplo",
      displayName: "Clínica Exemplo Centro",
      categories: ["Clínica Médica"],
      category: "Clínica Médica",
      lat: -23.55,
      lng: -46.63,
      sources: ["osm"],
      fieldSources: {},
      phones: [],
      emails: [],
      score: 70,
      triggers: [],
    };

    const incoming: MasterLead = {
      key: "lead-orig-1",
      name: "Clínica Exemplo",
      sources: ["site"],
      fieldSources: {},
      phones: [],
      emails: [],
      score: 75,
      triggers: [],
    };

    const { updatedLead } = mergeSingleLeadUpdate(existing, incoming);
    expect(updatedLead.categories).toEqual(["Clínica Médica"]);
    expect(updatedLead.displayName).toBe("Clínica Exemplo Centro");
    expect(updatedLead.lat).toBe(-23.55);
    expect(updatedLead.lng).toBe(-46.63);
  });
});
