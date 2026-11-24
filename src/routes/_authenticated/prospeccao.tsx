import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Search,
  MapPin,
  Phone,
  Mail,
  Globe,
  Star,
  Building2,
  Users,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ArrowRight,
  Filter,
  Download,
  RefreshCw,
  Zap,
  Map,
  Trophy,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  PlusCircle,
  Hash,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { loadUserApiKeys, saveUserApiKeys, type UserApiKeys } from "@/lib/api-keys";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  searchB2BProspects,
  searchCnpjReal,
  importProspectToPipeline,
  getSearchHistory,
  type ProspectCompany,
} from "@/lib/prospecting";

import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { DiscoveryPage } from "@/routes/_authenticated/descoberta";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  head: () =>
    seo(
      "Prospecção Ativa B2B · Alliar CRM",
      "Busque empresas reais pelo Google Maps e por CNPJ — importe direto para o funil com dados verificados da Receita Federal."
    ),
  component: ProspeccaoPage,
});

function ProspeccaoPage() {
  // Reuse the Discovery engine as the central flow.
  // This page now simply renders the Discovery UI, sharing the same backend functions,
  // history and lead IDs. No duplicated state or tables are created.
  return <DiscoveryPage />;
}
 = createFileRoute("/_authenticated/prospeccao")({
  head: () =>
    seo(
      "Prospecção Ativa B2B · Alliar CRM",
      "Busque empresas reais pelo Google Maps e por CNPJ — importe direto para o funil com dados verificados da Receita Federal."
    ),
  component: ProspeccaoPage,
});

const SEGMENTS = [
  "Clínica Médica", "Clínica Odontológica", "Farmácia", "Laboratório",
  "Academia / Fitness", "Escola / Curso", "Advocacia / Jurídico",
  "Contabilidade", "Imobiliária", "Construtora / Engenharia",
  "Restaurante / Alimentação", "Comércio Varejista", "Indústria",
  "Tecnologia / Software", "Consultoria Empresarial", "Clínica de Estética",
  "Veterinária", "Supermercado / Mercado", "Transporte / Logística", "Outro",
];

const STATES_BR = [
  "SP", "RJ", "MG", "RS", "PR", "SC", "BA", "GO", "PE", "CE",
  "MA", "DF", "MT", "MS", "PA", "AM", "ES", "RN", "AL", "PB",
  "PI", "SE", "RO", "TO", "AC", "AP", "RR",
];

const POPULAR_CITIES: Record<string, string[]> = {
  SP: ["São Paulo", "Campinas", "Ribeirão Preto", "Santo André", "Sorocaba", "São Bernardo do Campo"],
  RJ: ["Rio de Janeiro", "Niterói", "Nova Iguaçu", "Duque de Caxias", "Petrópolis"],
  MG: ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim"],
  RS: ["Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria"],
  PR: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel"],
  SC: ["Florianópolis", "Joinville", "Blumenau", "Chapecó", "Itajaí"],
};

function ProspectCard({
  company,
  onImport,
  onWhatsApp,
  importing,
}: {
  company: ProspectCompany;
  onImport: (c: ProspectCompany) => void;
  onWhatsApp: (c: ProspectCompany) => void;
  importing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const hasPhone = !!company.phone && company.phone.length >= 8;
  const hasEmail = !!company.email;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm transition-all hover:border-primary/40",
        company.imported && "border-emerald-500/40 bg-emerald-500/5"
      )}
    >
      {/* HEADER DO CARD */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground truncate">{company.name}</h3>
              {company.imported && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                  <CheckCircle2 className="size-3" /> Importada
                </span>
              )}
              {company.source === "cnpj_api" && (
                <span className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                  <CheckCircle2 className="size-3" /> Dados Verificados (Receita Federal)
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{company.razaoSocial}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {company.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3 shrink-0 text-primary" />
                  {company.city}{company.state ? `, ${company.state}` : ""}
                </span>
              )}
              {company.segment && (
                <span className="text-muted-foreground">{company.segment}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {hasPhone && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onWhatsApp(company)}
              className="h-8 gap-1 text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10"
            >
              <MessageCircle className="size-3.5" />
              WhatsApp
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onImport(company)}
            disabled={importing || company.imported}
            className={cn(
              "h-8 gap-1",
              company.imported
                ? "bg-emerald-600 text-white opacity-70 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {importing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : company.imported ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
            {company.imported ? "No funil" : "Importar"}
          </Button>
        </div>
      </div>

      {/* DADOS DE CONTATO */}
      <div className="flex flex-wrap gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        {hasPhone ? (
          <button
            onClick={() => copyToClipboard(company.phone, "Telefone")}
            className="flex items-center gap-1.5 hover:text-primary transition-colors"
            title="Clique para copiar"
          >
            <Phone className="size-3.5 text-blue-500 shrink-0" />
            <span className="font-mono font-semibold text-foreground">
              ({company.phone.slice(0, 2)}) {company.phone.slice(2, 7)}-{company.phone.slice(7)}
            </span>
            <Copy className="size-3 opacity-50" />
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground/60">
            <Phone className="size-3.5 shrink-0" />
            <span className="italic">Telefone não disponível</span>
          </span>
        )}
        {hasEmail ? (
          <span className="flex items-center gap-1.5">
            <Mail className="size-3.5 text-purple-500 shrink-0" />
            <span className="truncate max-w-[180px]">{company.email}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground/60">
            <Mail className="size-3.5 shrink-0" />
            <span className="italic">E-mail não disponível</span>
          </span>
        )}
        {company.website ? (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <Globe className="size-3.5 text-cyan-500 shrink-0" />
            <span className="truncate max-w-[140px]">{company.website.replace("https://", "")}</span>
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground/60">
            <Globe className="size-3.5 shrink-0" />
            <span className="italic">Site não disponível</span>
          </span>
        )}
      </div>

      {/* EXPANSÃO — CNPJ, ENDEREÇO, SÓCIOS */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span className="font-medium">CNPJ, Endereço e Sócios</span>
        {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div>
              <span className="font-semibold text-muted-foreground block">CNPJ</span>
              <span className="font-mono text-foreground">{company.cnpj || "Não disponível"}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground block">CNAE</span>
              <span className="text-foreground line-clamp-1">{company.cnae || "Não disponível"}</span>
            </div>
            <div className="col-span-2">
              <span className="font-semibold text-muted-foreground block">Endereço</span>
              <span className="text-foreground">{company.address || "Não disponível"}</span>
            </div>
          </div>

          {company.socios && company.socios.length > 0 ? (
            <div>
              <span className="font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                <Users className="size-3" /> Quadro Societário (Receita Federal)
              </span>
              <ul className="space-y-1">
                {company.socios.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-foreground">
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    <span>
                      <b>{s.nome}</b>
                      <span className="text-muted-foreground"> · {s.qualificacao}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-muted-foreground/60 italic">
              Quadro societário não disponível — consulte via CNPJ para dados completos.
            </div>
          )}

          <div className="pt-1 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                const query = encodeURIComponent(`${company.name} ${company.city}`);
                window.open(`https://www.google.com/maps/search/${query}`, "_blank");
              }}
            >
              <Map className="size-3.5 text-primary" />
              Ver no Google Maps
            </Button>
            {company.cnpj && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const cnpjClean = company.cnpj!.replace(/\D/g, "");
                  window.open(`https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp`, "_blank");
                }}
              >
                Consultar na Receita
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProspeccaoPage() {
  const { user } = useAuth();
  const app = useApp();

  const [userKeys, setUserKeys] = useState<UserApiKeys>({});
  const [boostModal, setBoostModal] = useState(false);
  const [inputGoogleKey, setInputGoogleKey] = useState("");
  const [inputApolloKey, setInputApolloKey] = useState("");
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    if (user?.id) {
      void loadUserApiKeys(user.id, app.tenantId ?? "").then((keys) => {
        setUserKeys(keys);
        setInputGoogleKey(keys.googlePlacesKey || "");
        setInputApolloKey(keys.apolloKey || "");
      });
    }
  }, [user?.id, app.tenantId]);

  const hasBoostKey = !!userKeys.googlePlacesKey?.trim() || !!userKeys.apolloKey?.trim();

  const handleSaveBoostKeys = async () => {
    if (!user?.id || !app.tenantId) return;
    setSavingKeys(true);
    try {
      const updated = await saveUserApiKeys(user.id, app.tenantId, {
        googlePlacesKey: inputGoogleKey.trim(),
        apolloKey: inputApolloKey.trim(),
      });
      setUserKeys(updated);
      setBoostModal(false);
      toast.success("Chaves de API do Boost salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar chaves.");
    } finally {
      setSavingKeys(false);
    }
  };

  const [segment, setSegment] = useState("");
  const [customSegment, setCustomSegment] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("SP");

  // Busca por CNPJ (aba principal)
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjResult, setCnpjResult] = useState<ProspectCompany | null>(null);
  const [cnpjError, setCnpjError] = useState("");

  // Resultados e estados
  const [results, setResults] = useState<ProspectCompany[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"google" | "cnpj">("cnpj");

  const citySuggestions = useMemo(() => POPULAR_CITIES[state] || [], [state]);
  const finalSegment = segment === "Outro" ? customSegment : segment;

  // Histórico real de buscas
  const realHistory = useMemo(() => getSearchHistory(app.tenantId ?? ""), [app.tenantId]);

  // === BUSCA POR CNPJ (DADOS REAIS DA RECEITA FEDERAL) ===
  const handleCnpjSearch = useCallback(async () => {
    const cnpjClean = cnpjInput.replace(/\D/g, "");
    if (cnpjClean.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos. Exemplo: 00.000.000/0000-00");
      return;
    }
    setCnpjLoading(true);
    setCnpjError("");
    setCnpjResult(null);
    try {
      const result = await searchCnpjReal(cnpjClean);
      if (result) {
        // Verifica se já foi importada
        const importedSet = (await import("@/lib/prospecting")).getImportedProspectIds(app.tenantId ?? "");
        result.imported = importedSet.has(result.id);
        setCnpjResult(result);
        toast.success(`✅ Empresa encontrada: ${result.name}`);
      } else {
        setCnpjError("CNPJ não encontrado na base da Receita Federal. Verifique se o número está correto.");
        toast.error("CNPJ não encontrado.");
      }
    } catch {
      setCnpjError("Erro ao consultar o CNPJ. Tente novamente em alguns segundos.");
      toast.error("Erro na consulta. Tente novamente.");
    } finally {
      setCnpjLoading(false);
    }
  }, [cnpjInput, app.tenantId]);

  // === BUSCA DE LOCAIS REAIS NO MAPA (COM OU SEM BOOST) ===
  const [mapSearching, setMapSearching] = useState(false);
  const [mapSearched, setMapSearched] = useState(false);

  const handleSearchPlaces = useCallback(async () => {
    if (!finalSegment.trim()) {
      toast.error("Selecione ou digite o segmento de empresas.");
      return;
    }
    if (!city.trim()) {
      toast.error("Informe a cidade para a busca.");
      return;
    }
    setMapSearching(true);
    setMapSearched(false);
    setResults([]);
    try {
      const places = await searchB2BProspects(
        { segment: finalSegment, city, state },
        app.tenantId ?? "",
        userKeys.googlePlacesKey
      );
      setResults(places);
      setMapSearched(true);
      if (places.length > 0) {
        const boostNote = userKeys.googlePlacesKey ? " (via Google Places API)" : "";
        toast.success(`${places.length} estabelecimentos reais encontrados em ${city}${boostNote}`);
      } else {
        toast.info(`Nenhum estabelecimento indexado para ${finalSegment} em ${city}. Use o botão "Abrir no Google Maps" para pesquisar.`);
      }
    } catch {
      toast.error("Erro na busca de locais. Tente novamente.");
    } finally {
      setMapSearching(false);
    }
  }, [finalSegment, city, state, app.tenantId, userKeys.googlePlacesKey]);

  // === ABRIR BUSCA NO GOOGLE MAPS (DADOS REAIS) ===
  const handleGoogleMapsSearch = useCallback(() => {
    if (!finalSegment.trim()) {
      toast.error("Selecione ou digite o segmento de empresas.");
      return;
    }
    if (!city.trim()) {
      toast.error("Informe a cidade para a busca.");
      return;
    }
    const query = encodeURIComponent(`${finalSegment} em ${city}, ${state}`);
    window.open(`https://www.google.com/maps/search/${query}`, "_blank");
    toast.success(`🗺️ Google Maps aberto com busca real: "${finalSegment}" em ${city}`);

    // Salva no histórico
    try {
      const historyKey = `alliar:prospect_history:${app.tenantId}`;
      const past = JSON.parse(localStorage.getItem(historyKey) || "[]");
      const updated = [{ segment: finalSegment, city, state, count: 0, at: new Date().toISOString() }, ...past].slice(0, 20);
      localStorage.setItem(historyKey, JSON.stringify(updated));
    } catch {}
  }, [finalSegment, city, state, app.tenantId]);

  // === IMPORTAR EMPRESA PARA O FUNIL ===
  const handleImport = useCallback(
    async (company: ProspectCompany) => {
      if (!app.tenantId) { toast.error("Selecione uma empresa antes de importar."); return; }
      setImportingId(company.id);
      try {
        await importProspectToPipeline({ tenantId: app.tenantId, prospect: company, addLeadFn: app.addLead });
        
        // Atualiza estado local
        if (cnpjResult?.id === company.id) {
          setCnpjResult({ ...company, imported: true });
        }
        setResults((prev) => prev.map((c) => (c.id === company.id ? { ...c, imported: true } : c)));
        setImportedCount((n) => n + 1);
        
        const phoneNote = company.phone ? "" : " (sem telefone cadastrado)";
        toast.success(`✅ "${company.name}" importada para o funil!${phoneNote}`, { duration: 5000 });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível importar. Tente novamente.");
      } finally {
        setImportingId(null);
      }
    },
    [app.tenantId, app.addLead, cnpjResult]
  );

  const handleWhatsApp = useCallback((company: ProspectCompany) => {
    const phone = company.phone?.replace(/\D/g, "");
    if (!phone || phone.length < 8) {
      toast.error("Esta empresa não possui telefone cadastrado. Busque o contato no Google Maps ou site da empresa.");
      return;
    }
    const contactName = company.socios?.[0]?.nome?.split(" ")[0] || "Olá";
    const msg = encodeURIComponent(
      `Olá ${contactName}! Tudo bem?\n\nEncontrei a ${company.name} e fiquei interessado em conversar sobre uma parceria comercial.\n\nPodemos falar 5 minutos esta semana?`
    );
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
    toast.success(`Abrindo WhatsApp com ${company.name}...`);
  }, []);

  const exportCSV = useCallback(() => {
    const allResults = cnpjResult ? [cnpjResult, ...results] : results;
    if (!allResults.length) { toast.error("Nenhum resultado para exportar."); return; }
    const header = "Nome,Razão Social,Segmento,Cidade,Estado,Telefone,E-mail,CNPJ,Endereço,Fonte";
    const rows = allResults.map((c) =>
      [`"${c.name}"`, `"${c.razaoSocial}"`, `"${c.segment}"`, c.city, c.state, c.phone || "Não disponível", c.email || "Não disponível", c.cnpj || "", `"${c.address}"`, c.source || "manual"].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospeccao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Lista exportada em CSV!");
  }, [results, cnpjResult]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      {/* CABEÇALHO */}
      <PageHeader
        title="Prospecção Ativa B2B"
        sub="Busque empresas reais por CNPJ (dados verificados da Receita Federal) ou pelo Google Maps — importe direto para o funil."
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBoostModal(true)}
            className={cn(
              "h-9 gap-1.5 rounded-xl font-semibold transition-all",
              hasBoostKey
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                : "border-border/80 hover:border-primary/40"
            )}
          >
            <Zap className={cn("size-3.5", hasBoostKey ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
            {hasBoostKey ? "Boost com API Ativo" : "Ativar Boost com API"}
          </Button>

          {importedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Trophy className="size-3.5" />
              {importedCount} importada{importedCount > 1 ? "s" : ""} hoje
            </div>
          )}
        </div>
      </PageHeader>

      {/* ABAS: CNPJ vs GOOGLE MAPS */}
      <div className="flex rounded-lg border p-1 w-fit bg-muted/30">
        <button
          onClick={() => setActiveTab("cnpj")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
            activeTab === "cnpj" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Hash className="size-4" />
          Busca por CNPJ
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">Dados Reais</span>
        </button>
        <button
          onClick={() => setActiveTab("google")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
            activeTab === "google" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Map className="size-4" />
          Google Maps
        </button>
      </div>

      {/* === ABA CNPJ === */}
      {activeTab === "cnpj" && (
        <section className="space-y-6">
          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <Hash className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Consultar Empresa por CNPJ</h2>
              <span className="ml-auto rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                100% Dados Reais · Receita Federal
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Digite o CNPJ da empresa que deseja prospectar. Os dados (razão social, endereço, sócios, telefone e CNAE) são obtidos diretamente
              da base pública da <b className="text-foreground">Receita Federal do Brasil</b> via BrasilAPI.
            </p>

            <div className="flex gap-3">
              <Input
                value={cnpjInput}
                onChange={(e) => {
                  // Máscara de CNPJ
                  let v = e.target.value.replace(/\D/g, "").slice(0, 14);
                  if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
                  else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
                  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
                  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,3})/, "$1.$2");
                  setCnpjInput(v);
                }}
                placeholder="00.000.000/0000-00"
                className="text-base font-mono max-w-xs"
                onKeyDown={(e) => { if (e.key === "Enter") handleCnpjSearch(); }}
              />
              <Button onClick={handleCnpjSearch} disabled={cnpjLoading} className="gap-2">
                {cnpjLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {cnpjLoading ? "Consultando..." : "Consultar CNPJ"}
              </Button>
            </div>

            {cnpjError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
                <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{cnpjError}</p>
              </div>
            )}
          </div>

          {/* RESULTADO DO CNPJ */}
          {cnpjResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="text-sm font-semibold">Empresa encontrada — dados verificados</span>
              </div>
              <ProspectCard
                company={cnpjResult}
                onImport={handleImport}
                onWhatsApp={handleWhatsApp}
                importing={importingId === cnpjResult.id}
              />
            </div>
          )}

          {/* DICAS */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="size-4 text-amber-500" /> Onde encontrar CNPJs?
              </h3>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-primary shrink-0" />
                  <span><b className="text-foreground">Google Maps:</b> busque o segmento na aba ao lado, encontre a empresa e pegue o CNPJ no site dela ou na nota fiscal</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-primary shrink-0" />
                  <span><b className="text-foreground">Instagram / Facebook:</b> muitas empresas colocam o CNPJ na bio ou rodapé</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-primary shrink-0" />
                  <span><b className="text-foreground">Site da empresa:</b> verifique o rodapé, termos de uso ou página "Sobre"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-primary shrink-0" />
                  <span><b className="text-foreground">Notas fiscais / boletos:</b> documentos comerciais sempre contêm o CNPJ</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="size-4 text-blue-500" /> O que você obtém?
              </h3>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Razão social e nome fantasia <b className="text-foreground">reais</b></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Endereço completo com CEP</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Telefone e e-mail (quando disponíveis na Receita)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Quadro societário com nomes e qualificações</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>CNAE (atividade econômica principal)</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* === ABA GOOGLE MAPS === */}
      {activeTab === "google" && (
        <section className="space-y-6">
          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <Map className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Buscar no Google Maps</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">Abre a busca real no Google Maps</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Selecione o segmento e a cidade. O sistema abre o <b className="text-foreground">Google Maps real</b> com sua busca.
              Encontre empresas, veja avaliações e dados de contato reais, copie o CNPJ e use a aba "Busca por CNPJ" para importar com dados completos.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* SEGMENTO */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Segmento de Negócio *</label>
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Selecione o segmento…</option>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {segment === "Outro" && (
                  <Input value={customSegment} onChange={(e) => setCustomSegment(e.target.value)} placeholder="Ex: Clínica de Fisioterapia" className="text-sm mt-1" />
                )}
              </div>

              {/* ESTADO */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Estado *</label>
                <select
                  value={state}
                  onChange={(e) => { setState(e.target.value); setCity(""); }}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {STATES_BR.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* CIDADE */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Cidade *</label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex: São Paulo, Campinas…"
                  className="text-sm"
                  list="city-suggestions"
                />
                <datalist id="city-suggestions">
                  {citySuggestions.map((c) => <option key={c} value={c} />)}
                </datalist>
                {citySuggestions.length > 0 && !city && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {citySuggestions.slice(0, 4).map((c) => (
                      <button key={c} onClick={() => setCity(c)} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted transition-colors">{c}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={handleSearchPlaces} disabled={mapSearching || !finalSegment || !city} size="lg" className="gap-2">
                {mapSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {mapSearching ? "Buscando estabelecimentos..." : "Buscar no Mapa & Listar"}
              </Button>
              <Button onClick={handleGoogleMapsSearch} disabled={!finalSegment || !city} variant="outline" size="lg" className="gap-2">
                <ExternalLink className="size-4" />
                Abrir no Google Maps
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A busca pesquisa estabelecimentos comerciais reais na cidade selecionada. Se a empresa não tiver telefone público cadastrado, o sistema indicará claramente <b className="text-foreground">"Telefone não disponível"</b> — zero dados inventados.
            </p>
          </div>

          {/* RESULTADOS DA BUSCA NO MAPA */}
          {mapSearched && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-sm font-semibold">
                    {results.length} estabelecimento{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""} em {city}
                  </span>
                </div>
                {results.length > 0 && (
                  <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 gap-1.5 text-xs">
                    <Download className="size-3.5" /> Exportar CSV
                  </Button>
                )}
              </div>

              {results.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
                  <AlertCircle className="size-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Nenhum estabelecimento indexado publicamente para {finalSegment} em {city}.</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Use o botão "Abrir no Google Maps" acima para pesquisar diretamente na base visual do Google Maps.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {results.map((company) => (
                    <ProspectCard
                      key={company.id}
                      company={company}
                      onImport={handleImport}
                      onWhatsApp={handleWhatsApp}
                      importing={importingId === company.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FLUXO DE IMPORTAÇÃO MANUAL */}
          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <PlusCircle className="size-4 text-primary" /> Importação Rápida (sem CNPJ)
            </h3>
            <p className="text-xs text-muted-foreground">
              Encontrou uma empresa no Google Maps mas não tem o CNPJ? Adicione como lead manualmente usando o botão "Novo Lead" no topo do sistema.
              Você pode preencher apenas nome, telefone e empresa. Os dados de CNPJ podem ser adicionados depois.
            </p>
          </div>

          {/* COMO FUNCIONA */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Map, title: "1. Busque no Google Maps", desc: "Selecione segmento e cidade. O Google Maps abre com empresas reais, avaliações e dados de contato verificados.", color: "text-blue-500", bg: "bg-blue-500/10" },
              { icon: Hash, title: "2. Copie o CNPJ", desc: "Encontre o CNPJ no site, redes sociais ou nota fiscal da empresa. Cole na aba 'Busca por CNPJ' para dados completos.", color: "text-purple-500", bg: "bg-purple-500/10" },
              { icon: ArrowRight, title: "3. Importe para o Funil", desc: "Com os dados reais da Receita Federal, importe para o funil com 1 clique. Sem dados inventados, apenas informações verificadas.", color: "text-emerald-500", bg: "bg-emerald-500/10" },
            ].map((step) => (
              <div key={step.title} className="rounded-xl border bg-card p-5 space-y-3">
                <div className={cn("grid size-10 place-items-center rounded-lg", step.bg)}>
                  <step.icon className={cn("size-5", step.color)} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{step.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* HISTÓRICO REAL DE BUSCAS */}
      {realHistory.length > 0 && (
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Suas buscas recentes</h3>
          <div className="flex flex-wrap gap-2">
            {realHistory.slice(0, 8).map((h, i) => (
              <button
                key={i}
                onClick={() => { setSegment(h.segment); setCity(h.city); if (h.state) setState(h.state); setActiveTab("google"); }}
                className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
              >
                {h.segment} · {h.city}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* EXPORT */}
      {(cnpjResult || results.length > 0) && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" /> Exportar resultados em CSV
          </Button>
        </div>
      )}

      {/* MODAL DO MODO BOOST COM API */}
      <Dialog open={boostModal} onOpenChange={setBoostModal}>
        <DialogContent className="max-w-lg rounded-2xl p-6">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <Zap className="size-4" />
              </div>
              <DialogTitle className="text-base font-bold">Modo Boost com API (Prospecção B2B)</DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Configure suas chaves para buscar estabelecimentos reais diretamente pelo Google Places e enriquecer decisores pelo Apollo.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-3 text-xs">
            {/* GOOGLE PLACES API */}
            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-blue-500" />
                  Google Places API Key
                </label>
                <a
                  href="https://console.cloud.google.com/google/maps-apis"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Pegar chave ($200/mês grátis) <ExternalLink className="size-3" />
                </a>
              </div>
              <Input
                type="password"
                value={inputGoogleKey}
                onChange={(e) => setInputGoogleKey(e.target.value)}
                placeholder="AIzaSy..."
                className="text-xs font-mono rounded-lg h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Permite buscar telefones reais, notas, sites e avaliações do Google Maps diretamente no CRM.
              </p>
            </div>

            {/* APOLLO.IO API */}
            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-purple-500" />
                  Apollo.io API Key
                </label>
                <a
                  href="https://app.apollo.io/#/settings/integrations/api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Pegar chave (Plano Free) <ExternalLink className="size-3" />
                </a>
              </div>
              <Input
                type="password"
                value={inputApolloKey}
                onChange={(e) => setInputApolloKey(e.target.value)}
                placeholder="apollo_api_..."
                className="text-xs font-mono rounded-lg h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Enriquece domínios com e-mails corporativos verificados e perfis de sócios e diretores.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-[11px] text-emerald-800 dark:text-emerald-300">
              💡 <b>Sem chave no momento?</b> A consulta por CNPJ da <b>Receita Federal (BrasilAPI)</b> já está 100% ativa, oficial e gratuita em todo o sistema.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setBoostModal(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button size="sm" disabled={savingKeys} onClick={handleSaveBoostKeys} className="rounded-xl gap-1.5 font-semibold">
                {savingKeys ? "Salvando..." : "Salvar Chaves do Boost"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
