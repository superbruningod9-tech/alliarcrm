import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  bboxFromCircle, bboxFromPolygon, expandNiches, runQuadtree, searchOverpass, mergeRecords, lookupCnpj,
  parseBulkList, pointInPolygon, isSafePublicUrl, type MasterLead, type RawRecord,
} from "./discovery";
import { crawlSite } from "./discovery/crawler";

const latlng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const areaInput = z.object({
  niches: z.array(z.string().trim().min(2).max(80)).min(1).max(5),
  expand: z.boolean().default(true),
  area: z.discriminatedUnion("type", [
    z.object({ type: z.literal("circle"), center: latlng, radiusKm: z.number().min(0.2).max(30) }),
    z.object({ type: z.literal("polygon"), points: z.array(latlng).min(3).max(200) }),
    z.object({ type: z.literal("bbox"), latMin: z.number(), lngMin: z.number(), latMax: z.number(), lngMax: z.number() }),
  ]),
  enrich: z.boolean().default(true),
});

/** Limite de enriquecimento por chamada (funções serverless têm tempo curto). */
const MAX_ENRICH = 8;

async function enrich(records: RawRecord[]): Promise<RawRecord[]> {
  const extra: RawRecord[] = [];
  const withSite = records.filter((r) => r.website && isSafePublicUrl(r.website)).slice(0, MAX_ENRICH);
  await Promise.all(withSite.map(async (r) => {
    try {
      const { record, diagnosis } = await crawlSite(r.website!);
      r.siteDiagnosis = diagnosis;
      if (record.source) extra.push({ ...(record as RawRecord), name: r.name, lat: r.lat, lng: r.lng, siteDiagnosis: diagnosis });
      const cnpj = record.cnpj;
      if (cnpj) { const f = await lookupCnpj(cnpj); if (f) extra.push({ source: "receita", name: f.nomeFantasia || f.razaoSocial || r.name, cnpj, fiscal: f, website: r.website }); }
    } catch { /* ignora falha de um site */ }
  }));
  for (const r of records) if (!r.website) r.siteDiagnosis = { hasSite: false };
  return [...records, ...extra];
}

export const discoverArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => areaInput.parse(input))
  .handler(async ({ data }): Promise<{ leads: MasterLead[]; terms: string[]; stats: { cells: number; truncated: boolean; raw: number }; error: string | null }> => {
    const niche = data.expand ? expandNiches(data.niches) : { label: data.niches.join(", "), synonyms: data.niches, osm: [] as string[] };
    const poly = data.area.type === "polygon" ? data.area.points : null;
    const bbox = data.area.type === "circle" ? bboxFromCircle(data.area.center, data.area.radiusKm)
      : data.area.type === "polygon" ? bboxFromPolygon(data.area.points) : data.area;
    if (Math.abs(bbox.latMax - bbox.latMin) > 1 || Math.abs(bbox.lngMax - bbox.lngMin) > 1) return { leads: [], terms: niche.synonyms, stats: { cells: 0, truncated: false, raw: 0 }, error: "Área grande demais (máx. ~100 km). Reduza o raio/polígono." };
    if (!niche.osm.length) return { leads: [], terms: niche.synonyms, stats: { cells: 0, truncated: false, raw: 0 }, error: "Nicho sem mapeamento OSM conhecido. Use o worker do Google Maps ou escolha um nicho comum (clínica, pet shop, oficina, academia...)." };

    try {
      const { items, stats } = await runQuadtree<RawRecord>(
        bbox,
        async (cell) => { const items = await searchOverpass(cell, niche.osm); return { count: items.length, items }; },
        (r) => r.sourceId ?? `${r.name}|${r.lat}|${r.lng}`,
        { saturation: 450, maxDepth: 2, maxCells: 8, concurrency: 1 },
      );
      let raw = items.filter((r) => !poly || r.lat == null || r.lng == null || pointInPolygon({ lat: r.lat, lng: r.lng }, poly));
      raw = raw.slice(0, 120);
      const all = data.enrich ? await enrich(raw) : raw;
      const leads = mergeRecords(all).sort((a, b) => b.score - a.score);
      return { leads, terms: niche.synonyms, stats: { cells: stats.cellsSearched, truncated: stats.truncated, raw: raw.length }, error: null };
    } catch (e) {
      return { leads: [], terms: niche.synonyms, stats: { cells: 0, truncated: false, raw: 0 }, error: "Falha ao consultar o OpenStreetMap. Tente novamente em instantes." };
    }
  });

const bulkInput = z.object({ text: z.string().max(60_000) });
export const discoverBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkInput.parse(input))
  .handler(async ({ data }): Promise<{ leads: MasterLead[]; pendingNames: string[]; error: string | null }> => {
    const entries = parseBulkList(data.text, 60);
    const recs: RawRecord[] = [];
    const pendingNames: string[] = [];
    await Promise.all(entries.map(async (e) => {
      if (e.kind === "cnpj") {
        const f = await lookupCnpj(e.raw);
        if (f) recs.push({ source: "receita", name: f.nomeFantasia || f.razaoSocial || e.raw, cnpj: f.cnpj, fiscal: f, city: undefined });
      } else if (e.kind === "domain") {
        const { record, diagnosis } = await crawlSite(e.raw);
        recs.push({ ...(record as RawRecord), source: "site", name: e.raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!, website: record.website ?? e.raw, siteDiagnosis: diagnosis });
        if (record.cnpj) { const f = await lookupCnpj(record.cnpj); if (f) recs.push({ source: "receita", name: f.nomeFantasia || f.razaoSocial || e.raw, cnpj: f.cnpj, fiscal: f, website: record.website }); }
      } else pendingNames.push(e.raw);
    }));
    return { leads: mergeRecords(recs).sort((a, b) => b.score - a.score), pendingNames, error: null };
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
      const row = {
        tenant_id: data.tenantId, user_id: context.userId, merge_key: String(raw.key).slice(0, 300), name: String(raw.name).slice(0, 300),
        category: raw.category ?? null, categories: raw.categories ?? [], address: raw.address ?? null, neighborhood: raw.neighborhood ?? null,
        city: raw.city ?? null, state: raw.state ?? null, cep: raw.cep ?? null, lat: raw.lat ?? null, lng: raw.lng ?? null,
        website: raw.website ?? null, rating: raw.rating ?? null, reviews_count: raw.reviewsCount ?? null, claimed: raw.claimed ?? null,
        photos_count: raw.photosCount ?? null, opening_hours: raw.openingHours ?? null, sources: raw.sources ?? [],
        field_sources: raw.fieldSources ?? {}, triggers: raw.triggers ?? [], score: Math.round(raw.score ?? 0), updated_at: new Date().toISOString(),
      };
      const { data: b, error } = await sb.from("crm_businesses").upsert(row, { onConflict: "tenant_id,merge_key" }).select("id").single();
      if (error || !b) return { saved, error: error?.message?.includes("does not exist") ? "Tabelas do motor ainda não existem. Aplique docs/sql/2026-motor-descoberta.sql no Supabase." : "Não foi possível salvar." };
      const contacts = [
        ...(raw.phones ?? []).map((p) => ({ kind: "phone", value: p.e164, label: p.type, whatsapp: p.whatsappLikely, sources: p.sources, confirmed: p.confirmed })),
        ...(raw.emails ?? []).map((e) => ({ kind: "email", value: e.value, label: null, whatsapp: false, sources: e.sources, confirmed: e.sources.length > 1 })),
        ...Object.entries(raw.socials ?? {}).map(([k, v]) => ({ kind: "social", value: String(v).slice(0, 500), label: k, whatsapp: false, sources: ["site"], confirmed: false })),
      ].map((c) => ({ ...c, tenant_id: data.tenantId, business_id: b.id }));
      if (contacts.length) await sb.from("lead_contacts").upsert(contacts, { onConflict: "business_id,kind,value" });
      if (raw.fiscal || raw.siteDiagnosis) {
        const f = raw.fiscal;
        await sb.from("lead_company_profiles").upsert({
          business_id: b.id, tenant_id: data.tenantId, cnpj: raw.cnpj ?? null, razao_social: f?.razaoSocial ?? null, nome_fantasia: f?.nomeFantasia ?? null,
          situacao: f?.situacao ?? null, abertura: f?.abertura ?? null, porte: f?.porte ?? null, capital_social: f?.capitalSocial ?? null,
          cnae_principal: f?.cnaePrincipal ?? null, cnaes_secundarios: f?.cnaesSecundarios ?? [], socios: f?.socios ?? [], site_diagnosis: raw.siteDiagnosis ?? {},
        }, { onConflict: "business_id" });
      }
      if (raw.reviews?.length) {
        await sb.from("lead_reviews").delete().eq("business_id", b.id);
        await sb.from("lead_reviews").insert(raw.reviews.slice(0, 30).map((r) => ({ tenant_id: data.tenantId, business_id: b.id, rating: r.rating, text: String(r.text).slice(0, 2000), reviewed_at: r.date ?? null })));
      }
      saved++;
    }
    return { saved, error: null };
  });
