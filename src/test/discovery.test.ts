import { describe, it, expect } from "vitest";
import { normalizeBrPhone, mergePhones, extractPhonesFromText } from "@/lib/discovery/phone";
import { runQuadtree, subdivide, pointInPolygon, bboxFromCircle } from "@/lib/discovery/quadtree";
import { expandNiche } from "@/lib/discovery/synonyms";
import { mergeRecords, isValidCnpj, nameSimilarity, sameEntity, extractBrandAndUnit, diversifyLeads } from "@/lib/discovery/merge";
import { extractFromHtml, isSafePublicUrl } from "@/lib/discovery/crawler";
import { parseBulkList } from "@/lib/discovery/receita";
import { parseOverpass, buildOverpassQuery, getAdministrativeBoundary } from "@/lib/discovery/osm";
import { searchGooglePlacesNew, searchGooglePlacesMultiQuadrant, discoverWebPresence } from "@/lib/discovery/lookup";
import { calculateRelevanceScore, calculateCommercialScore, calculateLeadScores, sortLeads } from "@/lib/discovery/scoring";
import { discoverAndVerifyCnpj, lookupRegistroBrCnpj } from "@/lib/discovery/cnpj-discovery";
import {
  calculateCompleteness,
  buildContactChannels,
  buildFieldProvenance,
  enrichSingleLead,
  enrichLeadsBatch,
} from "@/lib/discovery/enrichment";
import {
  isSameBusinessUnit,
  mergeSingleLeadUpdate,
  smartMergeLeads,
  refreshSingleLeadData,
} from "@/lib/discovery/smart-update";
import type { MasterLead } from "@/lib/discovery/types";

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

describe("pontuação separada e ordenações", () => {
  it("calcula relevância para o nicho sem penalizar empresas pequenas", () => {
    const smallLead = {
      key: "s1",
      name: "Farmácia Popular do Bairro",
      categories: ["farmácia", "drogaria"],
      phones: [],
      emails: [],
      socials: {},
      reviews: [],
      sources: ["osm" as const],
      fieldSources: {},
      triggers: [],
      score: 0,
    };
    const rel = calculateRelevanceScore(smallLead, ["farmácia", "drogaria"]);
    expect(rel.score).toBeGreaterThanOrEqual(80);
    expect(rel.reasons.length).toBeGreaterThan(0);
    expect(rel.reasons[0]).toContain("Farmácia Popular do Bairro");
  });

  it("calcula potencial comercial Alliar identificando lacunas e oportunidades", () => {
    const lead = {
      key: "c1",
      name: "Oficina Mecânica Precision",
      website: undefined, // Sem site
      claimed: false, // Perfil não reivindicado
      phones: [{ e164: "+555133334444", national: "(51) 3333-4444", ddd: "51", type: "landline" as const, whatsappLikely: false, sources: ["google_maps" as const], confirmed: true }],
      emails: [],
      socials: {},
      reviews: [],
      sources: ["google_maps" as const],
      fieldSources: {},
      triggers: [],
      score: 0,
      fiscal: { cnpj: "11222333000181", porte: "ME", situacao: "ATIVA" },
    };
    const com = calculateCommercialScore(lead);
    expect(com.score).toBeGreaterThanOrEqual(70);
    expect(com.serviceOpportunities).toContain("Criação de Site Institucional / Landing Page de Alta Conversão");
    expect(com.serviceOpportunities).toContain("Otimização e Reivindicação de Google Meu Negócio");
    expect(com.serviceOpportunities).toContain("Estruturação de Canal Comercial no WhatsApp");
  });

  it("ordena leads pelos modos disponíveis preservando todos os itens", () => {
    const l1 = { key: "1", name: "Alpha", relevanceScore: 90, commercialScore: 40, score: 60, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["osm" as const], fieldSources: {}, triggers: [] };
    const l2 = { key: "2", name: "Beta", relevanceScore: 50, commercialScore: 95, score: 80, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["osm" as const], fieldSources: {}, triggers: [] };
    const l3 = { key: "3", name: "Gamma", relevanceScore: 70, commercialScore: 70, score: 70, categories: [], phones: [], emails: [], socials: {}, reviews: [], sources: ["osm" as const], fieldSources: {}, triggers: [] };

    const byRel = sortLeads([l1, l2, l3], "relevancia");
    expect(byRel[0]!.name).toBe("Alpha");
    expect(byRel).toHaveLength(3);

    const byCom = sortLeads([l1, l2, l3], "potencial");
    expect(byCom[0]!.name).toBe("Beta");
    expect(byCom).toHaveLength(3);
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

describe("enriquecimento robusto em lote e descoberta de CNPJ", () => {
  it("lookupRegistroBrCnpj extrai CNPJ do RDAP de domínio .br", async () => {
    const fakeFetch = vi.fn(async (url: any) => {
      expect(String(url)).toContain("rdap.registro.br/domain/hospitalpet.com.br");
      return {
        ok: true,
        json: async () => ({
          entities: [
            {
              handle: "00000000000191",
            },
          ],
        }),
      } as any;
    });

    const cnpj = await lookupRegistroBrCnpj("https://hospitalpet.com.br/contato", fakeFetch as any);
    expect(cnpj).toBe("00000000000191");
  });

  it("discoverAndVerifyCnpj valida coerência de cidade/estado e rejeita alucinação/falso-positivo", async () => {
    // Cenário 1: Candidato com cidade compatível e nome semelhante
    const fakeFetchMatch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("nominatim")) {
        return {
          ok: true,
          json: async () => [
            {
              display_name: "Hospital Veterinário Pet Feliz, Porto Alegre",
              extratags: {
                cnpj: "00000000000191",
              },
            },
          ],
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          cnpj: "00000000000191",
          razao_social: "HOSPITAL VETERINARIO PET FELIZ LTDA",
          nome_fantasia: "PET FELIZ",
          municipio: "PORTO ALEGRE",
          uf: "RS",
          logradouro: "AV CRISTOVAO COLOMBO",
          numero: "100",
          cep: "90560000",
          descricao_situacao_cadastral: "ATIVA",
          porte: "ME",
        }),
      } as any;
    });

    const matchLead: MasterLead = {
      key: "lead-poa",
      name: "Hospital Veterinário Pet Feliz",
      city: "Porto Alegre",
      state: "RS",
      address: "Av Cristóvão Colombo, 100",
      sources: ["osm"],
      fieldSources: {},
      phones: [],
      emails: [],
      score: 80,
      triggers: [],
      categories: ["veterinaria"],
    };

    const verified = await discoverAndVerifyCnpj(matchLead, fakeFetchMatch as any);
    expect(verified).not.toBeNull();
    expect(verified?.cnpj).toBe("00000000000191");
    expect(verified?.fiscal.razaoSocial).toBe("HOSPITAL VETERINARIO PET FELIZ LTDA");

    // Cenário 2: Anti-alucinação - Candidato em outra cidade sem similaridade suficiente
    const fakeFetchMismatch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("nominatim")) {
        return {
          ok: true,
          json: async () => [
            {
              display_name: "Padaria do Bairro, Manaus",
              extratags: {
                cnpj: "11222333000181",
              },
            },
          ],
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          cnpj: "11222333000181",
          razao_social: "SUPERMERCADO OUTRO ESTADO S/A",
          municipio: "MANAUS",
          uf: "AM",
          descricao_situacao_cadastral: "ATIVA",
        }),
      } as any;
    });

    const mismatchLead: MasterLead = {
      key: "lead-sp",
      name: "Padaria do Bairro",
      city: "Porto Alegre",
      state: "RS",
      sources: ["osm"],
      fieldSources: {},
      phones: [],
      emails: [],
      score: 50,
      triggers: [],
      categories: ["padaria"],
    };

    const rejected = await discoverAndVerifyCnpj(mismatchLead, fakeFetchMismatch as any);
    expect(rejected).toBeNull();
  });

  it("calculateCompleteness pontua 4 pilares e lista campos faltantes com transparência", () => {
    const leadIncomplete: MasterLead = {
      key: "lead-simple",
      name: "Oficina Mecânica Express",
      city: "Curitiba",
      state: "PR",
      sources: ["osm"],
      fieldSources: {},
      phones: [{ raw: "41999998888", e164: "+5541999998888", type: "mobile", sources: ["osm"], confirmed: false, whatsappLikely: true }],
      emails: [],
      score: 60,
      triggers: [],
      categories: ["oficina"],
    };

    const rep = calculateCompleteness(leadIncomplete);
    expect(rep.overallScore).toBeLessThan(70);
    expect(rep.identification.missing).toContain("Razão social");
    expect(rep.identification.missing).toContain("CNPJ");
    expect(rep.fiscal.missing).toContain("Situação cadastral");
    expect(rep.missingFields.some((f) => /site|website/i.test(f))).toBe(true);
    expect(rep.missingFields).toContain("CNPJ");
  });

  it("buildContactChannels segrega telefone fixo, celular, whatsapp, e-mail comercial e de atendimento", () => {
    const lead: MasterLead = {
      key: "lead-contatos",
      name: "Clínica Saúde Total",
      sources: ["site", "osm"],
      fieldSources: {},
      phones: [
        { raw: "5133334444", e164: "+555133334444", type: "landline", sources: ["site"], confirmed: true, whatsappLikely: false },
        { raw: "51988887777", e164: "+5551988887777", type: "mobile", sources: ["site"], confirmed: true, whatsappLikely: true },
      ],
      emails: [
        { value: "vendas@saudetotal.com.br", sources: ["site"] },
        { value: "sac@saudetotal.com.br", sources: ["site"] },
      ],
      siteDiagnosis: {
        hasWhatsappLink: true,
        whatsappNumber: "+5551988887777",
      },
      website: "https://saudetotal.com.br",
      score: 85,
      triggers: [],
      categories: ["clinica"],
    };

    const channels = buildContactChannels(lead);
    expect(channels.landline).toBe("+555133334444");
    expect(channels.mobilePhone).toBe("+5551988887777");
    expect(channels.whatsapp).toBe("+5551988887777");
    expect(channels.commercialEmail).toBe("vendas@saudetotal.com.br");
    expect(channels.supportEmail).toBe("sac@saudetotal.com.br");
    expect(channels.officialWebsite).toBe("https://saudetotal.com.br");
  });

  it("enrichSingleLead enriquece empresa SEM site através de fontes públicas sem abandoná-la", async () => {
    const leadSemSite: MasterLead = {
      key: "sem-site-1",
      name: "Bar e Restaurante Tradicional",
      city: "Porto Alegre",
      state: "RS",
      address: "Rua dos Andradas, 500",
      sources: ["osm"],
      fieldSources: {},
      phones: [{ raw: "5132221111", e164: "+555132221111", type: "landline", sources: ["osm"], confirmed: false, whatsappLikely: false }],
      emails: [],
      score: 65,
      triggers: [],
      categories: ["restaurante"],
    };

    const enriched = await enrichSingleLead(leadSemSite, {
      forceRefresh: true,
    });

    // Não deve lançar erro nem abandonar a empresa
    expect(enriched.key).toBe("sem-site-1");
    expect(enriched.completeness).toBeDefined();
    expect(enriched.contactChannels).toBeDefined();
    expect(enriched.qualityStatus).toBeDefined();
    // Confirma que a completude lista a ausência de site sem inventar
    expect(enriched.completeness?.missingFields).toContain("Website institucional");
  });

  it("enrichLeadsBatch processa múltiplas empresas em lote controlado com callback de progresso", async () => {
    const batchLeads: MasterLead[] = [
      {
        key: "batch-1",
        name: "Farmácia Centro",
        city: "Porto Alegre",
        sources: ["osm"],
        fieldSources: {},
        phones: [],
        emails: [],
        score: 70,
        triggers: [],
        categories: ["farmacia"],
      },
      {
        key: "batch-2",
        name: "Padaria Modelo",
        city: "Porto Alegre",
        sources: ["osm"],
        fieldSources: {},
        phones: [],
        emails: [],
        score: 70,
        triggers: [],
        categories: ["padaria"],
      },
    ];

    let progressCallCount = 0;
    const enriched = await enrichLeadsBatch(batchLeads, {
      concurrency: 2,
      delayMs: 10,
      onProgress: (p) => {
        progressCallCount++;
        expect(p.total).toBe(2);
      },
    });

    expect(enriched).toHaveLength(2);
    expect(progressCallCount).toBe(2);
    expect(enriched[0]!.completeness).toBeDefined();
    expect(enriched[1]!.completeness).toBeDefined();
  });
});
