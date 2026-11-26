import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Mail,
  Phone,
  Linkedin,
  Instagram,
  Globe,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  Sparkles,
  Trophy,
  Award,
  Zap,
  TrendingUp,
  Share2,
  QrCode,
  ShieldCheck,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/lib/store";
import { toE164 } from "@/lib/whatsapp";
import { seo } from "@/lib/seo";
import { brl } from "@/lib/pix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () =>
    seo(
      "Meu Perfil · Alliar CRM",
      "Identidade pública do vendedor, foto de perfil, capa, bio, links sociais e cartão de visitas digital."
    ),
  component: ProfilePage,
});

interface ProfileExtra {
  role: string;
  bio: string;
  phone: string;
  linkedin: string;
  instagram: string;
  website: string;
  coverGradient: string;
}

const COVER_GRADIENTS = [
  { id: "emerald", label: "Esmeralda Prime", style: "from-emerald-600 via-teal-700 to-slate-900" },
  { id: "aurora", label: "Aurora Boreal", style: "from-blue-600 via-indigo-700 to-purple-900" },
  { id: "sunset", label: "Sunset Gold", style: "from-amber-500 via-orange-600 to-rose-900" },
  { id: "carbon", label: "Carbon Dark", style: "from-zinc-800 via-neutral-900 to-black" },
];

function ProfilePage() {
  const { user } = useAuth();
  const app = useApp();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [qrModal, setQrModal] = useState(false);

  // Busca dados de perfil do Supabase
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user?.id ?? "").single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Campos extras persistidos por usuário
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [role, setRole] = useState("Executivo de Vendas & Negociação B2B");
  const [bio, setBio] = useState("Especialista em atendimento consultivo e fechamento de novos negócios pelo WhatsApp.");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [coverGradient, setCoverGradient] = useState(COVER_GRADIENTS[0]!.style);

  // Carrega do Supabase e do armazenamento local
  useEffect(() => {
    if (profileQuery.data) {
      setName(profileQuery.data.display_name || "");
      setAvatarUrl(profileQuery.data.avatar_url || "");
    }
    if (user?.id) {
      try {
        const raw = localStorage.getItem(`alliar:profile_extra:${user.id}`);
        if (raw) {
          const extra: Partial<ProfileExtra> = JSON.parse(raw);
          if (extra.role) setRole(extra.role);
          if (extra.bio) setBio(extra.bio);
          if (extra.phone) setPhone(extra.phone);
          if (extra.linkedin) setLinkedin(extra.linkedin);
          if (extra.instagram) setInstagram(extra.instagram);
          if (extra.website) setWebsite(extra.website);
          if (extra.coverGradient) setCoverGradient(extra.coverGradient);
        }
      } catch {}
    }
  }, [profileQuery.data, user?.id]);

  // Estatísticas de vendas reais deste vendedor
  const myStats = useMemo(() => {
    const myLeads = app.leads.filter((l) => l.ownerId === user?.id || l.owner === "Você");
    const wonLeads = myLeads.filter((l) => l.stage === "ganho");
    const totalWon = wonLeads.reduce((s, l) => s + (l.value || 0), 0);
    const conversionRate = myLeads.length > 0 ? Math.round((wonLeads.length / myLeads.length) * 100) : 0;
    return {
      totalLeads: myLeads.length,
      wonCount: wonLeads.length,
      totalWon,
      conversionRate,
    };
  }, [app.leads, user?.id]);

  // Salvar perfil
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      // Salva dados oficiais no Supabase
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: name.trim(),
          avatar_url: avatarUrl.trim(),
        })
        .eq("id", user.id);
      if (error) throw error;

      // Salva dados complementares de identidade pública
      const extra: ProfileExtra = {
        role: role.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
        linkedin: linkedin.trim(),
        instagram: instagram.trim(),
        website: website.trim(),
        coverGradient,
      };
      localStorage.setItem(`alliar:profile_extra:${user.id}`, JSON.stringify(extra));

      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await app.refresh();
      toast.success("Perfil público atualizado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  // Link público do cartão de visitas
  const digitalCardUrl = useMemo(() => {
    const cleanPhone = toE164(phone);
    if (cleanPhone && cleanPhone.length >= 12) return `https://wa.me/${cleanPhone}`;
    if (typeof window !== "undefined") return window.location.origin;
    return "https://alliar.com.br";
  }, [phone]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* CAPA & FOTO DE PERFIL ESTILO PRIME */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Banner de Capa */}
        <div className={`relative h-44 sm:h-52 w-full bg-gradient-to-r ${coverGradient} transition-all duration-500 p-4 flex items-start justify-end`}>
          <div className="flex items-center gap-1.5 rounded-full bg-black/30 backdrop-blur-md px-3 py-1 text-xs text-white/90 border border-white/10">
            <Sparkles className="size-3.5 text-amber-300" />
            <span>Tema da Capa</span>
            <div className="flex items-center gap-1 ml-2">
              {COVER_GRADIENTS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  title={g.label}
                  onClick={() => setCoverGradient(g.style)}
                  className={`size-4 rounded-full border border-white/40 transition-transform ${coverGradient === g.style ? "scale-125 ring-2 ring-white" : "hover:scale-110"}`}
                  style={{ background: g.id === "emerald" ? "#059669" : g.id === "aurora" ? "#4f46e5" : g.id === "sunset" ? "#ea580c" : "#27272a" }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Dados Principais & Avatar */}
        <div className="relative px-6 pb-6 pt-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-16 sm:-mt-20 mb-4">
            {/* Avatar Circle */}
            <div className="relative flex items-center justify-center">
              <div className="size-28 sm:size-32 rounded-2xl border-4 border-card bg-muted shadow-lg overflow-hidden flex items-center justify-center text-3xl font-black text-primary select-none">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={name} className="size-full object-cover" />
                ) : (
                  <span>{(name || user?.email || "U").slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <span className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card" title="Vendedor Online">
                <span className="size-2 rounded-full bg-white animate-pulse" />
              </span>
            </div>

            {/* Ações Rápidas */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQrModal(true)}
                className="gap-1.5 text-xs rounded-xl"
              >
                <QrCode className="size-3.5 text-primary" />
                Cartão Digital (QR)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(digitalCardUrl);
                  toast.success("Link copiado para a área de transferência!");
                }}
                className="gap-1.5 text-xs rounded-xl"
              >
                <Copy className="size-3.5" />
                Copiar Link
              </Button>
            </div>
          </div>

          {/* Nome, Cargo e Empresa */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{name || "Seu Nome Comercial"}</h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary flex items-center gap-1">
                <ShieldCheck className="size-3.5" /> Perfil Verificado
              </span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">{role}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" /> {user?.email}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Building className="size-3.5" /> Alliar CRM
              </span>
              {phone && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="size-3.5 text-emerald-500" /> {phone}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PAINEL DE CONQUISTAS & MÉTRICAS PESSOAIS DO VENDEDOR */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Vendas Ganhas</span>
            <Trophy className="size-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground">{myStats.wonCount}</p>
          <p className="text-[11px] text-muted-foreground">negócios fechados no CRM</p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Receita Gerada</span>
            <TrendingUp className="size-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {brl(myStats.totalWon)}
          </p>
          <p className="text-[11px] text-muted-foreground">volume financeiro total</p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Taxa de Conversão</span>
            <Award className="size-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground">{myStats.conversionRate}%</p>
          <p className="text-[11px] text-muted-foreground">de conversão pessoal</p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Pipeline Ativo</span>
            <Zap className="size-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground">{myStats.totalLeads}</p>
          <p className="text-[11px] text-muted-foreground">clientes em carteira</p>
        </div>
      </section>

      {/* FORMULÁRIO DE EDIÇÃO DO PERFIL PÚBLICO */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* DADOS BÁSICOS */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
          <div className="border-b pb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <User className="size-4 text-primary" /> Informações de Apresentação
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Esses dados são exibidos aos clientes em propostas comerciais, links mágicos e mensagens.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nome Comercial Completo *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Mendes"
                required
                maxLength={100}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Cargo ou Função *</label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Closer Especialista B2B"
                required
                maxLength={80}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">URL da Foto de Perfil (Avatar)</label>
              <div className="flex gap-2">
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  className="rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const seed = Math.floor(Math.random() * 1000);
                    setAvatarUrl(`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`);
                    toast.success("Avatar gerado com sucesso!");
                  }}
                  className="shrink-0 rounded-xl"
                >
                  <Sparkles className="size-3.5 mr-1.5 text-amber-500" /> Gerar Avatar
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Bio / Apresentação Comercial</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Conte brevemente como você ajuda seus clientes..."
                rows={3}
                maxLength={300}
                className="rounded-xl text-sm leading-relaxed"
              />
              <span className="text-[11px] text-muted-foreground">{bio.length}/300 caracteres</span>
            </div>
          </div>
        </section>

        {/* CANAIS E LINKS SOCIAIS */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
          <div className="border-b pb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Share2 className="size-4 text-primary" /> Canais de Contato & Redes Sociais
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Facilite para que seus leads acessem seu WhatsApp oficial, LinkedIn e redes profissionais.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Phone className="size-3.5 text-emerald-500" /> WhatsApp Comercial Direto
              </label>
              <Input
                value={phone}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                  if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
                  else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
                  setPhone(v);
                }}
                placeholder="(11) 98765-4321"
                className="rounded-xl font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Linkedin className="size-3.5 text-blue-500" /> Perfil no LinkedIn
              </label>
              <Input
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/seu-perfil"
                className="rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Instagram className="size-3.5 text-rose-500" /> Perfil no Instagram
              </label>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@seu.perfil.comercial"
                className="rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Globe className="size-3.5 text-cyan-500" /> Site ou Portfólio
              </label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://suaempresa.com.br"
                className="rounded-xl text-sm"
              />
            </div>
          </div>
        </section>

        {/* BOTÃO DE SALVAR */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={saving} size="lg" className="rounded-xl px-8 shadow-sm">
            {saving ? "Salvando perfil..." : "Salvar Alterações do Perfil"}
          </Button>
        </div>
      </form>

      {/* MODAL DE CARTÃO DIGITAL COM QR CODE */}
      <Dialog open={qrModal} onOpenChange={setQrModal}>
        <DialogContent className="max-w-sm rounded-2xl p-6 text-center space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg">Cartão de Visitas Digital</DialogTitle>
          </DialogHeader>

          <div className="mx-auto size-48 rounded-xl border bg-white p-3 shadow-sm flex items-center justify-center">
            <QRCodeSVG value={digitalCardUrl} size={168} level="H" />
          </div>

          <div className="space-y-1">
            <p className="font-bold text-foreground text-sm">{name || "Vendedor Alliar"}</p>
            <p className="text-xs text-muted-foreground">{role}</p>
            <p className="text-[11px] text-muted-foreground font-mono pt-1">{phone || user?.email}</p>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(digitalCardUrl);
                toast.success("Link do cartão copiado!");
                setQrModal(false);
              }}
            >
              <Copy className="size-3.5 mr-1" /> Copiar Link
            </Button>
            <Button variant="outline" className="rounded-xl text-xs" onClick={() => setQrModal(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
