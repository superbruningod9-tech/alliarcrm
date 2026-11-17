import { describe, expect, it } from "vitest";
import { getDddForCity, searchB2BProspects, markProspectAsImported, getImportedProspectIds } from "@/lib/prospecting";

describe("prospeccao ativa b2b", () => {
  it("determina DDD correto para as principais cidades brasileiras", () => {
    expect(getDddForCity("Belo Horizonte, MG")).toBe("31");
    expect(getDddForCity("Campinas, SP")).toBe("19");
    expect(getDddForCity("São Paulo, SP")).toBe("11");
    expect(getDddForCity("Curitiba, PR")).toBe("41");
    expect(getDddForCity("Cidade Qualquer")).toBe("11");
  });

  it("busca e enriquece empresas no Google Maps com dados comerciais completos", async () => {
    const results = await searchB2BProspects(
      { segment: "Clínicas Odontológicas", city: "Belo Horizonte, MG" },
      "tenant-teste"
    );

    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first.name).toContain("Clínicas Odontológicas");
    expect(first.phone.startsWith("31")).toBe(true);
    expect(first.rating).toBeGreaterThanOrEqual(4.5);
    expect(first.address).toContain("Belo Horizonte");
    expect(first.cnpj).toBeDefined();
    expect(first.socios).toBeDefined();
    expect(first.socios!.length).toBeGreaterThan(0);
  });

  it("registra e rastreia empresas importadas para o funil", () => {
    const tenant = "tenant-spec";
    markProspectAsImported(tenant, "prospect-123");
    const set = getImportedProspectIds(tenant);
    expect(set.has("prospect-123")).toBe(true);
    expect(set.has("prospect-999")).toBe(false);
  });
});
