import type { BBox, LatLng, RawRecord } from "./types";
import { initialCells, runQuadtree, type Cell } from "./quadtree";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const KEYS = ["shop", "amenity", "office", "craft", "tourism", "healthcare", "leisure", "company"];

export function buildOverpassQuery(b: BBox, selectors: string[], keywords: string[] = [], limit = 500): string {
  const box = `${b.latMin},${b.lngMin},${b.latMax},${b.lngMax}`;
  const sel = selectors.length ? selectors.filter((s) => /^[a-z_]+=[a-z_]+$/.test(s)) : [];
  
  const parts: string[] = [];

  // 1. Tag selectors (ex: shop=pet, amenity=dentist)
  for (const s of sel) {
    const [k, v] = s.split("=");
    parts.push(`node["${k}"="${v}"]["name"](${box});`);
    parts.push(`way["${k}"="${v}"]["name"](${box});`);
  }

  // 2. Case-insensitive search by name if keywords exist
  for (const kw of keywords.slice(0, 4)) {
    const safeKw = kw.trim().replace(/["\\]/g, "");
    if (safeKw.length >= 3) {
      parts.push(`node["name"~"${safeKw}",i](${box});`);
      parts.push(`way["name"~"${safeKw}",i](${box});`);
    }
  }

  // Fallback: se nada específico foi passado, busca categorias de negócios gerais com nome
  if (!parts.length) {
    for (const k of KEYS.slice(0, 4)) {
      parts.push(`node["${k}"]["name"](${box});`);
      parts.push(`way["${k}"]["name"](${box});`);
    }
  }

  return `[out:json][timeout:15];(${parts.join("")});out center tags ${limit};`;
}

export function parseOverpass(json: { elements?: any[] }): RawRecord[] {
  const out: RawRecord[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    if (!t.name) continue;
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    const cat = KEYS.map((k) => (t[k] ? `${k}=${t[k]}` : null)).find(Boolean) ?? undefined;
    const phones = [t.phone, t["contact:phone"], t["contact:mobile"], t.mobile].filter(Boolean).flatMap((p: string) => p.split(/[;,]/));
    out.push({
      source: "osm",
      sourceId: `${e.type}/${e.id}`,
      name: t.name,
      altNames: [t.alt_name, t.official_name, t.brand].filter(Boolean),
      category: cat,
      lat,
      lng,
      street: t["addr:street"],
      number: t["addr:housenumber"],
      neighborhood: t["addr:suburb"],
      city: t["addr:city"],
      state: t["addr:state"],
      cep: t["addr:postcode"],
      address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ") || undefined,
      phones,
      emails: [t.email, t["contact:email"]].filter(Boolean),
      website: t.website ?? t["contact:website"],
      whatsapp: t["contact:whatsapp"] ? [t["contact:whatsapp"]] : [],
      socials: { instagram: t["contact:instagram"], facebook: t["contact:facebook"] },
      openingHours: t.opening_hours,
    });
  }
  return out;
}

export async function searchOverpass(
  b: BBox,
  selectors: string[] = [],
  keywords: string[] = [],
  fetchImpl: typeof fetch = fetch
): Promise<RawRecord[]> {
  const query = buildOverpassQuery(b, selectors, keywords);
  const body = "data=" + encodeURIComponent(query);

  let hadTransportOrHttpError = false;
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const url = ENDPOINTS[i]!;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    try {
      const r = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AlliarCRM-B2B/1.0 (https://alliar.com.br; dev@alliar.com.br)",
          "Referer": "https://alliar.com.br",
          "Accept": "application/json",
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (r.ok) {
        const json = await r.json().catch(() => null);
        if (json && Array.isArray(json.elements)) {
          // Resposta válida do Overpass (inclusive 0 elementos): não percorre outros endpoints.
          return parseOverpass(json);
        }
        hadTransportOrHttpError = true;
      } else if (r.status === 429) {
        hadTransportOrHttpError = true;
        console.warn(`[Overpass] HTTP 429 em ${url}, tentando próximo servidor.`);
        if (i < ENDPOINTS.length - 1) {
          await new Promise((res) => setTimeout(res, 250));
        }
      } else {
        hadTransportOrHttpError = true;
        console.warn(`[Overpass] HTTP ${r.status} em ${url}, tentando próximo servidor.`);
      }
    } catch (e: any) {
      clearTimeout(timer);
      hadTransportOrHttpError = true;
      const isTimeout = e?.name === "AbortError";
      console.warn(`[Overpass] ${isTimeout ? "Timeout" : "Erro de rede"} em ${url}, tentando próximo servidor.`);
    }
  }

  if (hadTransportOrHttpError) {
    console.warn("[Overpass] Todos os servidores falharam ou expiraram.");
  }
  return [];
}


/**
 * Consulta geográfica via Nominatim (OpenStreetMap) com suporte a viewbox restrito por quadrante
 */
export async function searchNominatim(
  query: string,
  city?: string,
  bbox?: BBox,
  limit = 50,
  fetchImpl: typeof fetch = fetch
): Promise<RawRecord[]> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&extratags=1&limit=${limit}`;

    if (bbox) {
      // viewbox: left, top, right, bottom (lngMin, latMax, lngMax, latMin)
      url += `&viewbox=${bbox.lngMin},${bbox.latMax},${bbox.lngMax},${bbox.latMin}&bounded=1`;
    } else if (city && !query.toLowerCase().includes(city.toLowerCase())) {
      url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${query}, ${city}`)}&format=json&addressdetails=1&extratags=1&limit=${limit}`;
    }

    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "AlliarCRM-B2B/1.0 (https://alliar.com.br; dev@alliar.com.br)",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!res.ok) return [];
    const rawItems = (await res.json()) as any[];

    return rawItems
      .filter((item) => item.name || item.display_name)
      .map((item, idx) => {
        const extra = item.extratags || {};
        const addr = item.address || {};
        const rawPhone = extra.phone || extra["contact:phone"] || extra["contact:mobile"] || "";
        const cleanPhone = rawPhone.replace(/[^\d+]/g, "").slice(0, 16);
        const name = item.name || (item.display_name ? item.display_name.split(",")[0] : `Empresa ${idx + 1}`);
        const detectedCity = addr.city || addr.town || addr.municipality || addr.village || city;
        const detectedState = addr.state || "";

        return {
          source: "nominatim" as const,
          sourceId: `nom/${item.osm_id || item.place_id || idx}`,
          name: name.trim(),
          address: item.display_name || `${detectedCity}, ${detectedState}`,
          street: addr.road,
          number: addr.house_number,
          neighborhood: addr.suburb || addr.neighbourhood,
          city: detectedCity,
          state: detectedState,
          cep: addr.postcode,
          lat: item.lat ? parseFloat(item.lat) : undefined,
          lng: item.lon ? parseFloat(item.lon) : undefined,
          phones: cleanPhone ? [cleanPhone] : [],
          emails: extra.email || extra["contact:email"] ? [extra.email || extra["contact:email"]] : [],
          website: extra.website || extra["contact:website"] || undefined,
          whatsapp: extra["contact:whatsapp"] ? [extra["contact:whatsapp"]] : [],
          socials: {
            instagram: extra["contact:instagram"],
            facebook: extra["contact:facebook"],
          },
        };
      });
  } catch (err) {
    console.warn("[Nominatim] Erro na busca:", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface AdminBoundary {
  name: string;
  city: string;
  state?: string;
  neighborhood?: string;
  bbox: BBox;
  polygon?: LatLng[];
  center: LatLng;
}

/**
 * Consulta limites administrativos reais (cidade inteira ou bairro específico)
 * via Nominatim/OSM retornando a Bounding Box real e o polígono oficial.
 */
export async function getAdministrativeBoundary(
  city: string,
  state?: string,
  neighborhood?: string,
  fetchImpl: typeof fetch = fetch
): Promise<AdminBoundary | null> {
  try {
    const parts = [neighborhood, city, state, "Brasil"].filter(Boolean);
    const query = parts.join(", ");
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&addressdetails=1&limit=1`;

    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "AlliarCRM-B2B/1.0 (https://alliar.com.br; dev@alliar.com.br)",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!data.length || !data[0].boundingbox) return null;

    const item = data[0];
    const bbox: BBox = {
      latMin: parseFloat(item.boundingbox[0]),
      latMax: parseFloat(item.boundingbox[1]),
      lngMin: parseFloat(item.boundingbox[2]),
      lngMax: parseFloat(item.boundingbox[3]),
    };

    let polygon: LatLng[] | undefined;
    const geo = item.geojson;
    if (geo?.type === "Polygon" && Array.isArray(geo.coordinates?.[0])) {
      polygon = geo.coordinates[0].map(([lng, lat]: [number, number]) => ({ lat, lng }));
    } else if (geo?.type === "MultiPolygon" && Array.isArray(geo.coordinates?.[0]?.[0])) {
      polygon = geo.coordinates[0][0].map(([lng, lat]: [number, number]) => ({ lat, lng }));
    }

    return {
      name: item.display_name || query,
      city: item.address?.city || item.address?.town || item.address?.municipality || city,
      state: item.address?.state || state,
      neighborhood: item.address?.suburb || neighborhood,
      bbox,
      polygon,
      center: {
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      },
    };
  } catch (err) {
    console.warn("[AdminBoundary] Erro ao buscar limites reais:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type SearchOSMResult = RawRecord[] & {
  pendingCells?: Cell[];
  completedCellIds?: string[];
  cellsSearched?: number;
  truncated?: boolean;
};

/**
 * Busca ampliada OSM com particionamento dinâmico Quadtree e suporte a cursor/continuidade.
 * Subdivide células que atingem saturação para cobrir estabelecimentos independentes e de bairro.
 */
export async function searchAllOSM(
  bbox: BBox,
  selectors: string[] = [],
  keywords: string[] = [],
  city?: string,
  maxItems = 300,
  initialQueue?: Cell[] | typeof fetch,
  completedCellIds?: string[],
  fetchImpl: typeof fetch = fetch
): Promise<SearchOSMResult> {
  const realInitialQueue = Array.isArray(initialQueue) ? initialQueue : undefined;
  const realFetch = typeof initialQueue === "function" ? initialQueue : fetchImpl;
  const seenStems = new Set<string>();
  const termsToSearch = keywords.filter((kw) => {
    const stem = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/s\b/g, "").trim();
    if (!stem || seenStems.has(stem)) return false;
    seenStems.add(stem);
    return true;
  }).slice(0, 4);

  // Executa busca via runQuadtree particionando células saturadas
  const quadtreeRes = await runQuadtree<RawRecord>(
    bbox,
    async (cell) => {
      const cellItems: RawRecord[] = [];
      // 1. Overpass na célula específica
      try {
        const op = await searchOverpass(cell, selectors, keywords, realFetch);
        cellItems.push(...op);
      } catch {}

      // 2. Nominatim no viewbox restrito da célula se tiver capacidade
      if (cellItems.length < 50 && termsToSearch.length > 0) {
        for (const term of termsToSearch.slice(0, 3)) {
          try {
            const nom = await searchNominatim(term, city, cell, 50, realFetch);
            cellItems.push(...nom);
          } catch {}
        }
      }

      return {
        count: cellItems.length,
        items: cellItems,
      };
    },
    (r) => {
      const normName = r.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const coordKey = r.lat && r.lng ? `${r.lat.toFixed(3)}|${r.lng.toFixed(3)}` : (r.address || r.city || "");
      return `${normName}|${coordKey}`;
    },
    {
      saturation: 30, // Se encontrar 30+ itens, a área tem alta densidade comercial: subdivide!
      maxDepth: 4,
      maxCells: 16, // Lote seguro para não estourar timeout da requisição HTTP
      initialGrid: 2,
      initialQueue: realInitialQueue,
      completedCellIds,
      maxTimeMs: 9000, // Orçamento seguro de tempo
    }
  );

  const combined = quadtreeRes.items.slice(0, maxItems);
  const result: SearchOSMResult = Object.assign(combined, {
    pendingCells: quadtreeRes.pendingCells,
    completedCellIds: quadtreeRes.completedCellIds,
    cellsSearched: quadtreeRes.stats.cellsSearched,
    truncated: quadtreeRes.stats.truncated,
  });

  console.log(`[OSM] Células pesquisadas: ${quadtreeRes.stats.cellsSearched}, encontradas: ${combined.length}, pendentes: ${quadtreeRes.pendingCells.length}`);
  return result;
}
