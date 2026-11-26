import type { BBox, RawRecord } from "./types";
import { runQuadtree, type Cell } from "./quadtree";
import { searchOverpass, searchNominatim } from "./osm";
import { extractFromHtml, isSafePublicUrl } from "./crawler";
import { normalizeBrPhone } from "./phone";

/**
 * Normaliza telefone brasileiro removendo DDI 55 quando aplicável e preservando DDD + número.
 * Reutiliza normalizeBrPhone de ./phone para evitar duplicação de regras de DDD/E.164.
 */
function normalizeNationalPhone(raw: string): string {
  const br = normalizeBrPhone(raw);
  if (br) return br.e164.replace(/^\+55/, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return raw.replace(/[^\d+]/g, "");
}


export interface GooglePlacesNewOptions {
  query: string;
  apiKey: string;
  bbox?: BBox;
  pageSize?: number;
  maxPages?: number;
}

/**
 * Consulta direta na Google Places API (New / Text Search) usando FieldMask específico
 * e consumo de até 3 páginas (até 60 resultados por query) via nextPageToken.
 * Retorna todos os dados de contato em uma única chamada sem requisições adicionais de Place Details.
 */
export async function searchGooglePlacesNew(
  opts: GooglePlacesNewOptions,
  fetchImpl: typeof fetch = fetch
): Promise<RawRecord[]> {
  const { query, apiKey, bbox, pageSize = 20, maxPages = 3 } = opts;
  if (!apiKey || !apiKey.trim()) return [];

  // Google Places API (New) Text Search
  const url = "https://places.googleapis.com/v1/places:searchText";
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.location",
    "nextPageToken",
  ].join(",");

  const records: RawRecord[] = [];
  let currentToken: string | undefined = undefined;
  let pageCount = 0;

  while (pageCount < maxPages) {
    pageCount++;
    const payload: Record<string, any> = {
      textQuery: query,
      languageCode: "pt-BR",
      pageSize: Math.min(pageSize, 20),
    };

    if (currentToken) {
      payload.pageToken = currentToken;
    } else if (bbox) {
      payload.locationRestriction = {
        rectangle: {
          low: { latitude: bbox.latMin, longitude: bbox.lngMin },
          high: { latitude: bbox.latMax, longitude: bbox.lngMax },
        },
      };
    }

    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey.trim(),
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (pageCount === 1) {
          console.warn(`[GooglePlacesNew] Status HTTP ${res.status}: fallback para versão padrão`);
        }
        break;
      }

      const data = await res.json();
      const places = data.places || [];

      for (const p of places) {
        const name = p.displayName?.text?.trim() || "";
        if (!name) continue;

        const rawPhones = [p.nationalPhoneNumber, p.internationalPhoneNumber].filter(Boolean) as string[];
        const phones = Array.from(
          new Set(rawPhones.map((ph) => normalizeNationalPhone(ph).slice(0, 16)).filter((ph) => ph.length >= 8))
        );

        records.push({
          source: "google_maps",
          sourceId: p.id,
          name,
          address: p.formattedAddress,
          phones,
          website: p.websiteUri || undefined,
          rating: p.rating,
          reviewsCount: p.userRatingCount,
          lat: p.location?.latitude,
          lng: p.location?.longitude,
        });
      }

      currentToken = data.nextPageToken;
      if (!currentToken) break;

      // Aguarda 400ms para o token do Google se tornar ativo para a página seguinte
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn("[GooglePlacesNew] Erro ao chamar endpoint New:", err instanceof Error ? err.message : err);
      break;
    }
  }

  if (records.length > 0) {
    return records;
  }

  // Fallback para Google Places API (Legacy Text Search) caso a chave não tenha Places (New) ativo
  try {
    const legacyUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${encodeURIComponent(apiKey.trim())}`;
    const legacyRes = await fetchImpl(legacyUrl);
    if (!legacyRes.ok) return [];

    const json = await legacyRes.json();
    if (!Array.isArray(json.results)) return [];

    return json.results.map((item: any) => ({
      source: "google_maps" as const,
      sourceId: item.place_id,
      name: item.name,
      address: item.formatted_address,
      lat: item.geometry?.location?.lat,
      lng: item.geometry?.location?.lng,
      rating: item.rating,
      reviewsCount: item.user_ratings_total,
      phones: item.formatted_phone_number ? [normalizeNationalPhone(item.formatted_phone_number)] : [],
    }));
  } catch (err) {
    console.warn("[GooglePlacesLegacy] Falha:", err instanceof Error ? err.message : err);
    return [];
  }
}

export type SearchGooglePlacesResult = RawRecord[] & {
  pendingCells?: Cell[];
  completedCellIds?: string[];
  cellsSearched?: number;
  truncated?: boolean;
};

/**
 * Supera o teto de 20 resultados por busca combinando particionamento recursivo Quadtree
 * com consumo de múltiplas páginas do Google Places API (New).
 */
export async function searchGooglePlacesMultiQuadrant(
  bbox: BBox,
  keywords: string[],
  city: string,
  apiKey: string,
  maxItems = 300,
  initialQueue?: Cell[] | typeof fetch,
  completedCellIds?: string[],
  fetchImpl: typeof fetch = fetch
): Promise<SearchGooglePlacesResult> {
  let realInitialQueue: Cell[] | undefined = Array.isArray(initialQueue) ? initialQueue : undefined;
  let realFetch = typeof initialQueue === "function" ? initialQueue : fetchImpl;

  // Sem chave Google: executa cascata complementar (Overpass + Nominatim) tratando falhas isoladamente.
  if (!apiKey || !apiKey.trim()) {
    const combined: RawRecord[] = [];
    const seen = new Set<string>();

    const pushUnique = (records: RawRecord[]) => {
      for (const r of records) {
        const key = r.sourceId || `${r.name.toLowerCase()}_${r.lat?.toFixed(3) ?? ""}_${r.lng?.toFixed(3) ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(r);
        }
      }
    };

    const runSource = async (label: string, fn: () => Promise<RawRecord[]>): Promise<void> => {
      try {
        const items = await fn();
        if (items.length === 0) {
          console.info(`[DiscoveryCascade] ${label}: resultado vazio`);
        } else if (items.length < maxItems) {
          console.info(`[DiscoveryCascade] ${label}: resultado parcial (${items.length})`);
          pushUnique(items);
        } else {
          pushUnique(items);
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err?.name === "AbortError" || /timeout|aborted/i.test(msg)) {
          console.warn(`[DiscoveryCascade] ${label}: timeout (${msg})`);
        } else if (err?.status === 429 || /\b429\b|rate.?limit/i.test(msg)) {
          console.warn(`[DiscoveryCascade] ${label}: HTTP 429 rate limit (${msg})`);
        } else {
          console.warn(`[DiscoveryCascade] ${label}: erro de rede/execução (${msg})`);
        }
      }
    };

    await runSource("Overpass", () => searchOverpass(bbox, [], keywords, realFetch));

    // Mesmo quando Overpass retorna resultados parciais, complementa com Nominatim até maxItems
    if (combined.length < maxItems && keywords.length > 0) {
      await runSource("Nominatim", () => searchNominatim(keywords.join(" "), city, bbox, Math.min(100, maxItems), realFetch));
    }

    const items = combined.slice(0, maxItems);
    const result: SearchGooglePlacesResult = Object.assign(items, {
      pendingCells: [],
      completedCellIds: [],
      cellsSearched: 1,
      truncated: combined.length > maxItems,
    });
    return result;
  }

  const primaryKeywords = keywords.slice(0, 3);

  const quadRes = await runQuadtree<RawRecord>(
    bbox,
    async (cell) => {
      const cellResults: RawRecord[] = [];
      for (const kw of primaryKeywords) {
        const query = `${kw} em ${city} Brasil`;
        const places = await searchGooglePlacesNew({ query, apiKey, bbox: cell, pageSize: 20, maxPages: 2 }, realFetch);
        cellResults.push(...places);
        if (cellResults.length >= 35) break;
      }
      return { count: cellResults.length, items: cellResults };
    },
    (p) => p.sourceId || `${p.name}_${p?.lat?.toFixed(3)}_${p?.lng?.toFixed(3)}`,
    {
      saturation: 30,
      maxDepth: 4,
      maxCells: 16,
      initialGrid: 2,
      initialQueue: realInitialQueue,
      completedCellIds,
      maxTimeMs: 9000,
    }
  );

  const items = quadRes.items.slice(0, maxItems);
  const result: SearchGooglePlacesResult = Object.assign(items, {
    pendingCells: quadRes.pendingCells,
    completedCellIds: quadRes.completedCellIds,
    cellsSearched: quadRes.stats.cellsSearched,
    truncated: quadRes.stats.truncated,
  });
  return result;
}

/**
 * Descoberta Web Pública Gratuita:
 * Quando o usuário não possui chave da Google Places API, descobre contatos reais (telefone,
 * WhatsApp, site e redes sociais) através de consultas abertas na web e crawling seguro.
 */
export async function discoverWebPresence(
  name: string,
  city?: string,
  website?: string,
  fetchImpl: typeof fetch = fetch
): Promise<{
  phones: string[];
  whatsapp?: string;
  website?: string;
  socials: Record<string, string>;
  emails: string[];
}> {
  const out = {
    phones: [] as string[],
    whatsapp: undefined as string | undefined,
    website: website,
    socials: {} as Record<string, string>,
    emails: [] as string[],
  };

  let targetUrl = website;

  // Se não temos site, tenta localizar via busca aberta geográfica Nominatim com extratags
  if (!targetUrl && name) {
    try {
      const q = city ? `${name}, ${city}` : name;
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&extratags=1&limit=3`;
      const res = await fetchImpl(nomUrl, {
        headers: {
          "User-Agent": "AlliarCRM-B2B/1.0 (https://alliar.com.br; dev@alliar.com.br)",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });

      if (res.ok) {
        const items = (await res.json()) as any[];
        for (const item of items) {
          const extra = item.extratags || {};
          const phone = extra.phone || extra["contact:phone"] || extra["contact:mobile"];
          if (phone) {
            out.phones.push(normalizeNationalPhone(phone));
          }

          const wa = extra["contact:whatsapp"];
          if (wa && !out.whatsapp) out.whatsapp = wa.replace(/[^\d+]/g, "");

          const site = extra.website || extra["contact:website"];
          if (site && !targetUrl) targetUrl = site;

          if (extra["contact:instagram"]) out.socials.instagram = extra["contact:instagram"];
          if (extra["contact:facebook"]) out.socials.facebook = extra["contact:facebook"];
          if (extra.email || extra["contact:email"]) out.emails.push(extra.email || extra["contact:email"]);
        }
      }
    } catch {}
  }

  // Se encontramos ou recebemos um site seguro, executa crawling com timeout rápido
  if (targetUrl) {
    out.website = targetUrl;
    try {
      const base = isSafePublicUrl(targetUrl);
      if (base) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetchImpl(base.origin + "/", {
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AlliarBot/1.0)", Accept: "text/html" },
        });
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          const extracted = extractFromHtml(html);
          if (extracted.phones.length) out.phones.push(...extracted.phones);
          if (extracted.whatsapp.length && !out.whatsapp) out.whatsapp = extracted.whatsapp[0];
          if (extracted.emails.length) out.emails.push(...extracted.emails);
          if (extracted.socials) out.socials = { ...out.socials, ...extracted.socials };
        }
      }
    } catch {}
  }

  // Normalização uniforme e deduplicação dos telefones (HTML, Nominatim e demais fontes)
  out.phones = Array.from(new Set(out.phones.map((p) => normalizeNationalPhone(p)).filter((p) => p.length >= 8)));
  return out;
}
