import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  bboxFromCircle, bboxFromPolygon, expandNiches, mergeRecords, lookupCnpj,
  parseBulkList, pointInPolygon, isSafePublicUrl, type MasterLead, type RawRecord, type BBox, type LatLng, type Cell,
  type PhoneInfo, type SourceName, type FiscalProfile,
  searchGooglePlacesMultiQuadrant, discoverWebPresence, calculateLeadScores,
  enrichSingleLead, enrichLeadsBatch, calculateCompleteness, buildContactChannels, buildFieldProvenance,
} from "./discovery";
import { lookupCnpjBatch } from "./discovery/receita";
import { searchAllOSM, searchNominatim, getAdministrativeBoundary, type AdminBoundary } from "./discovery/osm";
import { crawlSite } from "./discovery/crawler";

const latlng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const areaInput = z.object({
  niches: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
  expand: z.boolean().default(true),
  mode: z.enum(["city", "neighborhood", "radius", "polygon", "bbox"]).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  neighborhood: z.string().optional(),
  area: z.discriminatedUnion("type", [
    z.object({ type: z.literal("circle"), center: latlng, radiusKm: z.number().min(0.2).max(100) }),
    z.object({ type: z.literal("polygon"), points: z.array(latlng).min(3).max(200) }),
    z.object({ type: z.literal("bbox"), latMin: z.number(), lngMin: z.number(), latMax: z.number(), lngMax: z.number() }),
    z.object({ type: z.literal("city"), city: z.string(), state: z.string().optional() }),
    z.object({ type: z.literal("neighborhood"), city: z.string(), neighborhood: z.string(), state: z.string().optional() }),
  ]).optional(),
  enrich: z.boolean().default(false),
  googlePlacesKey: z.string().optional(),
  cursor: z.object({
    pendingCells: z.array(z.object({
      id: z.string(),
      depth: z.number(),
      latMin: z.number(),
      latMax: z.number(),
      lngMin: z.number(),
      lngMax: z.number(),
    })).optional(),
    completedCellIds: z.array(z.string()).optional(),
  }).optional(),
});

function safeDecryptKey(ciphertext: string): string {
  try {
    const { decryptB2B } = require("./b2b-crypto.server");
    return decryptB2B(ciphertext);
  } catch {
    return ciphertext;
  }
}

export interface DiscoverAreaStats {
  cells: number;
  cellsPending?: number;
  cellsCompleted?: number;
  truncated: boolean;
  raw: number;
  unique: number;
  duplicatesIgnored: number;
  sources: {
    googlePlaces: number;
    osm: number;
    web: number;
    receita: number;
  };
  hasGoogleKey: boolean;
}

export interface DiscoverAreaResult {
  leads: MasterLead[];
  terms: string[];
  relatedCategories?: string[];
  cnaes?: string[];
  stats: DiscoverAreaStats;
  cursor?: {
    pendingCells: Cell[];
    completedCellIds: string[];
    hasMore: boolean;
  };
  boundary?: {
    name: string;
    city?: string;
    state?: string;
    neighborhood?: string;
    bbox: BBox;
    center: LatLng;
  };
  error: string | null;
}

const CITIES_COORDS: Record<string, { lat: number; lng: number }> = {
  "Porto Alegre": { lat: -30.0346, lng: -51.2177 },
  "São Paulo": { lat: -23.5505, lng: -46.6333 },
  "Rio de Janeiro": { lat: -22.9068, lng: -43.1729 },
  "Belo Horizonte": { lat: -19.9167, lng: -43.9345 },
  "Curitiba": { lat: -25.4284, lng: -49.2733 },
  "Brasília": { lat: -15.7939, lng: -47.8828 },
  "Salvador": { lat: -12.9777, lng: -38.5016 },
  "Fortaleza": { lat: -3.7319, lng: -38.5267 },
  "Recife": { lat: -8.0476, lng: -34.877 },
  "Goiânia": { lat: -16.6869, lng: -49.2648 },
};

function detectCityFromCoords(coords?: { lat: number; lng: number }): string {
  if (!coords) return "Porto Alegre";
  for (const [name, c] of Object.entries(CITIES_COORDS)) {
    const dLat = Math.abs(c.lat - coords.lat);
    const dLng = Math.abs(c.lng - coords.lng);
    if (dLat < 0.35 && dLng < 0.35) return name;
  }
  return "Porto Alegre";
}

async function fetchGooglePlacesDirect(
  keyword: string,
  city: string,
  apiKey: string
): Promise<RawRecord[]> {
  try {
    const query = `${keyword} em ${city} Brasil`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[GooglePlaces] HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (json.status !== "OK" || !Array.isArray(json.results)) {
      if (json.error_message) console.warn("[GooglePlaces] API erro:", json.error_message);
      return [];
    }
    return json.results.map((item: any) => ({
      source: "google_maps" as const,
      sourceId: item.place_id,
      name: item.name,
      address: item.formatted_address,
      lat: item.geometry?.location?.lat,
      lng: item.geometry?.location?.lng,
      rating: item.rating,
      reviewsCount: item.user_ratings_total,
      phones: item.formatted_phone_number ? [item.formatted_phone_number] : [],
    }));
  } catch (err) {
    console.warn("[GooglePlaces] Falha de rede:", err instanceof Error ? err.message : err);
    return [];
  }
}

export const discoverArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => areaInput.parse(input))
  .handler(async ({ data, context }): Promise<DiscoverAreaResult> => {
    const niche = data.expand ? expandNiches(data.niches) : { label: data.niches.join(", "), synonyms: data.niches, osm: [] as string[] };
    const keywords = Array.from(new Set([...data.niches, ...niche.synonyms]));

    // 1. Resolução de Bounding Box e Limites Administrativos Reais (Cidade inteira, Bairro, Raio ou Polígono)
    let city = data.city;
    let state = data.state;
    let neighborhood = data.neighborhood;
    let bbox: BBox;
    let poly: { lat: number; lng: number }[] | null = null;
    let adminBoundary: AdminBoundary | null = null;

    const reqMode = data.mode || (data.area ? data.area.type : "city");

    if (reqMode === "city" || data.area?.type === "city") {
      const cityName = (data.area?.type === "city" ? data.area.city : city) || "Porto Alegre";
      city = cityName;
      adminBoundary = await getAdministrativeBoundary(cityName, state);
      if (adminBoundary) {
        bbox = adminBoundary.bbox;
        poly = adminBoundary.polygon || null;
      } else {
        const center = CITIES_COORDS[cityName] || { lat: -30.0346, lng: -51.2177 };
        bbox = bboxFromCircle(center, 25);
      }
    } else if (reqMode === "neighborhood" || data.area?.type === "neighborhood") {
      const cityName = (data.area?.type === "neighborhood" ? data.area.city : city) || "Porto Alegre";
      const neighName = (data.area?.type === "neighborhood" ? data.area.neighborhood : neighborhood) || "";
      city = cityName;
      neighborhood = neighName;
      adminBoundary = await getAdministrativeBoundary(cityName, state, neighName);
      if (adminBoundary) {
        bbox = adminBoundary.bbox;
        poly = adminBoundary.polygon || null;
      } else {
        const center = CITIES_COORDS[cityName] || { lat: -30.0346, lng: -51.2177 };
        bbox = bboxFromCircle(center, 5);
      }
    } else if (data.area?.type === "polygon") {
      poly = data.area.points;
      bbox = bboxFromPolygon(data.area.points);
      if (!city) city = detectCityFromCoords(data.area.points[0]);
    } else if (data.area?.type === "circle") {
      bbox = bboxFromCircle(data.area.center, data.area.radiusKm);
      if (!city) city = detectCityFromCoords(data.area.center);
    } else if (data.area?.type === "bbox") {
      bbox = data.area;
      if (!city) city = detectCityFromCoords({ lat: (bbox.latMin + bbox.latMax) / 2, lng: (bbox.lngMin + bbox.lngMax) / 2 });
    } else {
      const cityName = city || "Porto Alegre";
      adminBoundary = await getAdministrativeBoundary(cityName, state);
      if (adminBoundary) {
        bbox = adminBoundary.bbox;
        poly = adminBoundary.polygon || null;
      } else {
        const center = CITIES_COORDS[cityName] || { lat: -30.0346, lng: -51.2177 };
        bbox = bboxFromCircle(center, 15);
      }
    }

    if (!city) city = "Porto Alegre";

    // 2. Cursor e Continuidade (Células Pendentes e Concluídas)
    const initialQueue = data.cursor?.pendingCells as Cell[] | undefined;
    const completedCellIds = data.cursor?.completedCellIds;

    // 3. Resolução da chave da Google Places API (Environment -> Input -> Banco Supabase)
    let resolvedGoogleKey = data.googlePlacesKey?.trim() ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.VITE_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "";

    if (!resolvedGoogleKey && context?.supabase && context?.userId) {
      try {
        const { data: conn } = await context.supabase
          .from("b2b_connections")
          .select("key_ciphertext")
          .eq("user_id", context.userId)
          .eq("provider", "google_places")
          .maybeSingle();
        if (conn?.key_ciphertext) {
          resolvedGoogleKey = safeDecryptKey(conn.key_ciphertext);
        }
      } catch (err) {
        console.warn("[Discovery] Erro ao buscar chave Google no banco:", err);
      }
    }

    // 4. Busca no Google Places API (New) com FieldMask, paginação e subdivisão Quadtree
    let placesRecords: any[] = [];
    if (resolvedGoogleKey) {
      try {
        placesRecords = await searchGooglePlacesMultiQuadrant(
          bbox,
          keywords,
          city,
          resolvedGoogleKey,
          300,
          initialQueue,
          completedCellIds
        );
      } catch (err) {
        console.warn("[Discovery] Erro ao buscar no Google Places:", err instanceof Error ? err.message : err);
      }
    }

    // 5. Varredura multiquadrante OSM (OpenStreetMap + Nominatim) com particionamento Quadtree
    let osmRecords: any[] = [];
    try {
      osmRecords = await searchAllOSM(
        bbox,
        niche.osm,
        keywords,
        city,
        300,
        initialQueue,
        completedCellIds
      );
    } catch (e) {
      console.warn("[Discovery] Falha no OSM:", e instanceof Error ? e.message : e);
    }

    // 6. Busca Complementar por Categoria Relacionada quando a primeira passagem tiver baixo retorno (< 25 itens)
    if (placesRecords.length + osmRecords.length < 25 && niche.relatedCategories?.length) {
      const fallbackCategories = niche.relatedCategories.slice(0, 2);
      console.log(`[Discovery] Baixo retorno inicial (${placesRecords.length + osmRecords.length}). Disparando busca complementar por categorias relacionadas: ${fallbackCategories.join(", ")}`);

      if (resolvedGoogleKey) {
        try {
          const extraPlaces = await searchGooglePlacesMultiQuadrant(
            bbox,
            fallbackCategories,
            city,
            resolvedGoogleKey,
            100,
            initialQueue,
            completedCellIds
          );
          placesRecords.push(...extraPlaces);
        } catch {}
      } else {
        try {
          const extraOSM = await searchAllOSM(
            bbox,
            niche.osm,
            fallbackCategories,
            city,
            100,
            initialQueue,
            completedCellIds
          );
          osmRecords.push(...extraOSM);
        } catch {}
      }
    }

    // 7. Fallback Gratuito de Presença Web Pública quando não houver chave Google Places (ou falhar)
    let webEnrichedCount = 0;
    if (placesRecords.length === 0 && osmRecords.length > 0) {
      const candidates = osmRecords.filter((r) => !r.phones?.length).slice(0, 10);
      await Promise.all(
        candidates.map(async (rec) => {
          try {
            const web = await discoverWebPresence(rec.name, city, rec.website);
            let updated = false;
            if (web.phones.length) {
              rec.phones = Array.from(new Set([...(rec.phones || []), ...web.phones]));
              updated = true;
            }
            if (web.whatsapp && !rec.whatsapp?.length) {
              rec.whatsapp = [web.whatsapp];
              updated = true;
            }
            if (web.website && !rec.website) {
              rec.website = web.website;
            }
            if (web.socials && Object.keys(web.socials).length) {
              rec.socials = { ...(rec.socials || {}), ...web.socials };
            }
            if (web.emails.length && !rec.emails?.length) {
              rec.emails = web.emails;
            }
            if (updated) webEnrichedCount++;
          } catch {}
        })
      );
    }

    // 8. Consulta BrasilAPI / Receita Federal em lote paralelo controlado para todos os CNPJs descobertos
    const fiscalRecords: RawRecord[] = [];
    const cnpjs = Array.from(new Set([...osmRecords, ...placesRecords].map((r) => r.cnpj).filter(Boolean)));
    if (cnpjs.length > 0) {
      try {
        const batchFiscal = await lookupCnpjBatch(cnpjs as string[], 100, 3);
        for (const f of batchFiscal) {
          fiscalRecords.push({
            source: "receita",
            name: f.nomeFantasia || f.razaoSocial || f.cnpj,
            cnpj: f.cnpj,
            fiscal: f,
          });
        }
      } catch (err) {
        console.warn("[Discovery] Erro ao consultar lote de CNPJs:", err);
      }
    }

    // 9. Log obrigatório no console do servidor
    console.log(
      `[Discovery] Busca "${keywords.slice(0, 2).join(", ")}" em ${city}${neighborhood ? ` (${neighborhood})` : ""}: OSM=${osmRecords.length}, GooglePlaces=${placesRecords.length}, WebPresenca=${webEnrichedCount}, BrasilAPI=${fiscalRecords.length} (GoogleKeyAtiva: ${Boolean(resolvedGoogleKey)})`
    );

    // 10. Filtragem por polígono (se desenhado ou limite administrativo) e fusão com deduplicação, identidade de redes e diversidade
    const allRaw = [...osmRecords, ...placesRecords, ...fiscalRecords].filter(
      (r) => !poly || r.lat == null || r.lng == null || pointInPolygon({ lat: r.lat, lng: r.lng }, poly)
    );

    const merged = mergeRecords(allRaw);
    let leads = merged.map((l) =>
      calculateLeadScores(l, keywords, niche.relatedCategories || [], niche.cnaes || [])
    );

    // Enriquecimento estruturado inicial ou cálculo de completude para todos os leads encontrados
    if (data.enrich && leads.length > 0) {
      try {
        leads = await enrichLeadsBatch(leads, {
          concurrency: 3,
          delayMs: 200,
          googleKey: resolvedGoogleKey,
        });
      } catch (err) {
        console.warn("[Discovery] Erro no enriquecimento em lote durante busca:", err);
      }
    } else {
      leads = leads.map((l) => {
        const completeness = calculateCompleteness(l);
        const contactChannels = buildContactChannels(l);
        const qualityStatus = buildFieldProvenance(l);
        return {
          ...l,
          completeness,
          contactChannels,
          qualityStatus,
        };
      });
    }

    leads = leads.slice(0, 300);

    // 11. Agregação do cursor para continuidade da varredura
    const nextPending = [
      ...(placesRecords.pendingCells || []),
      ...(osmRecords.pendingCells || []),
    ];
    const pendingMap = new Map<string, Cell>();
    for (const c of nextPending) {
      if (!pendingMap.has(c.id)) pendingMap.set(c.id, c);
    }
    const nextCompleted = Array.from(new Set([
      ...(completedCellIds || []),
      ...(placesRecords.completedCellIds || []),
      ...(osmRecords.completedCellIds || []),
    ]));

    const duplicatesIgnored = Math.max(0, allRaw.length - leads.length);

    return {
      leads,
      terms: keywords,
      relatedCategories: niche.relatedCategories || [],
      cnaes: niche.cnaes || [],
      stats: {
        cells: (placesRecords.cellsSearched || 0) + (osmRecords.cellsSearched || 0) || 4,
        cellsPending: pendingMap.size,
        cellsCompleted: nextCompleted.length,
        truncated: Boolean(placesRecords.truncated || osmRecords.truncated),
        raw: allRaw.length,
        unique: leads.length,
        duplicatesIgnored,
        sources: {
          googlePlaces: placesRecords.length,
          osm: osmRecords.length,
          web: webEnrichedCount,
          receita: fiscalRecords.length,
        },
        hasGoogleKey: Boolean(resolvedGoogleKey),
      },
      cursor: {
        pendingCells: Array.from(pendingMap.values()),
        completedCellIds: nextCompleted,
        hasMore: pendingMap.size > 0,
      },
      boundary: adminBoundary ? {
        name: adminBoundary.name,
        city: adminBoundary.city,
        state: adminBoundary.state,
        neighborhood: adminBoundary.neighborhood,
        bbox: adminBoundary.bbox,
        center: adminBoundary.center,
      } : undefined,
      error: leads.length === 0 ? "Nenhuma empresa encontrada com os filtros informados. Tente um nicho mais amplo ou aumente o raio." : null,
    };
  });

const bulkInput = z.object({ text: z.string().max(60_000), city: z.string().optional() });
export const discoverBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkInput.parse(input))
  .handler(async ({ data }): Promise<{ leads: MasterLead[]; pendingNames: string[]; error: string | null }> => {
    const entries = parseBulkList(data.text, 60);
    const recs: RawRecord[] = [];
    const pendingNames: string[] = [];

    await Promise.all(
      entries.map(async (e) => {
        if (e.kind === "cnpj") {
          const f = await lookupCnpj(e.raw);
          if (f) recs.push({ source: "receita", name: f.nomeFantasia || f.razaoSocial || e.raw, cnpj: f.cnpj, fiscal: f });
        } else if (e.kind === "domain") {
          const { record, diagnosis } = await crawlSite(e.raw);
          recs.push({
            ...(record as RawRecord),
            source: "site",
            name: e.raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!,
            website: record.website ?? e.raw,
            siteDiagnosis: diagnosis,
          });
          if (record.cnpj) {
            const f = await lookupCnpj(record.cnpj);
            if (f) recs.push({ source: "receita", name: f.nomeFantasia || f.razaoSocial || e.raw, cnpj: f.cnpj, fiscal: f, website: record.website });
          }
        } else {
          // Busca síncrona direta do nome em vez de aguardar worker offline
          try {
            const nom = await searchNominatim(e.raw, data.city, 3);
            if (nom.length > 0) recs.push(...nom);
            else pendingNames.push(e.raw);
          } catch {
            pendingNames.push(e.raw);
          }
        }
      })
    );

    return { leads: mergeRecords(recs).sort((a, b) => b.score - a.score), pendingNames, error: null };
  });

/** Enriquecimento estruturado para um único lead (com crawler multi-rotas, CNPJ independente, proveniência e completude) */
const enrichSingleInput = z.object({
  key: z.string(),
  name: z.string(),
  website: z.string().optional(),
  cnpj: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  address: z.string().optional(),
  cep: z.string().optional(),
  forceRefresh: z.boolean().optional(),
});

export const enrichLeadSingle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enrichSingleInput.parse(input))
  .handler(async ({ context, data }) => {
    let resolvedGoogleKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.VITE_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "";

    if (!resolvedGoogleKey && context?.supabase && context?.userId) {
      try {
        const { data: conn } = await (context.supabase as any)
          .from("b2b_connections")
          .select("key_ciphertext")
          .eq("user_id", context.userId)
          .eq("provider", "google_places")
          .maybeSingle();
        if (conn?.key_ciphertext) {
          resolvedGoogleKey = safeDecryptKey(conn.key_ciphertext);
        }
      } catch {}
    }

    const leadMock: MasterLead = {
      key: data.key,
      name: data.name,
      website: data.website,
      cnpj: data.cnpj,
      city: data.city,
      state: data.state,
      address: data.address,
      cep: data.cep,
      sources: ["site"],
      fieldSources: {},
      phones: [],
      emails: [],
      score: 50,
      triggers: [],
    };

    const enriched = await enrichSingleLead(leadMock, {
      forceRefresh: data.forceRefresh,
      googleKey: resolvedGoogleKey,
    });

    return {
      lead: enriched,
      fiscal: enriched.fiscal,
      siteDiagnosis: enriched.siteDiagnosis,
      phones: enriched.phones.map((p) => p.e164 || p.raw),
      whatsapp: enriched.phones.find((p) => p.whatsappLikely)?.e164 || enriched.contactChannels?.whatsapp || null,
      email: enriched.emails[0]?.value || enriched.contactChannels?.commercialEmail || null,
      socials: enriched.socials || {},
      qsa: enriched.fiscal?.socios?.[0]
        ? `${enriched.fiscal.socios[0].nome} (${enriched.fiscal.socios[0].qualificacao || "Sócio"})`
        : null,
      completeness: enriched.completeness,
      contactChannels: enriched.contactChannels,
      qualityStatus: enriched.qualityStatus,
    };
  });

/** Enriquecimento em lote estruturado para todas as empresas encontradas */
const enrichBatchInput = z.object({
  leads: z.array(z.any()).min(1).max(300),
  forceRefresh: z.boolean().default(false),
  googlePlacesKey: z.string().optional(),
});

export const enrichDiscoveredLeadsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enrichBatchInput.parse(input))
  .handler(async ({ context, data }) => {
    let resolvedGoogleKey =
      data.googlePlacesKey?.trim() ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.VITE_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "";

    if (!resolvedGoogleKey && context?.supabase && context?.userId) {
      try {
        const { data: conn } = await (context.supabase as any)
          .from("b2b_connections")
          .select("key_ciphertext")
          .eq("user_id", context.userId)
          .eq("provider", "google_places")
          .maybeSingle();
        if (conn?.key_ciphertext) {
          resolvedGoogleKey = safeDecryptKey(conn.key_ciphertext);
        }
      } catch (err) {
        console.warn("[Discovery] Erro ao buscar chave Google no banco:", err);
      }
    }

    let cnpjsDiscovered = 0;
    let whatsappsDiscovered = 0;
    let sitesCrawled = 0;

    const enrichedLeads = await enrichLeadsBatch(data.leads as MasterLead[], {
      concurrency: 3,
      delayMs: 200,
      forceRefresh: data.forceRefresh,
      googleKey: resolvedGoogleKey,
      onProgress: (p) => {
        cnpjsDiscovered = p.cnpjsDiscovered;
        whatsappsDiscovered = p.whatsappsDiscovered;
        sitesCrawled = p.sitesCrawled;
      },
    });

    return {
      leads: enrichedLeads,
      total: enrichedLeads.length,
      cnpjsDiscovered,
      whatsappsDiscovered,
      sitesCrawled,
      error: null,
    };
  });

/** Recupera os detalhes completos e persistidos de uma empresa no Supabase */
const getSavedBusinessInput = z.object({
  tenantId: z.string().uuid(),
  businessId: z.string().uuid().optional(),
  mergeKey: z.string().optional(),
});

export const getSavedBusinessDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getSavedBusinessInput.parse(input))
  .handler(async ({ context, data }): Promise<{ lead: MasterLead | null; error: string | null }> => {
    const sb = context.supabase as any;
    const { data: ok } = await sb.rpc("is_member", { t: data.tenantId });
    if (!ok) return { lead: null, error: "Sem acesso a este tenant." };

    let query = sb.from("crm_businesses").select("*").eq("tenant_id", data.tenantId);
    if (data.businessId) {
      query = query.eq("id", data.businessId);
    } else if (data.mergeKey) {
      query = query.eq("merge_key", data.mergeKey);
    } else {
      return { lead: null, error: "businessId ou mergeKey deve ser fornecido." };
    }

    const { data: b, error: bErr } = await query.maybeSingle();
    if (bErr || !b) return { lead: null, error: bErr?.message || "Empresa não encontrada no banco." };

    const [contactsRes, profileRes, reviewsRes] = await Promise.all([
      sb.from("lead_contacts").select("*").eq("business_id", b.id),
      sb.from("lead_company_profiles").select("*").eq("business_id", b.id).maybeSingle(),
      sb.from("lead_reviews").select("*").eq("business_id", b.id).order("reviewed_at", { ascending: false }).limit(20),
    ]);

    const contacts = contactsRes.data || [];
    const prof = profileRes.data || null;
    const reviews = reviewsRes.data || [];

    const phones: PhoneInfo[] = contacts
      .filter((c: any) => c.kind === "phone")
      .map((c: any) => ({
        raw: c.value,
        e164: c.value,
        type: (c.label as any) || (c.whatsapp ? "mobile" : "landline"),
        sources: (c.sources as SourceName[]) || ["crm"],
        confirmed: Boolean(c.confirmed),
        whatsappLikely: Boolean(c.whatsapp),
      }));

    const emails = contacts
      .filter((c: any) => c.kind === "email")
      .map((c: any) => ({
        value: c.value,
        sources: (c.sources as SourceName[]) || ["crm"],
      }));

    const socials: Record<string, string> = {};
    for (const c of contacts.filter((item: any) => item.kind === "social")) {
      if (c.label && c.value) socials[c.label] = c.value;
    }

    const siteDiag = prof?.site_diagnosis || {};

    const fiscal: FiscalProfile | undefined = prof
      ? {
          cnpj: prof.cnpj,
          razaoSocial: prof.razao_social,
          nomeFantasia: prof.nome_fantasia,
          situacao: prof.situacao,
          situacaoData: siteDiag.situacaoData,
          abertura: prof.abertura,
          idadeAnos: siteDiag.idadeAnos,
          porte: prof.porte,
          capitalSocial: prof.capital_social ? Number(prof.capital_social) : undefined,
          cnaePrincipal: prof.cnae_principal,
          cnaesSecundarios: prof.cnaes_secundarios || [],
          socios: prof.socios || [],
          enderecoCadastral: siteDiag.enderecoCadastral,
          isMatriz: siteDiag.isMatriz,
          tipoUnidade: siteDiag.tipoUnidade,
        }
      : undefined;

    const lead: MasterLead = {
      key: b.merge_key,
      name: b.name,
      category: b.category,
      categories: b.categories || [],
      address: b.address,
      neighborhood: b.neighborhood,
      city: b.city,
      state: b.state,
      cep: b.cep,
      lat: b.lat,
      lng: b.lng,
      website: b.website,
      rating: b.rating ? Number(b.rating) : undefined,
      reviewsCount: b.reviews_count,
      claimed: b.claimed,
      photosCount: b.photos_count,
      openingHours: b.opening_hours,
      sources: b.sources || [],
      fieldSources: b.field_sources || {},
      triggers: b.triggers || [],
      score: b.score || 0,
      phones,
      emails,
      socials,
      cnpj: prof?.cnpj || (b.merge_key.replace(/\D/g, "").length === 14 ? b.merge_key : undefined),
      fiscal,
      siteDiagnosis: siteDiag,
      reviews: reviews.map((r: any) => ({
        rating: r.rating,
        text: r.text,
        date: r.reviewed_at,
      })),
      completeness: siteDiag.completeness || calculateCompleteness({
        key: b.merge_key,
        name: b.name,
        category: b.category,
        categories: b.categories,
        address: b.address,
        city: b.city,
        state: b.state,
        cep: b.cep,
        website: b.website,
        sources: b.sources,
        fieldSources: b.field_sources,
        triggers: b.triggers,
        score: b.score,
        phones,
        emails,
        socials,
        cnpj: prof?.cnpj,
        fiscal,
        siteDiagnosis: siteDiag,
      }),
      contactChannels: siteDiag.contactChannels || buildContactChannels({
        key: b.merge_key,
        name: b.name,
        website: b.website,
        sources: b.sources,
        fieldSources: b.field_sources,
        triggers: b.triggers,
        score: b.score,
        phones,
        emails,
        socials,
        cnpj: prof?.cnpj,
        fiscal,
      }),
      qualityStatus: b.field_sources?.qualityStatus || buildFieldProvenance({
        key: b.merge_key,
        name: b.name,
        website: b.website,
        sources: b.sources,
        fieldSources: b.field_sources,
        triggers: b.triggers,
        score: b.score,
        phones,
        emails,
        socials,
        cnpj: prof?.cnpj,
        fiscal,
      }),
    };

    return { lead, error: null };
  });

/** Salva leads descobertos no tenant (tabelas criadas por docs/sql/2026-motor-descoberta.sql). */
const saveInput = z.object({
  tenantId: z.string().uuid(),
  leads: z.array(z.object({ key: z.string().max(300), name: z.string().max(300) }).passthrough()).min(1).max(200),
});
export const saveDiscoveredLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ context, data }): Promise<{ saved: number; error: string | null }> => {
    const sb = context.supabase as any;
    const { data: ok } = await sb.rpc("is_member", { t: data.tenantId });
    if (!ok) return { saved: 0, error: "Sem acesso a esta empresa." };
    let saved = 0;
    for (const raw of data.leads as unknown as MasterLead[]) {
      const fieldSourcesPayload = {
        ...(raw.fieldSources ?? {}),
        qualityStatus: raw.qualityStatus ?? null,
      };

      const row = {
        tenant_id: data.tenantId,
        user_id: context.userId,
        merge_key: String(raw.key).slice(0, 300),
        name: String(raw.name).slice(0, 300),
        category: raw.category ?? null,
        categories: raw.categories ?? [],
        address: raw.address ?? null,
        neighborhood: raw.neighborhood ?? null,
        city: raw.city ?? null,
        state: raw.state ?? null,
        cep: raw.cep ?? null,
        lat: raw.lat ?? null,
        lng: raw.lng ?? null,
        website: raw.website ?? null,
        rating: raw.rating ?? null,
        reviews_count: raw.reviewsCount ?? null,
        claimed: raw.claimed ?? null,
        photos_count: raw.photosCount ?? null,
        opening_hours: raw.openingHours ?? null,
        sources: raw.sources ?? [],
        field_sources: fieldSourcesPayload,
        triggers: raw.triggers ?? [],
        score: Math.round(raw.score ?? 0),
        updated_at: new Date().toISOString(),
      };
      const { data: b, error } = await sb.from("crm_businesses").upsert(row, { onConflict: "tenant_id,merge_key" }).select("id").single();
      if (error || !b) return { saved, error: error?.message?.includes("does not exist") ? "Tabelas do motor ainda não existem. Aplique docs/sql/2026-motor-descoberta.sql no Supabase." : "Não foi possível salvar." };

      const rawContacts = [
        ...(raw.phones ?? []).map((p) => ({
          kind: "phone",
          value: p.e164 || p.raw,
          label: p.type || (p.whatsappLikely ? "mobile" : "landline"),
          whatsapp: Boolean(p.whatsappLikely),
          sources: p.sources || ["manual"],
          confirmed: Boolean(p.confirmed),
        })),
        ...(raw.contactChannels?.whatsapp ? [{
          kind: "phone",
          value: raw.contactChannels.whatsapp,
          label: "whatsapp",
          whatsapp: true,
          sources: ["whatsapp_link"],
          confirmed: true,
        }] : []),
        ...(raw.emails ?? []).map((e) => ({
          kind: "email",
          value: e.value,
          label: raw.contactChannels?.supportEmail === e.value ? "atendimento" : "comercial",
          whatsapp: false,
          sources: e.sources || ["crawler"],
          confirmed: (e.sources?.length ?? 0) > 1,
        })),
        ...Object.entries(raw.socials ?? {}).map(([k, v]) => ({
          kind: "social",
          value: String(v).slice(0, 500),
          label: k,
          whatsapp: false,
          sources: ["site"],
          confirmed: false,
        })),
      ].map((c) => ({ ...c, tenant_id: data.tenantId, business_id: b.id }));

      if (rawContacts.length) {
        const contactMap = new Map<string, typeof rawContacts[0]>();
        for (const c of rawContacts) {
          const cKey = `${c.kind}:${c.value}`;
          if (!contactMap.has(cKey)) contactMap.set(cKey, c);
        }
        await sb.from("lead_contacts").upsert(Array.from(contactMap.values()), { onConflict: "business_id,kind,value" });
      }

      if (raw.fiscal || raw.siteDiagnosis || raw.completeness || raw.contactChannels) {
        const f = raw.fiscal;
        const siteDiagnosisPayload = {
          ...(raw.siteDiagnosis ?? {}),
          completeness: raw.completeness ?? null,
          contactChannels: raw.contactChannels ?? null,
          qualityStatus: raw.qualityStatus ?? null,
          enderecoCadastral: f?.enderecoCadastral ?? null,
          idadeAnos: f?.idadeAnos ?? null,
          isMatriz: f?.isMatriz ?? null,
          tipoUnidade: f?.tipoUnidade ?? null,
          situacaoData: f?.situacaoData ?? null,
        };

        await sb.from("lead_company_profiles").upsert(
          {
            business_id: b.id,
            tenant_id: data.tenantId,
            cnpj: raw.cnpj ?? f?.cnpj ?? null,
            razao_social: f?.razaoSocial ?? null,
            nome_fantasia: f?.nomeFantasia ?? null,
            situacao: f?.situacao ?? null,
            abertura: f?.abertura ? f.abertura.split("T")[0] : null,
            porte: f?.porte ?? null,
            capital_social: f?.capitalSocial ?? null,
            cnae_principal: f?.cnaePrincipal ?? null,
            cnaes_secundarios: f?.cnaesSecundarios ?? [],
            socios: f?.socios ?? [],
            site_diagnosis: siteDiagnosisPayload,
          },
          { onConflict: "business_id" }
        );
      }
      if (raw.reviews?.length) {
        await sb.from("lead_reviews").delete().eq("business_id", b.id);
        await sb.from("lead_reviews").insert(
          raw.reviews.slice(0, 30).map((r) => ({
            tenant_id: data.tenantId,
            business_id: b.id,
            rating: r.rating,
            text: String(r.text).slice(0, 2000),
            reviewed_at: r.date ?? null,
          }))
        );
      }
      saved++;
    }
    return { saved, error: null };
  });
