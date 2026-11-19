import { describe, it, expect } from "vitest";
import { normalizeBrPhone, mergePhones, extractPhonesFromText } from "@/lib/discovery/phone";
import { runQuadtree, subdivide, pointInPolygon, bboxFromCircle } from "@/lib/discovery/quadtree";
import { expandNiche } from "@/lib/discovery/synonyms";
import { mergeRecords, isValidCnpj, nameSimilarity } from "@/lib/discovery/merge";
import { extractFromHtml, isSafePublicUrl } from "@/lib/discovery/crawler";
import { parseBulkList } from "@/lib/discovery/receita";
import { parseOverpass, buildOverpassQuery } from "@/lib/discovery/osm";

describe("telefone", () => {
  it("normaliza formatos diferentes para o mesmo E.164", () => {
    expect(normalizeBrPhone("(51) 99999-1234")?.e164).toBe("+5551999991234");
    expect(normalizeBrPhone("+55 51 99999 1234")?.e164).toBe("+5551999991234");
    expect(normalizeBrPhone("051 99999-1234")?.e164).toBe("+5551999991234");
  });
  it("separa celular e fixo e rejeita inválidos", () => {
    expect(normalizeBrPhone("(51) 3333-4444")?.type).toBe("landline");
    expect(normalizeBrPhone("51 99999-1234")?.type).toBe("mobile");
    expect(normalizeBrPhone("(00) 99999-1234")).toBeNull();
    expect(normalizeBrPhone("12345")).toBeNull();
  });
  it("deduplica e marca confirmado em 2+ fontes", () => {
    const m = mergePhones([{ raw: "(51) 99999-1234", source: "google_maps" }, { raw: "+5551999991234", source: "site" }]);
    expect(m).toHaveLength(1);
    expect(m[0]!.confirmed).toBe(true);
  });
  it("extrai de texto", () => expect(extractPhonesFromText("Ligue (51) 3333-4444 hoje")).toEqual(["+555133334444"]));
});

describe("quadtree", () => {
  it("subdivide em 4 filhos iguais", () => {
    const kids = subdivide({ id: "a", depth: 0, latMin: 0, latMax: 2, lngMin: 0, lngMax: 2 });
    expect(kids).toHaveLength(4);
    expect(kids.every((k) => k.latMax - k.latMin === 1 && k.depth === 1)).toBe(true);
  });
  it("divide célula saturada até a profundidade máxima", async () => {
    const { items, stats } = await runQuadtree<string>(
      { latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 },
      async (c) => ({ count: c.depth < 2 ? 100 : 5, items: [`${c.id}`] }),
      (x) => x, { saturation: 50, maxDepth: 2, maxCells: 100 });
    expect(stats.cellsSearched).toBe(1 + 4 + 16);
    expect(items).toHaveLength(21);
  });
  it("respeita maxCells", async () => {
    const { stats } = await runQuadtree<string>({ latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 }, async (c) => ({ count: 999, items: [c.id] }), (x) => x, { saturation: 1, maxDepth: 9, maxCells: 6 });
    expect(stats.cellsSearched).toBe(6);
    expect(stats.truncated).toBe(true);
  });
  it("geometria", () => {
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }])).toBe(true);
    expect(bboxFromCircle({ lat: -30, lng: -51 }, 5).latMax).toBeGreaterThan(-30);
  });
});

describe("nicho", () => {
  it("expande pet shop", () => {
    const p = expandNiche("pet shop");
    expect(p.synonyms).toContain("banho e tosa");
    expect(p.synonyms).toContain("clínica veterinária");
    expect(p.osm).toContain("shop=pet");
  });
});

describe("fusão", () => {
  it("funde Maps + OSM + Receita por CNPJ/proximidade e rastreia origem", () => {
    const leads = mergeRecords([
      { source: "google_maps", sourceId: "g1", name: "Clínica Sorriso Ltda", lat: -30.03, lng: -51.2, phones: ["(51) 3333-4444"], rating: 3.2, reviewsCount: 40, claimed: false },
      { source: "osm", sourceId: "n/1", name: "Clinica Sorriso", lat: -30.0301, lng: -51.2001, phones: ["+55 51 3333 4444"], emails: ["contato@sorriso.com.br"] },
      { source: "site", name: "Clínica Sorriso", lat: -30.03, lng: -51.2, website: "https://sorriso.com.br", cnpj: "11.222.333/0001-81" },
    ]);
    expect(leads).toHaveLength(1);
    const l = leads[0]!;
    expect(l.phones).toHaveLength(1);
    expect(l.phones[0]!.confirmed).toBe(true);
    expect(l.fieldSources.phone).toEqual(expect.arrayContaining(["google_maps", "osm"]));
    expect(l.triggers).toContain("Perfil do Google não reivindicado");
    expect(l.triggers.some((t) => t.startsWith("Avaliação baixa"))).toBe(true);
  });
  it("não funde empresas distintas", () => {
    expect(mergeRecords([{ source: "osm", name: "Padaria A", lat: 1, lng: 1 }, { source: "osm", name: "Oficina B", lat: 1, lng: 1 }])).toHaveLength(2);
  });
  it("valida CNPJ e similaridade", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
    expect(nameSimilarity("Pet Shop Amigo", "PetShop Amigo Ltda")).toBeGreaterThan(0.7);
  });
});

describe("crawler", () => {
  const html = `<a href="mailto:contato@empresa.com.br">x</a> noreply@empresa.com.br <a href="https://wa.me/5551999991234">w</a>
   <a href="https://www.instagram.com/empresa_x">i</a> CNPJ 11.222.333/0001-81 <script src="https://www.googletagmanager.com/gtm.js"></script>`;
  it("extrai contatos e diagnóstico", () => {
    const r = extractFromHtml(html);
    expect(r.emails).toEqual(["contato@empresa.com.br"]);
    expect(r.whatsapp).toEqual(["5551999991234"]);
    expect(r.socials.instagram).toContain("empresa_x");
    expect(r.cnpjs).toEqual(["11222333000181"]);
    expect(r.hasAnalytics).toBe(true);
    expect(r.hasWhatsappLink).toBe(true);
  });
  it("bloqueia SSRF", () => {
    for (const u of ["http://localhost/x", "http://127.0.0.1", "http://169.254.169.254/latest", "http://10.0.0.5", "file:///etc/passwd", "http://[::1]/"]) expect(isSafePublicUrl(u)).toBeNull();
    expect(isSafePublicUrl("empresa.com.br")?.hostname).toBe("empresa.com.br");
  });
});

describe("lote e OSM", () => {
  it("classifica e deduplica lista", () => {
    const r = parseBulkList("11.222.333/0001-81\nwww.empresa.com.br\nPadaria do Zé\nPadaria do Zé\n11222333000181");
    expect(r.map((x) => x.kind)).toEqual(["cnpj", "domain", "name"]);
  });
  it("parseia Overpass e monta query segura", () => {
    const [r] = parseOverpass({ elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "X", amenity: "dentist", phone: "51 3333-4444; 51 99999-1234" } }] });
    expect(r!.phones).toHaveLength(2);
    expect(buildOverpassQuery({ latMin: 0, lngMin: 0, latMax: 1, lngMax: 1 }, ['amenity=dentist', 'x"];drop'])).not.toContain("drop");
  });
});
