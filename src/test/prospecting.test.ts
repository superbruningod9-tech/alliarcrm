import { describe, expect, it, vi } from "vitest";
import { getDddForCity, searchB2BProspects, markProspectAsImported, getImportedProspectIds } from "@/lib/prospecting";

vi.mock("@/lib/prospecting.functions", () => ({
  searchRealPlaces: vi.fn(async () => ({
    places: [
      {
        id: "osm-1001",
        name: "Clínica Dental Prime",
        address: "Av. Afonso Pena, 1500, Belo Horizonte, MG",
        city: "Belo Horizonte",
        state: "MG",
        phone: "+55 31 3222-1100",
        email: undefined,
        website: "https://clinicaprime.com.br",
        source: "google_maps",
      },
      {
        id: "osm-1002",
        name: "Consultório Odonto Silva",
        address: "Rua da Bahia, 800, Belo Horizonte, MG",
        city: "Belo Horizonte",
        state: "MG",
        phone: "",
        email: "contato@odontosilva.com.br",
        website: undefined,
        source: "google_maps",
      },
    ],
    error: null,
  })),
}));

describe("prospeccao ativa b2b", () => {
  it("determina DDD correto para as principais cidades brasileiras", () => {
    expect(getDddForCity("Belo Horizonte, MG")).toBe("31");
    expect(getDddForCity("Campinas, SP")).toBe("19");
    expect(getDddForCity("São Paulo, SP")).toBe("11");
    expect(getDddForCity("Curitiba, PR")).toBe("41");
    expect(getDddForCity("Cidade Qualquer")).toBe("11");
  });

  it("busca e mapeia empresas sem inventar dados ausentes", async () => {
    const results = await searchB2BProspects(
      { segment: "Clínicas Odontológicas", city: "Belo Horizonte, MG" },
      "tenant-teste"
    );

    expect(results.length).toBe(2);
    const first = results[0]!;
    expect(first.name).toBe("Clínica Dental Prime");
    expect(first.phone).toBe("+55 31 3222-1100");
    expect(first.email).toBeUndefined(); // Não inventa se não houver

    const second = results[1]!;
    expect(second.name).toBe("Consultório Odonto Silva");
    expect(second.phone).toBe(""); // Nunca inventa telefone falso
    expect(second.email).toBe("contato@odontosilva.com.br");
  });

  it("registra e rastreia empresas importadas para o funil", () => {
    const tenant = "tenant-spec";
    markProspectAsImported(tenant, "prospect-123");
    const set = getImportedProspectIds(tenant);
    expect(set.has("prospect-123")).toBe(true);
    expect(set.has("prospect-999")).toBe(false);
  });
});
