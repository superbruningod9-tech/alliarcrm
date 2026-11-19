import type { BBox, RawRecord } from "./types";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const KEYS = ["shop", "amenity", "office", "craft", "tourism", "healthcare", "leisure"];

export function buildOverpassQuery(b: BBox, selectors: string[], limit = 500): string {
  const box = `${b.latMin},${b.lngMin},${b.latMax},${b.lngMax}`;
  const sel = selectors.length ? selectors.filter((s) => /^[a-z_]+=[a-z_]+$/.test(s)) : KEYS.map((k) => `${k}`);
  const parts = sel.flatMap((s) => {
    const f = s.includes("=") ? `["${s.split("=")[0]}"="${s.split("=")[1]}"]` : `["${s}"]`;
    return [`nwr${f}["name"](${box});`];
  });
  return `[out:json][timeout:25];(${parts.join("")});out center tags ${limit};`;
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
      source: "osm", sourceId: `${e.type}/${e.id}`, name: t.name,
      altNames: [t.alt_name, t.official_name, t.brand].filter(Boolean),
      category: cat, lat, lng,
      street: t["addr:street"], number: t["addr:housenumber"], neighborhood: t["addr:suburb"], city: t["addr:city"], state: t["addr:state"], cep: t["addr:postcode"],
      address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ") || undefined,
      phones, emails: [t.email, t["contact:email"]].filter(Boolean),
      website: t.website ?? t["contact:website"],
      whatsapp: t["contact:whatsapp"] ? [t["contact:whatsapp"]] : [],
      socials: { instagram: t["contact:instagram"], facebook: t["contact:facebook"] },
      openingHours: t.opening_hours,
    });
  }
  return out;
}

export async function searchOverpass(b: BBox, selectors: string[], fetchImpl: typeof fetch = fetch): Promise<RawRecord[]> {
  const body = "data=" + encodeURIComponent(buildOverpassQuery(b, selectors));
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AlliarCRM/1.0" }, body });
      if (r.ok) return parseOverpass(await r.json());
      lastErr = new Error(`overpass ${r.status}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error("overpass_failed");
}
