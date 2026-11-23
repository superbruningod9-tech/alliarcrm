import { describe, it, expect } from "vitest";
import { normalizeBrPhone, mergePhones, extractPhonesFromText } from "@/lib/discovery/phone";
import { runQuadtree, subdivide, pointInPolygon, bboxFromCircle } from "@/lib/discovery/quadtree";
import { expandNiche } from "@/lib/discovery/synonyms";
import { mergeRecords, isValidCnpj, nameSimilarity, sameEntity, extractBrandAndUnit, diversifyLeads } from "@/lib/discovery/merge";
import { extractFromHtml, isSafePublicUrl } from "@/lib/discovery/crawler";
import { parseBulkList } from "@/lib/discovery/receita";
import { parseOverpass, buildOverpassQuery, getAdministrativeBoundary } from "@/lib/discovery/osm";
import { searchGooglePlacesNew, searchGooglePlacesMultiQuadrant, discoverWebPresence } from "@/lib/discovery/lookup";

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
  it("NUNCA funde filiais da mesma rede apenas por compartilharem o mesmo site", () => {
    const records = [
      {
        source: "google_maps" as const,
        sourceId: "g_p1",
        name: "Panvel Farmácias - Filial Centro",
        lat: -30.034,
        lng: -51.217,
        website: "https://www.panvel.com.br",
        address: "Rua dos Andradas, 1000 - Centro",
      },
      {
        source: "google_maps" as const,
        sourceId: "g_p2",
        name: "Panvel Farmácias - Filial Moinhos",
        lat: -30.021,
        lng: -51.201,
        website: "https://www.panvel.com.br",
        address: "Rua Padre Chagas, 200 - Moinhos de Vento",
      },
    ];
    // Mesma marca e mesmo site, mas unidades físicas diferentes
    expect(sameEntity(records[0]!, records[1]!)).toBe(false);
    const leads = mergeRecords(records);
    expect(leads).toHaveLength(2);
    expect(leads[0]!.isNetwork).toBe(true);
    expect(leads[1]!.isNetwork).toBe(true);
    expect(leads[0]!.networkUnitsCount).toBe(2);
    expect(leads[1]!.networkUnitsCount).toBe(2);
  });
  it("identifica matriz, filial e CNPJ raiz corretamente", () => {
    const leads = mergeRecords([
      {
        source: "google_maps" as const,
        sourceId: "g_m1",
        name: "Drogaria Alpha Matriz",
        cnpj: "11.222.333/0001-81",
        lat: -30.01,
        lng: -51.21,
      },
      {
        source: "google_maps" as const,
        sourceId: "g_f1",
        name: "Drogaria Alpha Filial 2",
        cnpj: "11.222.333/0002-62",
        lat: -30.05,
        lng: -51.18,
      },
    ]);
    expect(leads).toHaveLength(2);
    const matriz = leads.find((l) => l.cnpjBranch === "0001")!;
    const filial = leads.find((l) => l.cnpjBranch === "0002")!;
    expect(matriz.companyType).toBe("matriz");
    expect(matriz.cnpjRoot).toBe("11222333");
    expect(filial.companyType).toBe("filial");
    expect(filial.cnpjRoot).toBe("11222333");
    expect(matriz.isNetwork).toBe(true);
    expect(filial.isNetwork).toBe(true);
    expect(matriz.networkUnitsCount).toBe(2);
  });
  it("extrai marca e unidade sem inventar vínculos", () => {
    const e1 = extractBrandAndUnit("Panvel Farmácias - Filial 123", "Centro");
    expect(e1.brandName).toBe("Panvel Farmácias");
    expect(e1.unitName).toBe("Unidade 123");
    expect(e1.displayName).toBe("Panvel Farmácias — Unidade 123");

    const e2 = extractBrandAndUnit("Clínica Independente X", "Petrópolis");
    expect(e2.brandName).toBe("Clínica Independente X");
    expect(e2.unitName).toBe("Unidade Petrópolis");
  });
  it("diversifica resultados sem excluir nenhuma unidade", () => {
    const panvel1 = { key: "p1", name: "Panvel 1", isNetwork: true, networkName: "Panvel", score: 90, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["google_maps" as const], fieldSources: {}, triggers: [] };
    const panvel2 = { key: "p2", name: "Panvel 2", isNetwork: true, networkName: "Panvel", score: 85, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["google_maps" as const], fieldSources: {}, triggers: [] };
    const panvel3 = { key: "p3", name: "Panvel 3", isNetwork: true, networkName: "Panvel", score: 80, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["google_maps" as const], fieldSources: {}, triggers: [] };
    const indep1 = { key: "i1", name: "Farmácia da Esquina", isNetwork: false, companyType: "independente" as const, score: 75, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["osm" as const], fieldSources: {}, triggers: [] };
    const indep2 = { key: "i2", name: "Drogaria Popular Bairro", isNetwork: false, companyType: "independente" as const, score: 70, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["osm" as const], fieldSources: {}, triggers: [] };

    const diversified = diversifyLeads([panvel1, panvel2, panvel3, indep1, indep2]);
    expect(diversified).toHaveLength(5);
    // Panvel não domina as primeiras posições consecutivamente
    expect(diversified.slice(0, 3).some((l) => !l.isNetwork)).toBe(true);
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

describe("google places & web presence", () => {
  it("searchGooglePlacesNew ignora chamadas sem chave de API", async () => {
    const res = await searchGooglePlacesNew({ query: "clinica", apiKey: "" });
    expect(res).toEqual([]);
  });

  it("searchGooglePlacesNew envia FieldMask e mapeia campos corretamente", async () => {
    const fakeFetch = vi.fn(async (url: any, init: any) => {
      expect(init?.headers?.["X-Goog-FieldMask"]).toContain("places.nationalPhoneNumber");
      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: "place-1",
              displayName: { text: "Clínica Pet Feliz" },
              formattedAddress: "Rua das Flores, 100",
              nationalPhoneNumber: "(51) 3333-1111",
              websiteUri: "https://petfeliz.com.br",
              rating: 4.9,
              userRatingCount: 88,
              location: { latitude: -30.03, longitude: -51.2 },
            },
          ],
        }),
      } as any;
    });

    const res = await searchGooglePlacesNew(
      { query: "pet shop", apiKey: "fake-key" },
      fakeFetch as any
    );

    expect(res).toHaveLength(1);
    expect(res[0]!.name).toBe("Clínica Pet Feliz");
    expect(res[0]!.phones).toContain("5133331111");
    expect(res[0]!.website).toBe("https://petfeliz.com.br");
    expect(res[0]!.rating).toBe(4.9);
  });

  it("searchGooglePlacesMultiQuadrant deduplica por ID", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "same-place-id",
            displayName: { text: "Empresa Central" },
            formattedAddress: "Av. Borges, 500",
            nationalPhoneNumber: "(51) 3222-3333",
          },
        ],
      }),
    })) as any;

    const res = await searchGooglePlacesMultiQuadrant(
      { latMin: -30.1, latMax: -30.0, lngMin: -51.3, lngMax: -51.2 },
      ["pet", "veterinaria"],
      "Porto Alegre",
      "fake-key",
      50,
      fakeFetch
    );

    expect(res).toHaveLength(1);
    expect(res[0]!.name).toBe("Empresa Central");
  });

  it("discoverWebPresence extrai telefones e redes de página pública", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <html>
          <body>
            <h1>Pet Shop Cão Feliz</h1>
            <p>Ligue para nós: (51) 98888-7777</p>
            <a href="https://wa.me/5551988887777">WhatsApp</a>
            <a href="https://instagram.com/caofeliz">Instagram</a>
          </body>
        </html>
      `,
    })) as any;

    const res = await discoverWebPresence("Cão Feliz", "Porto Alegre", "https://caofeliz.com.br", fakeFetch);
    expect(res.phones.some((p) => p.includes("51988887777"))).toBe(true);
    expect(res.socials.instagram).toContain("caofeliz");
  });

  it("searchGooglePlacesNew consome nextPageToken e acumula páginas", async () => {
    let callNum = 0;
    const fakeFetch = vi.fn(async (url: any, init: any) => {
      callNum++;
      const body = JSON.parse(init.body);
      if (callNum === 1) {
        expect(body.pageToken).toBeUndefined();
        return {
          ok: true,
          json: async () => ({
            places: [{ id: "p1", displayName: { text: "Place 1" } }],
            nextPageToken: "token_page_2",
          }),
        } as any;
      } else {
        expect(body.pageToken).toBe("token_page_2");
        return {
          ok: true,
          json: async () => ({
            places: [{ id: "p2", displayName: { text: "Place 2" } }],
          }),
        } as any;
      }
    });

    const res = await searchGooglePlacesNew(
      { query: "restaurante", apiKey: "test-key", maxPages: 2 },
      fakeFetch as any
    );

    expect(res).toHaveLength(2);
    expect(res.map((r) => r.name)).toEqual(["Place 1", "Place 2"]);
  });

  it("getAdministrativeBoundary extrai boundingbox e coordenadas do município", async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          place_id: 12345,
          display_name: "Canoas, Rio Grande do Sul, Brasil",
          lat: "-29.91",
          lon: "-51.18",
          boundingbox: ["-30.00", "-29.80", "-51.25", "-51.10"],
          geojson: {
            type: "Polygon",
            coordinates: [
              [
                [-51.25, -30.00],
                [-51.10, -30.00],
                [-51.10, -29.80],
                [-51.25, -29.80],
              ],
            ],
          },
          address: { city: "Canoas", state: "Rio Grande do Sul" },
        },
      ],
    })) as any;

    const b = await getAdministrativeBoundary("Canoas", "RS", undefined, fakeFetch);
    expect(b).not.toBeNull();
    expect(b!.city).toBe("Canoas");
    expect(b!.bbox.latMin).toBe(-30.00);
    expect(b!.bbox.lngMax).toBe(-51.10);
    expect(b!.polygon).toHaveLength(4);
  });

  it("runQuadtree respeita cursor e initialQueue para continuidade de varredura", async () => {
    const cellA = { id: "c1", depth: 1, latMin: 0, latMax: 1, lngMin: 0, lngMax: 1 };
    const cellB = { id: "c2", depth: 1, latMin: 1, latMax: 2, lngMin: 1, lngMax: 2 };

    const { items, stats, pendingCells } = await runQuadtree<string>(
      { latMin: 0, latMax: 2, lngMin: 0, lngMax: 2 },
      async (c) => ({ count: 5, items: [c.id] }),
      (x) => x,
      {
        saturation: 50,
        maxDepth: 3,
        maxCells: 1, // Processa apenas 1 célula por lote
        initialQueue: [cellA, cellB],
      }
    );

    expect(stats.cellsSearched).toBe(1);
    expect(items).toEqual(["c1"]);
    expect(pendingCells).toEqual([cellB]); // c2 segue na fila para a próxima requisição
  });
});
