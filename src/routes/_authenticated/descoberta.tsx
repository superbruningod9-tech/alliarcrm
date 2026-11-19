import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Radar, MapPin, ListPlus, Loader2, MessageCircle, Phone, Mail, Globe, Download, Sparkles } from "lucide-react";
import { seo } from "@/lib/seo";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AreaMap, type AreaShape, type DrawMode } from "@/components/alliar/AreaMap";
import { discoverArea, discoverBulk, saveDiscoveredLeads } from "@/lib/discovery.functions";
import { expandNiches } from "@/lib/discovery/synonyms";
import type { MasterLead } from "@/lib/discovery/types";

export const Route = createFileRoute("/_authenticated/descoberta")({
  head: () => seo("Motor de Descoberta · Alliar CRM", "Encontre empresas por mapa, lista ou domínio, cruze fontes gratuitas e envie leads completos ao funil."),
  component: DiscoveryPage,
});

const CITIES: Record<string, { lat: number; lng: number }> = {
  "Porto Alegre": { lat: -30.0346, lng: -51.2177 }, "São Paulo": { lat: -23.5505, lng: -46.6333 }, "Rio de Janeiro": { lat: -22.9068, lng: -43.1729 },
  "Belo Horizonte": { lat: -19.9167, lng: -43.9345 }, Curitiba: { lat: -25.4284, lng: -49.2733 }, Brasília: { lat: -15.7939, lng: -47.8828 },
  Salvador: { lat: -12.9777, lng: -38.5016 }, Fortaleza: { lat: -3.7319, lng: -38.5267 }, Recife: { lat: -8.0476, lng: -34.877 }, Goiânia: { lat: -16.6869, lng: -49.2648 },
};

type Tab = "map" | "bulk";

function DiscoveryPage() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("map");
  const [city, setCity] = useState("Porto Alegre");
  const [mode, setMode] = useState<DrawMode>("circle");
  const [shape, setShape] = useState<AreaShape>(null);
  const [niche, setNiche] = useState("");
  const [expand, setExpand] = useState(true);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [leads, setLeads] = useState<MasterLead[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const terms = niche.trim() ? expandNiches([niche]).synonyms : [];

  async function runArea() {
    if (!niche.trim()) return toast.error("Informe um nicho");
    const area = shape ?? { type: "circle" as const, center: CITIES[city]!, radiusKm: 3 };
    setBusy(true); setNote(null);
    try {
      const r = await discoverArea({ data: { niches: niche.split(",").map((s) => s.trim()).filter(Boolean), expand, area: area as never, enrich: true } });
      if (r.error) { toast.error(r.error); setNote(r.error); }
      setLeads(r.leads); setSel(new Set());
      if (!r.error) setNote(`${r.leads.length} empresa(s) consolidadas de ${r.stats.raw} registros em ${r.stats.cells} célula(s)${r.stats.truncated ? " (busca truncada: reduza a área)" : ""}.`);
    } catch { toast.error("Falha na busca. Tente novamente."); } finally { setBusy(false); }
  }
  async function runBulk() {
    if (!bulk.trim()) return toast.error("Cole ao menos uma linha");
    setBusy(true); setNote(null);
    try {
      const r = await discoverBulk({ data: { text: bulk } });
      setLeads(r.leads); setPending(r.pendingNames); setSel(new Set());
      setNote(`${r.leads.length} resolvido(s) por CNPJ/site. ${r.pendingNames.length} nome(s) dependem do worker do Google Maps.`);
    } catch { toast.error("Falha ao processar a lista."); } finally { setBusy(false); }
  }

  const chosen = leads.filter((l) => sel.has(l.key));
  async function save() {
    if (!app.tenantId || !chosen.length) return;
    setBusy(true);
    try {
      const r = await saveDiscoveredLeads({ data: { tenantId: app.tenantId, leads: chosen as never } });
      if (r.error) toast.error(r.error); else toast.success(`${r.saved} lead(s) salvos no seu espaço`);
    } catch { toast.error("Não foi possível salvar."); } finally { setBusy(false); }
  }
  async function toPipeline() {
    let ok = 0;
    for (const l of chosen) {
      const phone = l.phones.find((p) => p.whatsappLikely) ?? l.phones[0];
      try {
        await app.addLead({ name: l.name, company: l.name, phone: phone?.e164 ?? "", email: l.emails[0]?.value ?? "", value: 2500 },
          l.fiscal ? { cnpj: l.cnpj ?? "", razao_social: l.fiscal.razaoSocial ?? l.name, cnae: l.fiscal.cnaePrincipal ? `${l.fiscal.cnaePrincipal.code} ${l.fiscal.cnaePrincipal.description}` : "", endereco: l.address ?? "", socios: l.fiscal.socios ?? [] } : undefined);
        ok++;
      } catch { /* segue */ }
    }
    toast[ok ? "success" : "error"](ok ? `${ok} lead(s) enviados ao funil` : "Não foi possível enviar ao funil (verifique telefone/e-mail dos leads)");
  }
  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
    const rows = [["Nome", "Telefones", "E-mails", "Site", "CNPJ", "Score", "Gatilhos"], ...leads.map((l) => [l.name, l.phones.map((p) => p.e164).join(" | "), l.emails.map((e) => e.value).join(" | "), l.website, l.cnpj, l.score, l.triggers.join(" | ")])];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "leads-descoberta.csv" }).click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Motor de Descoberta" sub="Mapa, lista ou domínios → fusão de fontes gratuitas → leads prontos para o CRM" />
      <div className="flex gap-2">
        {([["map", "Por área no mapa", MapPin], ["bulk", "Lista em lote", ListPlus]] as const).map(([k, label, Icon]) => (
          <Button key={k} variant={tab === k ? "default" : "outline"} size="sm" onClick={() => setTab(k)}><Icon className="mr-1.5 h-4 w-4" />{label}</Button>
        ))}
      </div>

      {tab === "map" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <AreaMap center={CITIES[city]!} mode={mode} shape={shape} onShape={setShape}
            markers={leads.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng!, label: l.name }))} />
          <div className="space-y-3">
            <label className="block text-xs font-medium">Cidade
              <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={city} onChange={(e) => { setCity(e.target.value); setShape(null); }}>
                {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <div className="flex gap-1">
              {([["pan", "Mover"], ["circle", "Raio"], ["polygon", "Polígono"]] as const).map(([m, l]) => (
                <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{l}</Button>
              ))}
            </div>
            <label className="block text-xs font-medium">Nicho(s), separados por vírgula
              <Input className="mt-1" value={niche} maxLength={200} onChange={(e) => setNiche(e.target.value)} placeholder="clínica odontológica, pet shop" />
            </label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={expand} onChange={(e) => setExpand(e.target.checked)} />Expandir sinônimos automaticamente</label>
            {expand && terms.length > 1 && <div className="flex flex-wrap gap-1">{terms.map((t) => <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]">{t}</span>)}</div>}
            <Button className="w-full" onClick={runArea} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}Descobrir leads</Button>
            <p className="text-[11px] text-muted-foreground">Sem área desenhada, usa raio de 3 km no centro da cidade. Fontes: OpenStreetMap, sites das empresas e Receita (via CNPJ do site).</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea className="min-h-40 w-full rounded-xl border bg-background p-3 text-sm" maxLength={60000} value={bulk} onChange={(e) => setBulk(e.target.value)}
            placeholder={"Uma linha por item: CNPJ, site ou nome da empresa\n11.222.333/0001-81\nwww.empresa.com.br\nPadaria do Zé"} />
          <Button onClick={runBulk} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Processar lista</Button>
          {pending.length > 0 && <p className="text-xs text-muted-foreground">Nomes sem CNPJ/site ({pending.length}) precisam do worker do Google Maps: {pending.slice(0, 5).join(", ")}{pending.length > 5 ? "…" : ""}</p>}
        </div>
      )}

      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      {leads.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSel(sel.size === leads.length ? new Set() : new Set(leads.map((l) => l.key)))}>{sel.size === leads.length ? "Desmarcar" : "Selecionar"} todos</Button>
            <Button size="sm" disabled={!chosen.length || busy} onClick={toPipeline}>Enviar {chosen.length} ao funil</Button>
            <Button size="sm" variant="outline" disabled={!chosen.length || busy} onClick={save}>Salvar ficha completa</Button>
            <Button size="sm" variant="ghost" onClick={csv}><Download className="mr-1.5 h-4 w-4" />CSV</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {leads.map((l) => (
              <div key={l.key} className={`rounded-xl border bg-card p-4 shadow-sm transition ${sel.has(l.key) ? "ring-2 ring-primary" : ""}`}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={sel.has(l.key)} onChange={() => setSel((s) => { const n = new Set(s); n.has(l.key) ? n.delete(l.key) : n.add(l.key); return n; })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><h3 className="truncate font-semibold">{l.name}</h3><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold">{l.score}</span></div>
                    <p className="truncate text-xs text-muted-foreground">{l.category ?? l.categories[0] ?? "—"}{l.address ? ` · ${l.address}` : ""}</p>
                  </div>
                </label>
                <div className="mt-2 space-y-1 text-xs">
                  {l.phones.slice(0, 3).map((p) => <div key={p.e164} className="flex items-center gap-1.5">{p.whatsappLikely ? <MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Phone className="h-3.5 w-3.5" />}{p.national}{p.confirmed && <span className="text-emerald-600">· confirmado</span>}</div>)}
                  {l.emails[0] && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{l.emails[0].value}</div>}
                  {l.website && <div className="flex items-center gap-1.5 truncate"><Globe className="h-3.5 w-3.5" />{l.website}</div>}
                  {l.cnpj && <div className="text-muted-foreground">CNPJ {l.cnpj}{l.fiscal?.porte ? ` · ${l.fiscal.porte}` : ""}</div>}
                </div>
                {l.triggers.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{l.triggers.slice(0, 4).map((t) => <span key={t} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-700 dark:text-amber-400">{t}</span>)}</div>}
                <p className="mt-2 text-[10.5px] text-muted-foreground">Fontes: {l.sources.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
