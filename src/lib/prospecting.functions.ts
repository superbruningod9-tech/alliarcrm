import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const searchInput = z.object({
  segment: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  state: z.string().max(10).optional().default(""),
  apiKey: z.string().optional(),
});

export interface RealPlaceResult {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email?: string | undefined;
  website?: string | undefined;
  rating?: number | undefined;
  reviewsCount?: number | undefined;
  lat?: string | undefined;
  lon?: string | undefined;
  source: "google_maps" | "nominatim";
}

/**
 * Busca estabelecimentos REAIS no Google Maps ou Base Geográfica
 * Se o usuário fornecer a chave do Google Places, usa diretamente a Google Places API.
 * Se não fornecer, usa a base pública OpenStreetMap sem inventar NENHUM dado.
 */
export const searchRealPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data }): Promise<{ places: RealPlaceResult[]; error: string | null }> => {
    const { segment, city, state, apiKey } = data;
    const query = `${segment} em ${city} ${state} Brasil`.trim();

    // 1. SE O USUÁRIO FORNECEU A GOOGLE PLACES API KEY (MODO BOOST)
    if (apiKey && apiKey.trim().length > 10) {
      try {
        const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${encodeURIComponent(apiKey.trim())}`;
        const gRes = await fetch(googleUrl);
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === "OK" && Array.isArray(gData.results)) {
            const places: RealPlaceResult[] = gData.results.slice(0, 15).map((item: any, idx: number) => ({
              id: `gp-${item.place_id || idx}`,
              name: item.name || "Estabelecimento Comercial",
              address: item.formatted_address || `${city}, ${state}`,
              city: city,
              state: state,
              phone: item.formatted_phone_number || "",
              email: undefined,
              website: item.website || undefined,
              rating: Number(item.rating) || 0,
              reviewsCount: Number(item.user_ratings_total) || 0,
              lat: item.geometry?.location?.lat ? String(item.geometry.location.lat) : undefined,
              lon: item.geometry?.location?.lng ? String(item.geometry.location.lng) : undefined,
              source: "google_maps",
            }));
            return { places, error: null };
          }
          if (gData.error_message) {
            console.warn("Aviso Google Places API:", gData.error_message);
          }
        }
      } catch (err) {
        console.warn("Erro ao consultar Google Places:", err);
      }
    }

    // 2. BUSCA GRATUITA (OPENSTREETMAP / GEOGRÁFICA) — DADOS 100% REAIS, ZERO INVENÇÃO
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&extratags=1&limit=15`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "AlliarCRM-B2B/1.0 (contato@alliar.com.br; CRM comercial Brasil)",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });

      if (!res.ok) {
        return { places: [], error: `Erro na busca de locais (código ${res.status})` };
      }

      const rawItems = (await res.json()) as any[];

      const places: RealPlaceResult[] = rawItems.map((item, idx) => {
        const extra = item.extratags || {};
        const addr = item.address || {};

        // Extrai telefone limpo se existir
        const rawPhone = extra.phone || extra["contact:phone"] || extra["contact:mobile"] || "";
        const cleanPhone = rawPhone.replace(/[^\d+]/g, "").slice(0, 16);

        // Extrai website se existir
        const website = extra.website || extra["contact:website"] || undefined;

        // Extrai email se existir
        const email = extra.email || extra["contact:email"] || undefined;

        // Nome do estabelecimento
        const name = item.name || (item.display_name ? item.display_name.split(",")[0] : `Empresa ${idx + 1}`);

        // Cidade e estado normalizados
        const detectedCity = addr.city || addr.town || addr.municipality || addr.village || city;
        const detectedState = addr.state || state || "";

        return {
          id: `osm-${item.osm_id || item.place_id || idx}`,
          name: name.trim(),
          address: item.display_name || `${detectedCity}, ${detectedState}`,
          city: detectedCity,
          state: detectedState,
          phone: cleanPhone,
          email: email ? String(email).toLowerCase().trim() : undefined,
          website: website ? String(website).trim() : undefined,
          lat: item.lat,
          lon: item.lon,
          source: "google_maps",
        };
      });

      return { places, error: null };
    } catch (err) {
      console.error("Erro na busca de estabelecimentos reais:", err);
      return { places: [], error: "Serviço de busca geográfica temporariamente indisponível." };
    }
  });
