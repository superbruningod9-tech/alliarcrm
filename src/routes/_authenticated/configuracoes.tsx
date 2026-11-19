import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  Copy,
  Trash2,
  User,
  Users,
  MessageSquare,
  Send,
  CheckCircle2,
  ShieldCheck,
  Building,
  Building2,
  Key,
  Bell,
  Palette,
  Sun,
  Moon,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Globe,
  Clock,
  ChevronDown,
  ChevronUp,
  Lock,
  Smartphone,
  Sparkles,
  Volume2,
  LogOut,
  Bot,
  MapPin,
  ExternalLink,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/lib/store";
import { THEME_PALETTES, type ColorPalette } from "@/lib/theme";
import { loadUserApiKeys, saveUserApiKeys, type UserApiKeys } from "@/lib/api-keys";
import { companySchema, inviteSchema } from "@/lib/crm-schemas";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/alliar/Shell";
import { CompanySetup } from "@/components/alliar/CompanySetup";
import { B2BSettings } from "@/components/alliar/B2BSettings";
import { WhatsAppSettings } from "@/components/alliar/WhatsAppSettings";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () =>
    seo(
      "Configurações · Alliar CRM",
      "Gerencie conta, onboarding, canais de atendimento, WhatsApp, equipe, segurança e aparência."
    ),
  component: SettingsPage,
});

function SettingsPage() {
  const app = useApp();
  const { user } = useAuth();
  const query = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"geral" | "canais" | "seguranca" | "aparencia">("geral");

  // Estado para segurança / alteração de senha
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Estados de notificações e preferências
  const [notifyNewLeads, setNotifyNewLeads] = useState(true);
  const [notifyAntiVacuo, setNotifyAntiVacuo] = useState(true);
  const [notifyProposalOpen, setNotifyProposalOpen] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);

  // Estado do acordeão da Zona de Perigo / Avançado
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  // Dados Cadastrais da Empresa Ativa
  const [activeCompanyName, setActiveCompanyName] = useState("");
  const [activeCompanyCnpj, setActiveCompanyCnpj] = useState("");
  const [activeCompanyAddress, setActiveCompanyAddress] = useState("");
  const [activeCompanySegment, setActiveCompanySegment] = useState("");
  const [activeCompanyRevenue, setActiveCompanyRevenue] = useState("");
  const [activeCompanyEmployees, setActiveCompanyEmployees] = useState("");
  const [activeCompanyUsers, setActiveCompanyUsers] = useState("");
  const [savingCompanyProfile, setSavingCompanyProfile] = useState(false);
  const [showNewCompanySetup, setShowNewCompanySetup] = useState(false);

  // Carrega os dados cadastrais da empresa ativa
  useEffect(() => {
    if (!app.tenantId) return;
    const currentTenant = app.tenants.find((t) => t.id === app.tenantId);
    if (currentTenant) {
      setActiveCompanyName(currentTenant.name || "");
    }
    // Carrega do cache local
    const local = localStorage.getItem(`alliar:company_profile:${app.tenantId}`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed.companyName && !currentTenant?.name) setActiveCompanyName(parsed.companyName);
        if (parsed.cnpjFormatted || parsed.cnpj) setActiveCompanyCnpj(parsed.cnpjFormatted || parsed.cnpj);
        if (parsed.address) setActiveCompanyAddress(parsed.address);
        if (parsed.segment) setActiveCompanySegment(parsed.segment);
        if (parsed.monthlyRevenue) setActiveCompanyRevenue(parsed.monthlyRevenue);
        if (parsed.totalEmployees) setActiveCompanyEmployees(String(parsed.totalEmployees));
        if (parsed.userCount) setActiveCompanyUsers(String(parsed.userCount));
      } catch {}
    }

    // Carrega do Supabase (prioriza company_profile, fallback para company_registration)
    void supabase
      .from("b2b_connections")
      .select("*")
      .eq("tenant_id", app.tenantId)
      .in("provider", ["company_registration", "company_profile"])
      .order("connected_at", { ascending: false })
      .then(({ data: rows }) => {
        if (!rows || rows.length === 0) return;
        // Prioriza company_profile sobre company_registration
        const profileRow = rows.find((r) => r.provider === "company_profile") || rows[0];
        if (profileRow?.key_ciphertext) {
          try {
            const p = JSON.parse(profileRow.key_ciphertext);
            if (p.companyName) setActiveCompanyName(p.companyName);
            if (p.cnpjFormatted || p.cnpj) setActiveCompanyCnpj(p.cnpjFormatted || p.cnpj);
            if (p.address) setActiveCompanyAddress(p.address);
            if (p.segment) setActiveCompanySegment(p.segment);
            if (p.monthlyRevenue) setActiveCompanyRevenue(p.monthlyRevenue);
            if (p.totalEmployees) setActiveCompanyEmployees(String(p.totalEmployees));
            if (p.userCount) setActiveCompanyUsers(String(p.userCount));
          } catch {}
        }
      });
  }, [app.tenantId, app.tenants]);

  function maskCnpjInput(val: string) {
    return val
      .replace(/\D/g, "")
      .slice(0, 14)
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  async function handleSaveCompanyProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!app.tenantId) {
      toast.error("Nenhuma empresa selecionada.");
      return;
    }
    if (!activeCompanyName.trim()) {
      toast.error("O nome da empresa é obrigatório.");
      return;
    }
    setSavingCompanyProfile(true);
    try {
      // 1. Atualiza na tabela tenants
      const { error: tErr } = await supabase
        .from("tenants")
        .update({ name: activeCompanyName.trim() })
        .eq("id", app.tenantId);
      if (tErr) console.warn("Aviso ao atualizar nome na tabela tenants:", tErr);

      // 2. Salva os dados completos na tabela b2b_connections
      const profileData = {
        companyName: activeCompanyName.trim(),
        cnpj: activeCompanyCnpj.replace(/\D/g, ""),
        cnpjFormatted: activeCompanyCnpj,
        address: activeCompanyAddress.trim(),
        segment: activeCompanySegment.trim(),
        monthlyRevenue: activeCompanyRevenue,
        totalEmployees: activeCompanyEmployees ? Number(activeCompanyEmployees) : null,
        userCount: activeCompanyUsers ? Number(activeCompanyUsers) : 1,
        updatedAt: new Date().toISOString(),
      };

      if (user?.id) {
        // Tenta atualizar registro existente primeiro
        const { data: existingProfile } = await supabase
          .from("b2b_connections")
          .select("*")
          .eq("tenant_id", app.tenantId)
          .eq("provider", "company_profile")
          .maybeSingle();

        if (existingProfile) {
          // Atualiza o registro existente
          await supabase
            .from("b2b_connections")
            .update({
              key_ciphertext: JSON.stringify(profileData),
              connected_at: new Date().toISOString(),
            })
            .eq("tenant_id", app.tenantId)
            .eq("provider", "company_profile");
        } else {
          // Insere novo registro
          await supabase.from("b2b_connections").insert({
            tenant_id: app.tenantId,
            user_id: user.id,
            provider: "company_profile",
            key_ciphertext: JSON.stringify(profileData),
            connected_at: new Date().toISOString(),
          });
        }
      }

      // 3. Salva no cache local permanente
      localStorage.setItem(`alliar:company_profile:${app.tenantId}`, JSON.stringify(profileData));

      await query.invalidateQueries({ queryKey: ["tenants"] });
      await app.refresh();
      toast.success("Dados cadastrais da empresa salvos com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar dados da empresa.");
    } finally {
      setSavingCompanyProfile(false);
    }
  }

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const invites = useQuery({
    queryKey: ["invitations", app.tenantId],
    enabled: !!app.tenantId && app.isAdmin,
    queryFn: async () => {
      if (!app.tenantId) return [];
      const { data, error } = await supabase
        .from("tenant_invitations")
        .select("*")
        .eq("tenant_id", app.tenantId)
        .is("accepted_at", null)
        .order("expires_at");
      if (error) {
        console.warn("Aviso ao carregar convites:", error);
        return [];
      }
      return data ?? [];
    },
  });

  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      toast.success("Configurações salvas com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  // Chaves de API (BYOK)
  const [googlePlacesKey, setGooglePlacesKey] = useState("");
  const [apolloKey, setApolloKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    if (user?.id) {
      void loadUserApiKeys(user.id, app.tenantId ?? "").then((keys) => {
        setGooglePlacesKey(keys.googlePlacesKey || "");
        setApolloKey(keys.apolloKey || "");
        setGeminiKey(keys.geminiKey || "");
        setOpenaiKey(keys.openaiKey || "");
        setGroqKey(keys.groqKey || "");
      });
    }
  }, [user?.id, app.tenantId]);

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error("Usuário não identificado.");
      return;
    }
    setSavingKeys(true);
    try {
      await saveUserApiKeys(user.id, app.tenantId ?? "", {
        googlePlacesKey: googlePlacesKey.trim(),
        apolloKey: apolloKey.trim(),
        geminiKey: geminiKey.trim(),
        openaiKey: openaiKey.trim(),
        groqKey: groqKey.trim(),
      });
      toast.success("Chaves de API salvas com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar chaves.");
    } finally {
      setSavingKeys(false);
    }
  };

  // Alterar senha
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas informadas não coincidem.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar senha.");
    } finally {
      setPasswordBusy(false);
    }
  };

  // Exportar backup completo dos dados em JSON
  const handleExportJSON = () => {
    const backupData = {
      tenantId: app.tenantId,
      exportedAt: new Date().toISOString(),
      userEmail: user?.email,
      leads: app.leads,
      members: app.members,
      commissionRate: app.commissionRate,
      pixKey: app.pixKey,
      structure: app.structure,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-alliar-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup completo em JSON exportado!");
  };

  // Exportar leads em CSV
  const handleExportCSV = () => {
    if (!app.leads.length) {
      toast.info("Nenhum lead para exportar no momento.");
      return;
    }
    const headers = "Nome,Empresa,Telefone,CNPJ,Valor,Estágio,Temperatura,Prioridade,Responsável,CriadoEm";
    const rows = app.leads.map((l) =>
      [`"${l.name}"`, `"${l.company}"`, l.phone, l.cnpj || "", l.value, l.stage, l.temp, l.priority, `"${l.owner}"`, l.createdAt].join(",")
    );
    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-alliar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Lista de leads exportada em CSV!");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <PageHeader
        title="Configurações do Sistema"
        sub="Gerencie sua conta, canais de atendimento, WhatsApp, equipe, segurança e preferências visuais."
      />

      {/* ABAS MODERNAS DE NAVEGAÇÃO */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto min-h-11 p-1.5 rounded-2xl bg-muted/60 border border-border/60 gap-1.5">
          <TabsTrigger value="geral" className="rounded-xl py-2 px-2 text-xs font-semibold gap-1.5 data-[state=active]:shadow-sm">
            <Building className="size-3.5 shrink-0" />
            <span className="truncate">Geral & Onboarding</span>
          </TabsTrigger>
          <TabsTrigger value="canais" className="rounded-xl py-2 px-2 text-xs font-semibold gap-1.5 data-[state=active]:shadow-sm">
            <Key className="size-3.5 shrink-0" />
            <span className="truncate">Canais & APIs</span>
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="rounded-xl py-2 px-2 text-xs font-semibold gap-1.5 data-[state=active]:shadow-sm">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="truncate">Segurança & Avisos</span>
          </TabsTrigger>
          <TabsTrigger value="aparencia" className="rounded-xl py-2 px-2 text-xs font-semibold gap-1.5 data-[state=active]:shadow-sm">
            <Palette className="size-3.5 shrink-0" />
            <span className="truncate">Aparência</span>
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* ABA 1: GERAL & CONTA / QUESTIONÁRIO DE PRIMEIRO ACESSO                   */}
        {/* ========================================================================= */}
        <TabsContent value="geral" className="space-y-6 focus-visible:outline-none">
          {/* IDENTIDADE DA CONTA */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="border-b pb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <User className="size-4 text-primary" /> Conta de Acesso
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Seus dados cadastrais de acesso à plataforma Alliar.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(async () => {
                    if (!user) return;
                    const name = companySchema.parse(f.get("name"));
                    const { error } = await supabase
                      .from("profiles")
                      .upsert({ id: user.id, display_name: name });
                    if (error) throw error;
                    await query.invalidateQueries({ queryKey: ["profile"] });
                    await app.refresh();
                  });
                }}
              >
                <label className="text-xs font-semibold text-muted-foreground">Nome de Exibição</label>
                <div className="flex gap-2">
                  <Input
                    name="name"
                    defaultValue={profile.data?.display_name || user?.user_metadata?.['display_name'] || user?.email?.split("@")[0] || ""}
                    maxLength={120}
                    required
                    className="rounded-xl text-sm"
                  />
                  <Button disabled={busy} size="sm" className="rounded-xl px-4 shrink-0">
                    Salvar
                  </Button>
                </div>
              </form>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">E-mail Principal</label>
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate text-foreground font-medium">{user?.email}</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 shrink-0">
                    Autenticado
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Globe className="size-3" /> Idioma do Sistema
                </label>
                <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="pt-BR">Português (Brasil)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" /> Fuso Horário Comercial
                </label>
                <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="America/Sao_Paulo">Horário de Brasília (GMT-3)</option>
                </select>
              </div>
            </div>
          </section>

          {/* FICHA CADASTRAL COMPLETA DA EMPRESA ATIVA */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  <h2 className="text-base font-semibold">Ficha Cadastral da Empresa</h2>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                    Dados Salvos e Persistentes
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Atualize o nome, CNPJ, endereço e parâmetros cadastrais da empresa ativa no CRM.
                </p>
              </div>

              {app.tenants.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Trocar empresa:</span>
                  <select
                    value={app.tenantId ?? ""}
                    onChange={(e) => app.switchTenant(e.target.value)}
                    className="h-8 rounded-lg border bg-background px-2 text-xs font-semibold"
                  >
                    {app.tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveCompanyProfile} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Nome da Empresa <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={activeCompanyName}
                    onChange={(e) => setActiveCompanyName(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="Ex: Minha Empresa Ltda"
                    className="rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    CNPJ (com máscara)
                  </label>
                  <Input
                    value={activeCompanyCnpj}
                    onChange={(e) => setActiveCompanyCnpj(maskCnpjInput(e.target.value))}
                    maxLength={18}
                    placeholder="00.000.000/0001-00"
                    className="rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Endereço Geral (Cidade, UF, Logradouro)
                  </label>
                  <Input
                    value={activeCompanyAddress}
                    onChange={(e) => setActiveCompanyAddress(e.target.value)}
                    maxLength={200}
                    placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP"
                    className="rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Segmento / Ramo de Atuação
                  </label>
                  <Input
                    value={activeCompanySegment}
                    onChange={(e) => setActiveCompanySegment(e.target.value)}
                    maxLength={120}
                    placeholder="Ex: Consultoria, Varejo, Saúde, TI..."
                    className="rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Faturamento Mensal
                  </label>
                  <select
                    value={activeCompanyRevenue}
                    onChange={(e) => setActiveCompanyRevenue(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Selecione...</option>
                    <option value="Até R$ 20.000">Até R$ 20 mil</option>
                    <option value="R$ 20.000 a R$ 50.000">R$ 20 mil – 50 mil</option>
                    <option value="R$ 50.000 a R$ 150.000">R$ 50 mil – 150 mil</option>
                    <option value="R$ 150.000 a R$ 500.000">R$ 150 mil – 500 mil</option>
                    <option value="Acima de R$ 500.000">Acima de R$ 500 mil</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Total de Funcionários
                  </label>
                  <Input
                    value={activeCompanyEmployees}
                    onChange={(e) => setActiveCompanyEmployees(e.target.value.replace(/\D/g, ""))}
                    type="number"
                    min={1}
                    placeholder="Ex: 15"
                    className="rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Usuários no CRM
                  </label>
                  <Input
                    value={activeCompanyUsers}
                    onChange={(e) => setActiveCompanyUsers(e.target.value.replace(/\D/g, ""))}
                    type="number"
                    min={1}
                    placeholder="Ex: 5"
                    className="rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={savingCompanyProfile || !activeCompanyName.trim()}
                  className="rounded-xl px-6 bg-[#C25E38] hover:bg-[#A84F2E] text-white font-bold"
                >
                  {savingCompanyProfile ? "Salvando Informações…" : "Salvar Dados Cadastrais da Empresa"}
                </Button>
              </div>
            </form>
          </section>

          {/* AUTOMAÇÕES OPCIONAIS DE VENDAS & WHATSAPP */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-base font-semibold">Automações de Vendas & WhatsApp (Opcionais)</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Por padrão, todas as automações vêm desabilitadas para garantir controle total. Ative apenas as regras que desejar utilizar na sua operação.
              </p>
            </div>

            <div className="space-y-4">
              {/* REGRA ANTI-VÁCUO */}
              <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-amber-500" />
                    <span className="text-sm font-semibold">Regra Anti-Vácuo de Atendimento (Round-Robin)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                      {app.automationSettings.antiVacuoEnabled ? "Ativada" : "Desativada"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Transfere automaticamente leads sem atendimento para o próximo vendedor após o limite estipulado.
                  </p>
                </div>
                <Switch
                  checked={app.automationSettings.antiVacuoEnabled}
                  onCheckedChange={(c) => {
                    app.updateAutomationSettings({ antiVacuoEnabled: c });
                    toast.success(c ? "Regra Anti-Vácuo ativada com sucesso!" : "Regra Anti-Vácuo desativada.");
                  }}
                />
              </div>

              {/* LEMBRETES DE REUNIÃO */}
              <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-blue-500" />
                    <span className="text-sm font-semibold">Lembretes Automáticos de Reunião</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                      {app.automationSettings.reminderEnabled ? "Ativado" : "Desativado"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Envia alerta e mensagem de lembrete com antecedência antes de reuniões agendadas com clientes.
                  </p>
                </div>
                <Switch
                  checked={app.automationSettings.reminderEnabled}
                  onCheckedChange={(c) => {
                    app.updateAutomationSettings({ reminderEnabled: c });
                    toast.success(c ? "Lembretes de reunião ativados!" : "Lembretes de reunião desativados.");
                  }}
                />
              </div>

              {/* MENSAGEM DE BOAS-VINDAS */}
              <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-500" />
                    <span className="text-sm font-semibold">Mensagem Automática de Boas-Vindas para Novos Leads</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                      {app.automationSettings.welcomeEnabled ? "Ativada" : "Desativada"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dispara saudação inicial padronizada assim que um novo lead entra no CRM.
                  </p>
                </div>
                <Switch
                  checked={app.automationSettings.welcomeEnabled}
                  onCheckedChange={(c) => {
                    app.updateAutomationSettings({ welcomeEnabled: c });
                    toast.success(c ? "Boas-vindas automáticas ativadas!" : "Boas-vindas automáticas desativadas.");
                  }}
                />
              </div>
            </div>
          </section>

          {/* QUESTIONÁRIO DE PRIMEIRO ACESSO / ONBOARDING (EDITÁVEL A QUALQUER MOMENTO) */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building className="size-4 text-primary" />
                  <h2 className="text-base font-semibold">Estrutura da Empresa (Onboarding)</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Editável
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Alterne entre Modo Solo e Modo Equipe ou ajuste os parâmetros comerciais definidos no onboarding inicial.
                </p>
              </div>

              {/* BARRA DE DIVISÃO SOLO VS EQUIPE */}
              <div className="flex rounded-xl border bg-muted/40 p-1 w-fit shrink-0">
                <button
                  type="button"
                  disabled={!app.isAdmin}
                  onClick={() => {
                    void app.set({ structure: "solo" });
                    toast.success("Modo Solo ativado com sucesso!");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                    app.structure === "solo"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <User className="size-3.5" />
                  Modo Solo
                </button>
                <button
                  type="button"
                  disabled={!app.isAdmin}
                  onClick={() => {
                    void app.set({ structure: "equipe" });
                    toast.success("Modo Equipe ativado com sucesso!");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                    app.structure === "equipe"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Users className="size-3.5" />
                  Modo Equipe
                </button>
              </div>
            </div>

            {/* EXPLICAÇÃO DO MODO ATIVO */}
            <div
              className={cn(
                "rounded-xl border p-4 text-xs space-y-1.5",
                app.structure === "solo"
                  ? "bg-blue-500/5 border-blue-500/20 text-blue-900 dark:text-blue-100"
                  : "bg-emerald-500/5 border-emerald-500/20 text-emerald-900 dark:text-emerald-100"
              )}
            >
              <div className="flex items-center gap-2 font-bold">
                {app.structure === "solo" ? (
                  <>
                    <User className="size-4 text-blue-600 dark:text-blue-400" />
                    <span>Modo Solo Selecionado</span>
                  </>
                ) : (
                  <>
                    <Users className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Modo Equipe Selecionado</span>
                  </>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {app.structure === "solo"
                  ? "Operação focada em vendedor autônomo. O menu lateral oculta a aba de Equipe para oferecer uma interface limpa e ágil."
                  : "Operação com multi-vendedores ativada! Você tem acesso ao ranking da equipe, metas de receita individuais e distribuição automática de novos leads (regra Anti-Vácuo de 5 minutos)."}
              </p>
            </div>

            {/* DADOS COMERCIAIS DA EMPRESA */}
            {app.isAdmin && (
              <form
                key={app.tenantId}
                className="grid gap-4 sm:grid-cols-2 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(async () => {
                    if (!app.tenantId) {
                      toast.error("Nenhuma empresa ativa selecionada.");
                      return;
                    }
                    const rate = Number(f.get("rate"));
                    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
                      throw Error("A comissão deve estar entre 0% e 100%");
                    const { error } = await supabase
                      .from("tenant_settings")
                      .upsert(
                        {
                          tenant_id: app.tenantId,
                          commission_rate: rate,
                          pix_key: String(f.get("pix") || ""),
                        },
                        { onConflict: "tenant_id" }
                      );
                    if (error) throw error;
                    await app.refresh();
                  });
                }}
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Comissão Padrão de Vendas (%)</label>
                  <Input
                    name="rate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={app.commissionRate}
                    required
                    className="rounded-xl text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Taxa aplicada automaticamente às novas vendas marcadas como ganho.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Chave PIX Oficial da Empresa</label>
                  <Input
                    name="pix"
                    defaultValue={app.pixKey}
                    maxLength={140}
                    placeholder="CNPJ, E-mail, Celular ou Chave Aleatória"
                    className="rounded-xl text-sm font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Utilizada nas cobranças de 1 clique e QR Codes de propostas comerciais.
                  </p>
                </div>

                <div className="sm:col-span-2 flex justify-end pt-2">
                  <Button disabled={busy} className="rounded-xl px-6">
                    Salvar Dados Comerciais
                  </Button>
                </div>
              </form>
            )}

            {/* CONVITE DE COLABORADORES (QUANDO EM MODO EQUIPE) */}
            {app.structure === "equipe" && app.isAdmin && (
              <div className="border-t pt-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="size-4 text-emerald-500" /> Convidar Colaboradores para a Equipe
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gere convites seguros por e-mail ou compartilhe o link diretamente pelo WhatsApp.
                  </p>
                </div>

                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(async () => {
                      const { error } = await supabase.from("tenant_invitations").insert({
                        tenant_id: app.tenantId ?? "",
                        email: inviteSchema.parse(f.get("email")),
                      });
                      if (error) throw error;
                      await query.invalidateQueries({ queryKey: ["invitations"] });
                    });
                  }}
                >
                  <Input
                    name="email"
                    type="email"
                    placeholder="email@colaborador.com"
                    required
                    maxLength={254}
                    className="max-w-sm rounded-xl text-sm"
                  />
                  <Button disabled={busy} className="rounded-xl gap-1.5">
                    <Send className="size-3.5" /> Criar Convite
                  </Button>
                </form>

                {invites.data && invites.data.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-semibold text-muted-foreground">Convites Pendentes:</span>
                    <div className="divide-y rounded-xl border bg-muted/20">
                      {invites.data.map((i) => {
                        const link = `${window.location.origin}/convite?token=${i.token}`;
                        return (
                          <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{i.email}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Válido até {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                                onClick={() => {
                                  const msg = encodeURIComponent(
                                    `Olá! Você foi convidado para a equipe comercial na Alliar. Acesse seu link exclusivo: ${link}`
                                  );
                                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                                }}
                              >
                                <MessageSquare className="size-3.5" /> WhatsApp
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg gap-1"
                                onClick={() => {
                                  void navigator.clipboard.writeText(link);
                                  toast.success("Link do convite copiado!");
                                }}
                              >
                                <Copy className="size-3.5" /> Copiar
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  action(async () => {
                                    const { error } = await supabase.from("tenant_invitations").delete().eq("id", i.id);
                                    if (error) throw error;
                                    await query.invalidateQueries({ queryKey: ["invitations"] });
                                  })
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* TROCA / CRIAÇÃO DE EMPRESA */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-3">Gerenciador de Empresas</h2>
            <CompanySetup />
          </section>
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 2: CANAIS DE ATENDIMENTO, WHATSAPP & CENTRAL DE APIS (BYOK)         */}
        {/* ========================================================================= */}
        <TabsContent value="canais" className="space-y-6 focus-visible:outline-none">
          {/* CENTRAL DE CHAVES DE API (BYOK - BRING YOUR OWN KEY) */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Key className="size-4 text-primary" />
                  <h2 className="text-base font-semibold">Central de APIs & Prospecção B2B (Bring Your Own Key)</h2>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    BYOK Ativo
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Conecte suas próprias chaves de API para Prospecção B2B (Google Places / Apollo), Inteligência Artificial (Gemini, OpenAI, Groq) e Copiloto de Vendas.
                </p>
              </div>
            </div>

            {/* SUGESTÕES INTELIGENTES PARA QUEM NÃO TEM API */}
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-sky-500" />
                <h3 className="text-xs font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wider">
                  Recomendações e Camadas Gratuitas (Comece sem custo)
                </h3>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border bg-background/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Bot className="size-3.5 text-primary" /> Google Gemini
                    </span>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                      Gratuito (Free Tier)
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    15 requisições por minuto gratuitas. Ideal para o Copiloto de Vendas e resumos de leads.
                  </p>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline pt-1"
                  >
                    Obter chave no Google AI Studio <ExternalLink className="size-3" />
                  </a>
                </div>

                <div className="rounded-lg border bg-background/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="size-3.5 text-amber-500" /> Groq Cloud
                    </span>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                      Rápida & Gratuita
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Velocidade extrema de inferência para respostas instantâneas do Copiloto comercial.
                  </p>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:underline pt-1"
                  >
                    Obter chave na Groq Cloud <ExternalLink className="size-3" />
                  </a>
                </div>

                <div className="rounded-lg border bg-background/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-rose-500" /> Google Places / Maps API
                    </span>
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                      US$ 200/mês Grátis
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Para o botão "Boost com API" na Prospecção B2B: busca estabelecimentos reais, telefone e endereço oficial.
                  </p>
                  <a
                    href="https://console.cloud.google.com/google/maps-apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline pt-1"
                  >
                    Console Google Cloud Maps <ExternalLink className="size-3" />
                  </a>
                </div>

                <div className="rounded-lg border bg-background/80 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Building className="size-3.5 text-purple-500" /> BrasilAPI & ReceitaWS
                    </span>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                      100% Gratuito
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Integrada nativamente no Alliar CRM. Consulta CNPJs oficiais sem necessidade de chave de API.
                  </p>
                  <span className="text-[11px] text-muted-foreground italic">Já ativa no sistema</span>
                </div>
              </div>
            </div>

            {/* FORMULÁRIO DE CHAVES */}
            <form onSubmit={handleSaveApiKeys} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-rose-500" /> Google Places API Key
                    </label>
                    <span className="text-[10px] text-muted-foreground">Para Boost B2B</span>
                  </div>
                  <Input
                    type="password"
                    placeholder="AIzaSy..."
                    value={googlePlacesKey}
                    onChange={(e) => setGooglePlacesKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Ativa a busca direta no Google Maps com dados e telefones reais de empresas locais.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Building className="size-3.5 text-sky-500" /> Apollo.io API Key
                    </label>
                    <span className="text-[10px] text-muted-foreground">Para Decisores B2B</span>
                  </div>
                  <Input
                    type="password"
                    placeholder="Chave de API Apollo"
                    value={apolloKey}
                    onChange={(e) => setApolloKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Enriquece empresas com contatos de diretores, e-mails corporativos e cargos de sócios.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Bot className="size-3.5 text-emerald-500" /> Google Gemini API Key
                    </label>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Gratuito
                    </span>
                  </div>
                  <Input
                    type="password"
                    placeholder="AIzaSy..."
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Alimenta o Copiloto IA de Vendas para sugerir mensagens de WhatsApp e analisar clientes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Zap className="size-3.5 text-amber-500" /> Groq Cloud API Key
                    </label>
                    <span className="text-[10px] text-muted-foreground">Ultra Rápido</span>
                  </div>
                  <Input
                    type="password"
                    placeholder="gsk_..."
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Alternativa ultrarrápida (Llama 3) para o assistente de IA.
                  </p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-indigo-500" /> OpenAI API Key (ChatGPT)
                    </label>
                    <span className="text-[10px] text-muted-foreground">Opcional</span>
                  </div>
                  <Input
                    type="password"
                    placeholder="sk-proj-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Para quem já possui créditos na OpenAI e prefere o GPT-4o no Copiloto.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="submit" disabled={savingKeys} className="rounded-xl px-6 gap-2">
                  <Key className="size-4" />
                  {savingKeys ? "Salvando Chaves..." : "Salvar Configurações de API"}
                </Button>
              </div>
            </form>
          </section>

          <WhatsAppSettings />
          <B2BSettings />
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 3: SEGURANÇA & AVISOS (COM TOGGLES MODERNOS)                         */}
        {/* ========================================================================= */}
        <TabsContent value="seguranca" className="space-y-6 focus-visible:outline-none">
          {/* ALTERAÇÃO DE SENHA */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="border-b pb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="size-4 text-primary" /> Alteração de Senha
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mantenha sua conta segura alterando sua senha periodicamente.
              </p>
            </div>

            <form onSubmit={handleUpdatePassword} className="max-w-md space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nova Senha</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className="rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Confirmar Nova Senha</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                  className="rounded-xl text-sm"
                />
              </div>

              <Button disabled={passwordBusy || !newPassword} className="rounded-xl">
                {passwordBusy ? "Atualizando..." : "Atualizar Senha"}
              </Button>
            </form>
          </section>

          {/* PREFERÊNCIAS DE NOTIFICAÇÕES (TOGGLES MODERNOS) */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="border-b pb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Bell className="size-4 text-primary" /> Preferências de Notificações & Avisos
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Defina como e quando o sistema deve emitir alertas para sua equipe.
              </p>
            </div>

            <div className="divide-y">
              <div className="flex items-center justify-between py-3.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Alertas de Novos Leads</p>
                  <p className="text-xs text-muted-foreground">
                    Exibe notificação imediata quando um novo contato entrar pelo formulário ou site.
                  </p>
                </div>
                <Switch
                  checked={notifyNewLeads}
                  onCheckedChange={(c) => {
                    setNotifyNewLeads(c);
                    toast.success(c ? "Notificações de novos leads ativadas" : "Notificações desativadas");
                  }}
                />
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Alerta Sonoro Anti-Vácuo (SLA 5 min)</p>
                  <p className="text-xs text-muted-foreground">
                    Emite alerta sonoro quando um lead sem resposta estiver prestes a ser redistribuído.
                  </p>
                </div>
                <Switch
                  checked={notifyAntiVacuo}
                  onCheckedChange={(c) => {
                    setNotifyAntiVacuo(c);
                    toast.success(c ? "Alerta sonoro anti-vácuo ativado" : "Alerta sonoro desativado");
                  }}
                />
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Radar de Proposta Aberta</p>
                  <p className="text-xs text-muted-foreground">
                    Notifica instantaneamente quando o cliente estiver visualizando seu orçamento online.
                  </p>
                </div>
                <Switch
                  checked={notifyProposalOpen}
                  onCheckedChange={(c) => {
                    setNotifyProposalOpen(c);
                    toast.success(c ? "Radar de proposta ativado" : "Radar de proposta desativado");
                  }}
                />
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Sons de Comemoração de Vendas</p>
                  <p className="text-xs text-muted-foreground">
                    Toca efeito sonoro animado ao mover um negócio para a etapa 'Ganho'.
                  </p>
                </div>
                <Switch
                  checked={soundEffects}
                  onCheckedChange={(c) => {
                    setSoundEffects(c);
                    toast.success(c ? "Sons de comemoração ativados" : "Sons de comemoração desativados");
                  }}
                />
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 4: APARÊNCIA & PREFERÊNCIAS VISUAIS DO PAINEL                        */}
        {/* ========================================================================= */}
        <TabsContent value="aparencia" className="space-y-6 focus-visible:outline-none">
          {/* SELETOR DE PALETAS DE CORES & TEMAS (5 PALETAS COMPLETAS) */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Palette className="size-4 text-primary" />
                <h2 className="text-base font-semibold">Paleta de Cores e Estilo do CRM</h2>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Tons Pastéis & Modernos
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Escolha a identidade visual do sistema. A paleta padrão em tons pastéis proporciona máxima suavidade visual e legibilidade profissional.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {THEME_PALETTES.map((palette) => {
                const isSelected = (app.palette || "pastel") === palette.id;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => {
                      void app.set({
                        palette: palette.id,
                        theme: palette.id === "dark" ? "dark" : "light",
                      });
                      toast.success(`Paleta ${palette.name} aplicada com sucesso!`);
                    }}
                    className={cn(
                      "flex flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md relative overflow-hidden group",
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                        : "border-border/70 bg-card hover:border-primary/40"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {/* Mini amostras de cor */}
                          <div className="flex -space-x-1 items-center">
                            <span
                              className="size-4 rounded-full border border-background shadow-xs"
                              style={{ backgroundColor: palette.preview.primary }}
                            />
                            <span
                              className="size-4 rounded-full border border-background shadow-xs"
                              style={{ backgroundColor: palette.preview.accent }}
                            />
                            <span
                              className="size-4 rounded-full border border-background shadow-xs"
                              style={{ backgroundColor: palette.preview.bg }}
                            />
                          </div>
                          <span className="font-semibold text-sm text-foreground">{palette.name}</span>
                        </div>
                        {isSelected && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{palette.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{palette.badge}</span>
                      <span className="text-primary font-semibold text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {isSelected ? "Em uso" : "Aplicar →"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* MODO DE VISUALIZAÇÃO FOCADO / COMPLETO */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
            <div className="border-b pb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Modo de Visualização do Painel
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Defina a densidade de informações exibidas na barra de navegação.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  void app.set({ view: "focado" });
                  toast.success("Modo Focado ativado");
                }}
                className={cn(
                  "rounded-2xl border-2 p-5 text-left transition-all hover:shadow-md space-y-2",
                  app.view === "focado"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/80 bg-card hover:border-primary/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Modo Focado (Essencial)</h3>
                  {app.view === "focado" && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      Ativo
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Mantém a interface enxuta com foco nas ações de fechamento de vendas matinais.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  void app.set({ view: "completo" });
                  toast.success("Modo Completo ativado");
                }}
                className={cn(
                  "rounded-2xl border-2 p-5 text-left transition-all hover:shadow-md space-y-2",
                  app.view === "completo"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/80 bg-card hover:border-primary/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Modo Completo</h3>
                  {app.view === "completo" && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      Ativo
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Exibe todos os módulos analíticos, automações avançadas e atalhos completos.
                </p>
              </button>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* ========================================================================= */}
      {/* 5. AVANÇADO / ZONA DE PERIGO (ACORDEÃO RECOLHIDO DISCRETO NO RODAPÉ)      */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm transition-all">
        <button
          type="button"
          onClick={() => setDangerOpen(!dangerOpen)}
          className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Configurações Avançadas & Zona de Perigo
              </h2>
              <p className="text-xs text-muted-foreground">
                Exportação de dados completos, auditoria de sessões e operações críticas da conta.
              </p>
            </div>
          </div>
          {dangerOpen ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {dangerOpen && (
          <div className="border-t p-6 space-y-6 bg-muted/10 animate-in fade-in duration-200">
            {/* EXPORTAR DADOS DA EMPRESA */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Download className="size-4 text-primary" /> Exportação de Dados da Empresa
              </h3>
              <p className="text-xs text-muted-foreground">
                Baixe cópias completas de todos os leads cadastrados, contatos, eventos e configurações da empresa.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={handleExportJSON} className="rounded-xl text-xs gap-1.5">
                  <Download className="size-3.5" /> Exportar Backup JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-xl text-xs gap-1.5">
                  <FileSpreadsheet className="size-3.5" /> Exportar Leads CSV
                </Button>
              </div>
            </div>

            {/* AUDITORIA DE SESSÃO ATIVA */}
            <div className="rounded-xl border bg-card p-5 space-y-2 text-xs">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-500" /> Auditoria da Sessão Atual
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 text-muted-foreground pt-1">
                <p>
                  <b>ID do Usuário:</b> <span className="font-mono text-foreground">{user?.id?.slice(0, 18)}...</span>
                </p>
                <p>
                  <b>Empresa Ativa:</b> <span className="font-mono text-foreground">{app.tenantId?.slice(0, 18)}...</span>
                </p>
                <p>
                  <b>Autenticação:</b> <span className="text-emerald-600 font-semibold">Criptografada SSL/TLS</span>
                </p>
                <p>
                  <b>Ambiente:</b> <span className="text-foreground">Produção Netlify</span>
                </p>
              </div>
            </div>

            {/* ZONA DE PERIGO (CRÍTICA) */}
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
                  <AlertTriangle className="size-4" /> Zona de Perigo — Ações Irreversíveis
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ao redefinir ou excluir a conta, todas as conversas, propostas e histórico de leads serão perdidos.
                </p>
              </div>

              <div className="max-w-md space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Para confirmar uma exclusão de dados, digite <span className="text-destructive font-mono font-bold">CONFIRMAR</span> abaixo:
                </label>
                <Input
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder="Digite CONFIRMAR"
                  className="rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteConfirmInput !== "CONFIRMAR"}
                  onClick={() => {
                    toast.error("Operação de segurança: funcionalidade bloqueada para proteção de dados.");
                    setDeleteConfirmInput("");
                  }}
                  className="rounded-xl text-xs"
                >
                  Excluir Dados da Empresa
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
