import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Radar, MapPin, ListPlus, Loader2, MessageCircle, Phone, Mail, Globe,
  Download, Sparkles, Building2, UserCheck, ShieldCheck, Zap, Info, Compass, Layers, CheckCircle2,
  ArrowUpDown, Target, TrendingUp
} from "lucide-react";
import { seo } from "@/lib/seo";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AreaMap, type AreaShape, type DrawMode } from "@/components/alliar/AreaMap";
import { discoverArea, discoverBulk, saveDiscoveredLeads, enrichLeadSingle } from "@/lib/discovery.functions";
import { expandNiches } from "@/lib/discovery/synonyms";
import { sortLeads, type SortMode } from "@/lib/discovery/scoring";
import type { MasterLead, Cell } from "@/lib/discovery/types";

export const Route = createFileRoute("/_authenticated/descoberta")({
  head: () => seo("Motor de Descoberta · Alliar CRM", "Encontre empresas reais por mapa, nicho ou lista, com enriquecimento e envio direto ao funil."),
  component: DiscoveryPage,
});

const CITIES: Record<string, { lat: number; lng: number }> = {
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

type Tab = "map" | "bulk";

function DiscoveryPage() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("map");
  const [city, setCity] = useState("Porto Alegre");
  const [radiusKm, setRadiusKm] = useState(15);
  const [mode, setMode] = useState<DrawMode>("circle");
  const [shape, setShape] = useState<AreaShape>(null);
  const [niche, setNiche] = useState("");
  const [expand, setExpand] = useState(true);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [enrichingBatch, setEnrichingBatch] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");
  const [leads, setLeads] = useState<MasterLead[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [enterpriseFilter, setEnterpriseFilter] = useState<
    "todas" | "redes" | "independentes" | "matrizes" | "filiais" | "grandes" | "pmes"
  >("todas");
  const [sortMode, setSortMode] = useState<SortMode>("recomendada");
  const [relatedCategories, setRelatedCategories] = useState<string[]>([]);
  const [cnaes, setCnaes] = useState<string[]>([]);
  const [cursor, setCursor] = useState<{
    pendingCells: Cell[];
    completedCellIds: string[];
    hasMore: boolean;
  } | null>(null);
  const [searchStats, setSearchStats] = useState<{
    cells?: number;
    cellsPending?: number;
    cellsCompleted?: number;
    raw?: number;
    unique?: number;
    duplicatesIgnored?: number;
    sources?: {
      googlePlaces: number;
      osm: number;
      web: number;
      receita: number;
    };
    hasGoogleKey?: boolean;
  } | null>(null);

  const nicheProfile = niche.trim() ? expandNiches([niche]) : null;
  const terms = nicheProfile ? nicheProfile.synonyms : [];
  const quickRelated = nicheProfile?.relatedCategories || relatedCategories;

  const filterCounts = useMemo(() => {
    return {
      todas: leads.length,
      redes: leads.filter((l) => l.isNetwork || l.companyType === "filial").length,
      independentes: leads.filter((l) => l.companyType === "independente").length,
      matrizes: leads.filter((l) => l.companyType === "matriz").length,
      filiais: leads.filter((l) => l.companyType === "filial").length,
      grandes: leads.filter((l) => l.sizeCategory === "grande").length,
      pmes: leads.filter((l) => l.sizeCategory === "pme").length,
    };
  }, [leads]);

  const displayedLeads = useMemo(() => {
    let filtered = leads;
    if (enterpriseFilter === "redes") filtered = leads.filter((l) => l.isNetwork || l.companyType === "filial");
    else if (enterpriseFilter === "independentes") filtered = leads.filter((l) => l.companyType === "independente");
    else if (enterpriseFilter === "matrizes") filtered = leads.filter((l) => l.companyType === "matriz");
    else if (enterpriseFilter === "filiais") filtered = leads.filter((l) => l.companyType === "filial");
    else if (enterpriseFilter === "grandes") filtered = leads.filter((l) => l.sizeCategory === "grande");
    else if (enterpriseFilter === "pmes") filtered = leads.filter((l) => l.sizeCategory === "pme");

    return sortLeads(filtered, sortMode);
  }, [leads, enterpriseFilter, sortMode]);

  async function runArea(isContinue = false) {
    if (!niche.trim()) return toast.error("Informe um nicho ou segmento");
    const area = shape ?? { type: "circle" as const, center: CITIES[city]!, radiusKm };

    if (isContinue) {
      setContinuing(true);
    } else {
      setBusy(true);
      setNote(null);
    }

    try {
      const r = await discoverArea({
        data: {
          niches: niche.split(",").map((s) => s.trim()).filter(Boolean),
          expand,
          area: area as never,
          enrich: false,
          city,
          cursor: isContinue && cursor ? {
            pendingCells: cursor.pendingCells,
            completedCellIds: cursor.completedCellIds,
          } : undefined,
        },
      });

      if (r.error && !isContinue) {
        toast.error(r.error);
        setNote(r.error);
      }

      if (isContinue) {
        setLeads((prev) => {
          const combined = [...prev, ...r.leads];
          const seen = new Set<string>();
          const out: MasterLead[] = [];
          for (const l of combined) {
            if (!seen.has(l.key)) {
              seen.add(l.key);
              out.push(l);
            }
          }
          return out;
        });
        toast.success(`Mais ${r.leads.length} empresa(s) carregadas da varredura contínua!`);
      } else {
        setLeads(r.leads);
        setSel(new Set());
      }

      setSearchStats(r.stats);
      setCursor(r.cursor || null);
      if (r.relatedCategories) setRelatedCategories(r.relatedCategories);
      if (r.cnaes) setCnaes(r.cnaes);

      if (!r.error) {
        setNote(
          `${isContinue ? "Varredura contínua atualizada: " : ""}${isContinue ? leads.length + r.leads.length : r.leads.length} empresa(s) consolidadas em ${city}.`
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha na busca. Tente novamente.");
    } finally {
      setBusy(false);
      setContinuing(false);
    }
  }

  async function runBulk() {
    if (!bulk.trim()) return toast.error("Cole ao menos uma linha");
    setBusy(true);
    setNote(null);
    try {
      const r = await discoverBulk({ data: { text: bulk, city } });
      setLeads(r.leads);
      setPending(r.pendingNames);
      setSel(new Set());
      setNote(`${r.leads.length} empresa(s) localizadas.`);
    } catch {
      toast.error("Falha ao processar a lista.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = leads.filter((l) => sel.has(l.key));

  // Enriquecimento em lote sequencial com 1s de intervalo
  async function runBatchEnrich() {
    if (!chosen.length) return toast.info("Selecione empresas para enriquecer");
    setEnrichingBatch(true);
    let success = 0;

    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i]!;
      setEnrichProgress(`Enriquecendo ${i + 1} de ${chosen.length}: ${item.name}...`);
      try {
        const enrichedData = await enrichLeadSingle({
          data: {
            key: item.key,
            name: item.name,
            website: item.website,
            cnpj: item.cnpj,
            city: item.city || city,
          },
        });

        if (enrichedData) {
          setLeads((prev) =>
            prev.map((lead) => {
              if (lead.key !== item.key) return lead;
              const phones = [...lead.phones];
              if (enrichedData.phones?.length) {
                enrichedData.phones.forEach((p: string) => {
                  const clean = p.replace(/\D/g, "");
                  if (!phones.some((existing) => existing.e164.includes(clean))) {
                    phones.push({
                      e164: clean.startsWith("55") ? `+${clean}` : `+55${clean}`,
                      national: p,
                      ddd: clean.slice(clean.startsWith("55") ? 2 : 0, 4),
                      type: clean.length > 10 ? "mobile" : "landline",
                      whatsappLikely: clean.length > 10,
                      sources: ["receita"],
                      confirmed: true,
                    });
                  }
                });
              }

              return {
                ...lead,
                phones,
                website: enrichedData.website || lead.website,
                socials: { ...lead.socials, ...enrichedData.socials },
                fiscal: enrichedData.fiscal || lead.fiscal,
                siteDiagnosis: enrichedData.siteDiagnosis || lead.siteDiagnosis,
              };
            })
          );
          success++;
        }
      } catch (err) {
        console.warn(`Falha ao enriquecer ${item.name}`, err);
      }
      // 1 segundo de intervalo para respeitar APIs gratuitas
      if (i < chosen.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    setEnrichingBatch(false);
    setEnrichProgress("");
    toast.success(`${success} empresa(s) enriquecidas com sucesso!`);
  }

  async function save() {
    if (!app.tenantId || !chosen.length) return;
    setBusy(true);
    try {
      const r = await saveDiscoveredLeads({ data: { tenantId: app.tenantId, leads: chosen as never } });
      if (r.error) toast.error(r.error);
      else toast.success(`${r.saved} lead(s) salvos no seu espaço`);
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function toPipeline() {
    let ok = 0;
    const existingPhones = new Set(app.leads.map((l) => (l.phone || "").replace(/\D/g, "").slice(-8)));
    const existingCnpjs = new Set(app.leads.map((l) => (l.cnpj || "").replace(/\D/g, "")).filter(Boolean));

    for (const l of chosen) {
      const cleanCnpj = (l.cnpj || "").replace(/\D/g, "");
      const phone = l.phones.find((p) => p.whatsappLikely) ?? l.phones[0];
      const cleanPhone = (phone?.e164 || "").replace(/\D/g, "").slice(-8);

      // Deduplicação automática por CNPJ ou Telefone normalizado
      if (cleanCnpj && existingCnpjs.has(cleanCnpj)) continue;
      if (cleanPhone && existingPhones.has(cleanPhone)) continue;

      try {
        await app.addLead(
          {
            name: l.name,
            company: l.name,
            phone: phone?.e164 ?? "",
            email: l.emails[0]?.value ?? "",
            value: 2500,
          },
          l.fiscal
            ? {
                cnpj: l.cnpj ?? "",
                razao_social: l.fiscal.razaoSocial ?? l.name,
                cnae: l.fiscal.cnaePrincipal ? `${l.fiscal.cnaePrincipal.code} ${l.fiscal.cnaePrincipal.description}` : "",
                endereco: l.address ?? "",
                socios: l.fiscal.socios ?? [],
              }
            : undefined
        );
        if (cleanCnpj) existingCnpjs.add(cleanCnpj);
        if (cleanPhone) existingPhones.add(cleanPhone);
        ok++;
      } catch {}
    }
    toast[ok ? "success" : "info"](
      ok ? `${ok} lead(s) novos enviados ao funil (duplicados ignorados)` : "Todos os leads selecionados já constam no funil!"
    );
  }

  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
    const rows = [
      ["Nome", "Telefones", "E-mails", "Site", "CNPJ", "Porte", "Capital Social", "Score"],
      ...leads.map((l) => [
        l.name,
        l.phones.map((p) => p.e164).join(" | "),
        l.emails.map((e) => e.value).join(" | "),
        l.website || "",
        l.cnpj || "",
        l.fiscal?.porte || "",
        l.fiscal?.capitalSocial ? String(l.fiscal.capitalSocial) : "",
        l.score,
      ]),
    ];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "leads-descoberta.csv" }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Motor de Descoberta B2B"
        sub="Busca síncrona real por cidade e nicho (OpenStreetMap, Nominatim, Receita Federal e Google Places)."
      />

      <div className="flex gap-2">
        {([["map", "Por área no mapa", MapPin], ["bulk", "Lista em lote", ListPlus]] as const).map(([k, label, Icon]) => (
          <Button key={k} variant={tab === k ? "default" : "outline"} size="sm" onClick={() => setTab(k)}>
            <Icon className="mr-1.5 h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {tab === "map" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <AreaMap
            center={CITIES[city]!}
            mode={mode}
            shape={shape}
            onShape={setShape}
            markers={leads.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng!, label: l.name }))}
          />

          <div className="space-y-3.5 bg-card p-4 rounded-xl border">
            <label className="block text-xs font-semibold text-foreground">
              Cidade / Município
              <select
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setShape(null);
                }}
              >
                {Object.keys(CITIES).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-foreground">
              Raio de busca (ao redor do centro)
              <select
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
              >
                <option value={5}>5 km (Bairros Centrais)</option>
                <option value={15}>15 km (Grande parte da cidade)</option>
                <option value={30}>30 km (Região Metropolitana)</option>
                <option value={50}>50 km (Macrorregião)</option>
              </select>
            </label>

            <div className="flex gap-1.5">
              {([["pan", "Mover"], ["circle", "Raio"], ["polygon", "Polígono"]] as const).map(([m, l]) => (
                <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
                  {l}
                </Button>
              ))}
            </div>

            <label className="block text-xs font-semibold text-foreground">
              Nicho ou segmento de mercado
              <Input
                className="mt-1"
                value={niche}
                maxLength={200}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Ex: pet shop, clínica, restaurante, oficina..."
              />
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={expand} onChange={(e) => setExpand(e.target.checked)} />
              <span>Expandir sinônimos e palavras-chave automaticamente</span>
            </label>

            {expand && terms.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {terms.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary font-medium">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {quickRelated && quickRelated.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3 text-primary" />
                  <span>Categorias e vertentes relacionadas:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {quickRelated.slice(0, 4).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNiche(cat)}
                      className="rounded-md bg-secondary/80 hover:bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground font-medium transition cursor-pointer"
                      title="Explorar esta categoria relacionada separada"
                    >
                      + {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full h-10 font-bold" onClick={() => runArea(false)} disabled={busy || continuing}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
              {busy ? "Buscando estabelecimentos..." : "Descobrir leads reais"}
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Consulta gratuita e direta a dados reais do OpenStreetMap e Receita Federal.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            className="min-h-40 w-full rounded-xl border bg-background p-3 text-sm"
            maxLength={60000}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"Cole CNPJs, sites ou nomes de empresas (um por linha):\n11.222.333/0001-81\nwww.empresa.com.br\nPadaria Porto Alegre"}
          />
          <Button onClick={runBulk} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Processar lista de forma síncrona
          </Button>
          {pending.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Itens não localizados ({pending.length}): {pending.slice(0, 5).join(", ")}
            </p>
          )}
        </div>
      )}

      {note && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground font-medium">
          {note}
        </div>
      )}

      {searchStats && (
        <div className="space-y-2.5 p-3.5 rounded-xl border bg-card/60 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Varredura: {leads.length} empresas consolidadas</span>
              {searchStats.duplicatesIgnored != null && searchStats.duplicatesIgnored > 0 && (
                <span className="text-muted-foreground font-normal">
                  ({searchStats.duplicatesIgnored} duplicações mescladas)
                </span>
              )}
            </div>
            {searchStats.cellsPending != null && (
              <div className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium">
                  {searchStats.cellsCompleted || searchStats.cells} regiões varridas
                </span>
                {searchStats.cellsPending > 0 ? (
                  <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 rounded-full font-medium">
                    {searchStats.cellsPending} quadrantes na fila
                  </span>
                ) : (
                  <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-medium">
                    100% da área concluída
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="font-semibold text-muted-foreground mr-1">Fontes consultadas:</span>
            {searchStats.sources && searchStats.sources.googlePlaces > 0 && (
              <Badge variant="outline" className="gap-1.5 border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium">
                <Sparkles className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                Google Places: {searchStats.sources.googlePlaces}
              </Badge>
            )}
            {searchStats.sources && searchStats.sources.osm > 0 && (
              <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Mapa / OSM: {searchStats.sources.osm}
              </Badge>
            )}
            {searchStats.sources && searchStats.sources.web > 0 && (
              <Badge variant="outline" className="gap-1.5 border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium">
                <Globe className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                Presença Web: {searchStats.sources.web}
              </Badge>
            )}
            {searchStats.sources && searchStats.sources.receita > 0 && (
              <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                <Building2 className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                Receita Federal: {searchStats.sources.receita}
              </Badge>
            )}
          </div>
        </div>
      )}

      {searchStats && !searchStats.hasGoogleKey && (
        <div className="flex items-center justify-between rounded-xl border border-muted bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span>
              <strong>Modo Gratuito Ativo:</strong> Exibindo dados públicos do OpenStreetMap e Web. Para turbinar com avaliações e telefones diretos do Google Maps, conecte sua chave.
            </span>
          </div>
          <Link to="/integracoes" className="font-semibold text-primary underline ml-2 shrink-0 hover:opacity-80">
            Configurar Google Places
          </Link>
        </div>
      )}

      {enrichProgress && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 font-semibold animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          {enrichProgress}
        </div>
      )}

      {leads.length > 0 && (
        <div className="space-y-3.5">
          {/* Ações em lote e continuidade */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSel(sel.size === displayedLeads.length ? new Set() : new Set(displayedLeads.map((l) => l.key)))
              }
            >
              {sel.size === displayedLeads.length ? "Desmarcar todos" : "Selecionar todos"}
            </Button>

            {cursor?.hasMore && (
              <Button
                size="sm"
                variant="outline"
                disabled={continuing || busy}
                onClick={() => runArea(true)}
                className="gap-2 border-primary/40 bg-primary/10 text-primary font-bold hover:bg-primary/20"
              >
                {continuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4 text-primary" />}
                Continuar varredura ({cursor.pendingCells.length} quadrantes pendentes)
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              disabled={!chosen.length || enrichingBatch}
              onClick={runBatchEnrich}
              className="gap-1.5 font-semibold"
            >
              {enrichingBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
              Completar dados grátis em lote ({chosen.length})
            </Button>

            <Button size="sm" disabled={!chosen.length || busy} onClick={toPipeline} className="font-semibold">
              Enviar {chosen.length} ao funil
            </Button>

            <Button size="sm" variant="outline" disabled={!chosen.length || busy} onClick={save}>
              Salvar ficha completa
            </Button>

            <Button size="sm" variant="ghost" onClick={csv}>
              <Download className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
          </div>

          {/* Barra de Filtros Empresariais e Ordenação Estratégica */}
          <div className="flex flex-col gap-2.5 p-3 rounded-xl border bg-card/60 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Filtro empresarial:</span>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("todas")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "todas"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Todas ({filterCounts.todas})
                </button>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("redes")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "redes"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Redes e franquias ({filterCounts.redes})
                </button>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("independentes")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "independentes"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Empresas independentes ({filterCounts.independentes})
                </button>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("matrizes")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "matrizes"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Matrizes ({filterCounts.matrizes})
                </button>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("filiais")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "filiais"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Filiais ({filterCounts.filiais})
                </button>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("grandes")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "grandes"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Grandes ({filterCounts.grandes})
                </button>
                <button
                  type="button"
                  onClick={() => setEnterpriseFilter("pmes")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    enterpriseFilter === "pmes"
                      ? "bg-teal-600 text-white shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  PMEs ({filterCounts.pmes})
                </button>
              </div>

              {/* Seletor de Ordenação */}
              <div className="flex items-center gap-1.5 shrink-0">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Ordenar:</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  aria-label="Critério de ordenação de resultados"
                  className="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                >
                  <option value="recomendada">Recomendada (Relevância + Potencial + Diversidade)</option>
                  <option value="relevancia">Mais relevantes para o nicho</option>
                  <option value="potencial">Maior potencial comercial Alliar</option>
                  <option value="porte">Maiores empresas</option>
                  <option value="redes">Redes e franquias</option>
                  <option value="independentes">Empresas independentes</option>
                  <option value="completude">Mais informações disponíveis</option>
                  <option value="recentes">Mais recentes descobertas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {displayedLeads.map((l) => {
              const mainPhone = l.phones.find((p) => p.whatsappLikely) ?? l.phones[0];
              const phoneDigits = (mainPhone?.e164 || "").replace(/\D/g, "");
              const isSelected = sel.has(l.key);

              return (
                <div
                  key={l.key}
                  className={`rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md flex flex-col justify-between ${
                    isSelected ? "ring-2 ring-primary border-primary" : ""
                  }`}
                >
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary"
                        checked={isSelected}
                        onChange={() =>
                          setSel((s) => {
                            const n = new Set(s);
                            n.has(l.key) ? n.delete(l.key) : n.add(l.key);
                            return n;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-bold text-sm text-foreground">
                              {l.displayName || l.name}
                            </h3>
                            {l.brandName && l.unitName && (
                              <p className="text-[11px] text-muted-foreground truncate font-medium mt-0.5">
                                Marca: <span className="text-foreground font-semibold">{l.brandName}</span> · {l.unitName}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="truncate text-xs text-muted-foreground mt-1">
                          {l.category ?? l.categories[0] ?? "Comércio/Serviço"}
                          {l.neighborhood ? ` · Bairro ${l.neighborhood}` : ""}
                          {l.city ? ` · ${l.city}` : ""}
                          {l.address && !l.neighborhood ? ` · ${l.address}` : ""}
                        </p>
                      </div>
                    </label>

                    {/* Pontuações Separadas: Relevância de Nicho e Potencial Comercial Alliar */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t">
                      <span
                        className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/25 px-2 py-0.5 text-[11px] font-bold flex items-center gap-1"
                        title="Aderência real ao segmento pesquisado (sem penalizar pequenas empresas)"
                      >
                        <Target className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        Relevância: {l.relevanceScore ?? 80}%
                      </span>
                      <span
                        className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 px-2 py-0.5 text-[11px] font-bold flex items-center gap-1"
                        title="Oportunidade para serviços da Alliar (Sites, Tráfego, Google Maps, WhatsApp)"
                      >
                        <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        Potencial Alliar: {l.commercialScore ?? 75}%
                      </span>
                    </div>

                    {/* Transparência e Motivos Objetivos de Cada Score */}
                    <div className="mt-2.5 space-y-1.5 text-xs">
                      {/* Motivos da Relevância */}
                      {l.relevanceReasons && l.relevanceReasons.length > 0 && (
                        <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/20 p-2 border border-blue-100 dark:border-blue-900/30">
                          <div className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1 text-[11px]">
                            <Target className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span>Por que é relevante:</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-blue-800 dark:text-blue-200 leading-tight">
                            {l.relevanceReasons[0]}
                          </p>
                        </div>
                      )}

                      {/* Oportunidades Concretas Alliar */}
                      {l.serviceOpportunities && l.serviceOpportunities.length > 0 && (
                        <div className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 p-2 border border-amber-100 dark:border-amber-900/30">
                          <div className="font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1 text-[11px]">
                            <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                            <span>Oportunidades Alliar detectadas:</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {l.serviceOpportunities.slice(0, 2).map((opp, idx) => (
                              <span key={idx} className="rounded bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                ✓ {opp}
                              </span>
                            ))}
                          </div>
                          {l.commercialReasons && l.commercialReasons.length > 0 && (
                            <p className="mt-1 text-[10.5px] text-amber-800/80 dark:text-amber-300/80 leading-tight">
                              {l.commercialReasons[0]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Informações de contato reais */}
                    <div className="mt-3 space-y-1.5 text-xs border-t pt-2.5">
                      {mainPhone && (
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={`tel:${mainPhone.e164}`}
                            className="flex items-center gap-1.5 text-foreground hover:underline font-medium"
                          >
                            <Phone className="h-3.5 w-3.5 text-primary" />
                            {mainPhone.national || mainPhone.e164}
                          </a>
                          {phoneDigits.length >= 10 && (
                            <a
                              href={`https://wa.me/${phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full hover:bg-emerald-100"
                            >
                              <MessageCircle className="h-3 w-3" />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      )}

                      {l.emails[0] && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <a href={`mailto:${l.emails[0].value}`} className="truncate hover:underline text-muted-foreground">
                            {l.emails[0].value}
                          </a>
                        </div>
                      )}

                      {l.website && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <a href={l.website} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 underline">
                            {l.website.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      )}

                      {l.cnpj && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">CNPJ {l.cnpj}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Badges de Identidade Empresarial e Qualificação Real */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t">
                    {l.isNetwork ? (
                      <span className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Rede ({l.networkUnitsCount || 1} un. na busca)
                      </span>
                    ) : l.companyType === "independente" ? (
                      <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Independente
                      </span>
                    ) : null}

                    {l.companyType === "matriz" && (
                      <span className="rounded-md bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 text-[10.5px] font-bold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        Matriz {l.cnpjBranch ? `(${l.cnpjBranch})` : ""}
                      </span>
                    )}

                    {l.companyType === "filial" && (
                      <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        Filial {l.cnpjBranch ? `(${l.cnpjBranch})` : ""}
                      </span>
                    )}

                    {l.sizeCategory && (
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {l.sizeCategory === "grande" ? "Grande Empresa" : "PME"}
                      </span>
                    )}

                    {l.fiscal?.porte && (
                      <span className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {l.fiscal.porte}
                      </span>
                    )}

                    {l.fiscal?.capitalSocial != null && l.fiscal.capitalSocial > 0 && (
                      <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Cap. {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(l.fiscal.capitalSocial)}
                      </span>
                    )}

                    {l.fiscal?.socios?.[0] && (
                      <span className="rounded-md bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 text-[10.5px] font-medium text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        {l.fiscal.socios[0].nome.split(" ")[0]}
                      </span>
                    )}

                    {l.siteDiagnosis?.hasAnalytics && (
                      <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 text-[10.5px] font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Meta/GTM
                      </span>
                    )}

                    {l.siteDiagnosis?.hasWhatsappLink && (
                      <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Widget WhatsApp
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
