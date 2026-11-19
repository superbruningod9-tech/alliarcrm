import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Columns3,
  GraduationCap,
  Gift,
  Headset,
  Home,
  Inbox,
  PhoneCall,
  Search,
  Users,
  LifeBuoy,
  HelpCircle,
  Menu,
  Settings,
  Contact,
  FileText,
  LogOut,
  Smartphone,
  Plug,
  Compass,
  GitBranch,
  ClipboardList,
  BarChart3,
  User,
  Sparkles,
  Building2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LeadSheet } from "./LeadSheet";
import { beep } from "@/lib/rules";
import { CompanySetup } from "./CompanySetup";
import { TabTour } from "./TabTour";
import { AiCopilot } from "./AiCopilot";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  full?: boolean;
  team?: boolean;
  badge?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Principal",
    items: [
      { to: "/dashboard", label: "Início", icon: Home },
      { to: "/metrics", label: "Métricas & Painéis", icon: BarChart3 },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { to: "/inbox", label: "Conversas", icon: Inbox },
      { to: "/whatsapp", label: "WhatsApp", icon: Smartphone },
      { to: "/dialer", label: "Discador", icon: PhoneCall },
    ],
  },
  {
    title: "Comercial & CRM",
    items: [
      { to: "/pipeline", label: "Funil", icon: Columns3 },
      { to: "/contatos", label: "Contatos", icon: Contact },
      { to: "/propostas", label: "Propostas", icon: FileText },
      { to: "/portal", label: "Pós-venda", icon: Headset },
      { to: "/equipe", label: "Equipe & metas", icon: Users, team: true },
    ],
  },
  {
    title: "Crescimento & Automação",
    items: [
      { to: "/prospeccao", label: "Prospecção B2B", icon: Compass },
      { to: "/forms", label: "Questionários & Forms", icon: ClipboardList },
      { to: "/workflows", label: "Automações & Nós", icon: GitBranch },
      { to: "/treino", label: "Treino com IA", icon: GraduationCap },
      { to: "/integracoes", label: "Integrações", icon: Plug },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { to: "/indicacoes", label: "Indicações", icon: Gift },
  { to: "/perfil", label: "Meu Perfil", icon: User },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export const NAV: NavItem[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
  ...FOOTER_NAV,
];

const TOUR = [
  ["Bem-vindo à Alliar 👋", "Seu CRM feito para vender pelo WhatsApp no Brasil. Vamos te mostrar cada módulo em 60 segundos."],
  ["🏠 Início (Dashboard)", "O cockpit do seu dia: veja os 3 negócios mais quentes, follow-ups pendentes, alertas anti-vácuo e atalhos rápidos."],
  ["📊 Funil de Vendas", "Seus clientes em colunas Kanban: Novo → Em Contato → Proposta → Negociação → Ganho. Arraste cartões para avançar."],
  ["💬 WhatsApp & Conversas", "Envie mensagens pelo WhatsApp direto do CRM. Templates prontos e respostas sugeridas por inteligência artificial."],
  ["📞 Discador Comercial", "Faça chamadas com 1 clique e anote o resumo da ligação direto na ficha do cliente."],
  ["🔍 Prospecção B2B", "Busque empresas reais por CNPJ e no Google Maps — sem dados inventados."],
  ["📄 Propostas & PIX", "Gere propostas comerciais com QR Code PIX embutido. Ao pagar, o sistema marca ganho automaticamente."],
  ["⚙️ Do seu jeito", "Alterne entre Modo Solo e Modo Equipe no topo quando quiser. Explore o guia de cada aba pelo botão 'Guia deste módulo'."],
];

export function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [cmd, setCmd] = useState(false);
  const [tour, setTour] = useState(0);

  // Menu unificado, recolhido/oculto por padrão
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu ao trocar de rota
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((o) => !o);
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,[contenteditable],[role=dialog]")) return;
      const ids = app.leads.filter((l) => l.stage !== "ganho").map((l) => l.id);
      const i = app.selected ? ids.indexOf(app.selected) : -1;
      if (e.key === "j") app.select(ids[Math.min(i + 1, ids.length - 1)] ?? null);
      else if (e.key === "k") app.select(ids[Math.max(i - 1, 0)] ?? null);
      else if (!app.selected) return;
      else if (e.key === "1") window.dispatchEvent(new Event("alliar:pix"));
      else if (e.key === "2") {
        app.updateLead(app.selected, { stage: "contato" });
        toast("Retorno agendado");
      } else if (e.key === "3") {
        app.updateLead(app.selected, { stage: "ganho" });
        beep(990);
        toast.success("Movido para Ganho");
      } else if (e.key === " ") {
        e.preventDefault();
        toast("Use o botão 'Resumo de voz' para gravar");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  // Radar de proposta aberta
  useEffect(() => {
    const t = setTimeout(() => {
      const l = app.leads.find((x) => x.proposalOpen);
      if (l) {
        beep(520, 120);
        toast.info(`📡 ${l.name} está abrindo sua proposta agora`, {
          action: { label: "Abrir", onClick: () => app.select(l.id) },
        });
      }
    }, 7000);
    return () => clearTimeout(t);
  }, [app.leads, app.select]);

  return (
    <div className="min-h-screen bg-background font-sans antialiased flex flex-col relative w-full overflow-x-hidden premium-card">
      {/* MENU LATERAL SLIDE-OVER (GAVETA UNIFICADA, OCULTO POR PADRÃO) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-150">
          {/* BACKDROP ESCURECIDO */}
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* PAINEL LATERAL DO MENU */}
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            {/* CABEÇALHO DO MENU */}
            <div className="mb-3 flex items-center justify-between pb-3 border-b border-sidebar-border/70">
              <Link
                to="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 group min-w-0"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-tr from-primary to-amber-500 text-sm font-black text-primary-foreground shadow-sm shadow-primary/30 shrink-0">
                  A
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground truncate">Alliar</span>
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.2 text-[9px] font-extrabold text-primary uppercase tracking-wide shrink-0">
                      Prime
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-none truncate">CRM Comercial & B2B</p>
                </div>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                onClick={() => setMenuOpen(false)}
                title="Fechar menu"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* BUSCA RÁPIDA */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setCmd(true);
              }}
              className="mb-4 flex items-center gap-2 rounded-xl border border-sidebar-border bg-background/80 px-3 py-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground transition-all shadow-2xs w-full"
            >
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">Buscar ou comandar…</span>
              <kbd className="ml-auto text-[10px] font-mono bg-muted/70 px-1.5 py-0.5 rounded border">⌘K</kbd>
            </button>

            {/* ITENS AGRUPADOS POR CATEGORIA */}
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {NAV_SECTIONS.map((sec) => {
                const visibleItems = sec.items.filter(
                  (n) => (!n.full || app.view === "completo") && (!n.team || app.structure === "equipe")
                );
                if (!visibleItems.length) return null;

                return (
                  <div key={sec.title} className="space-y-1">
                    <h4 className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 select-none">
                      {sec.title}
                    </h4>
                    <div className="space-y-0.5">
                      {visibleItems.map((n) => {
                        const isActive = path === n.to;
                        return (
                          <Link
                            key={n.to}
                            to={n.to}
                            onClick={() => setMenuOpen(false)}
                            className={cn(
                              "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all",
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/20"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <n.icon
                              className={cn(
                                "size-4 shrink-0 transition-transform group-hover:scale-105",
                                isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                              )}
                            />
                            <span className="truncate">{n.label}</span>
                            {n.badge && (
                              <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.2 text-[9px] font-bold">
                                {n.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RODAPÉ DO MENU */}
            <div className="mt-auto border-t border-sidebar-border/70 pt-3 space-y-1">
              <h4 className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 select-none">
                Conta & Acessos
              </h4>
              {FOOTER_NAV.map((n) => {
                const isActive = path === n.to;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/20"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <n.icon
                      className={cn(
                        "size-4 shrink-0",
                        isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{n.label}</span>
                  </Link>
                );
              })}

              {app.structure === "equipe" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 rounded-xl mt-1 h-8"
                  onClick={() => {
                    beep(440);
                    toast.warning("SOS enviado: seu gestor foi chamado para ajudar");
                  }}
                >
                  <LifeBuoy className="size-3.5 mr-2" /> SOS do vendedor
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-muted-foreground hover:text-foreground rounded-xl h-8"
                onClick={() => {
                  setMenuOpen(false);
                  setTour(1);
                }}
              >
                <HelpCircle className="size-3.5 mr-2" /> Rever tour guiado
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ÁREA PRINCIPAL */}
      <div className="flex min-w-0 flex-1 flex-col w-full">
        {/* BARRA SUPERIOR (HEADER LIMPO COM BOTÃO ÚNICO DE MENU) */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-3 border-b border-border/70 bg-background/90 px-3 sm:px-6 backdrop-blur-md min-w-0 max-w-full">
          {/* BOTÃO ÚNICO DE ENTRADA DO MENU */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl text-foreground hover:bg-muted shrink-0 size-9"
            onClick={() => setMenuOpen((o) => !o)}
            title="Abrir menu de navegação"
          >
            <Menu className="size-5" />
          </Button>

          {/* LOGO NO CABEÇALHO */}
          <Link to="/dashboard" className="flex items-center gap-2 group shrink-0" title="Alliar Prime">
            <div className="grid size-8 place-items-center rounded-xl bg-gradient-to-tr from-primary to-amber-500 text-xs font-black text-primary-foreground shadow-xs shrink-0">
              A
            </div>
            <span className="font-bold text-sm tracking-tight text-foreground hidden sm:inline">Alliar</span>
          </Link>

          {/* SELETOR DE EMPRESA */}
          <div className="flex items-center gap-1.5 min-w-0">
            <select
              aria-label="Empresa ativa"
              className="max-w-36 sm:max-w-48 rounded-xl border border-border/80 bg-background px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 truncate"
              value={app.tenantId ?? ""}
              onChange={(e) => app.switchTenant(e.target.value)}
            >
              {app.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* ATALHOS DE TECLADO RÁPIDOS (DESKTOP) */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground/80 ml-2">
            <kbd className="bg-muted px-1.5 py-0.5 rounded border text-[10px]">J</kbd>
            <kbd className="bg-muted px-1.5 py-0.5 rounded border text-[10px]">K</kbd> navegar ·{" "}
            <kbd className="bg-muted px-1.5 py-0.5 rounded border text-[10px]">1</kbd> PIX ·{" "}
            <kbd className="bg-muted px-1.5 py-0.5 rounded border text-[10px]">3</kbd> ganho
          </div>

          {/* FOTO E PERFIL DO USUÁRIO NO CABEÇALHO */}
          <Link
            to="/perfil"
            className="ml-auto flex items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-2.5 py-1 text-xs font-medium hover:border-primary/40 hover:bg-card transition-all shadow-2xs shrink-0 min-w-0"
            title={`Acessar Meu Perfil (${app.userName})`}
          >
            <div className="size-6 sm:size-7 rounded-lg overflow-hidden bg-primary/10 grid place-items-center shrink-0 border border-primary/20">
              {app.userAvatar ? (
                <img src={app.userAvatar} alt="Foto de perfil" className="size-full object-cover" />
              ) : (
                <User className="size-3.5 text-primary" />
              )}
            </div>
            <span className="font-semibold text-foreground truncate max-w-[90px] sm:max-w-[140px] hidden xs:inline">
              {app.userName}
            </span>
          </Link>

          {/* BOTÃO SAIR */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sair"
            title="Sair da conta"
            className="rounded-xl text-muted-foreground hover:text-destructive shrink-0 size-8 sm:size-9"
            onClick={async () => {
              await queryClient.cancelQueries();
              queryClient.clear();
              await supabase.auth.signOut();
              await nav({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </header>

        {/* CONTEÚDO DA PÁGINA (100% RESPONSIVO, SEM APERTO) */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0 overflow-x-hidden">
          {app.loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <span className="size-2 rounded-full bg-primary animate-ping mr-2" /> Carregando sua empresa…
            </div>
          ) : app.error ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
              <p className="font-semibold text-destructive">Não foi possível carregar os dados.</p>
              <Button onClick={() => app.refresh()} variant="outline" className="rounded-xl">
                Tentar novamente
              </Button>
            </div>
          ) : !app.tenantId ? (
            <CompanySetup />
          ) : (
            children
          )}
        </main>
      </div>

      <LeadSheet />

      {/* COPILOTO DE IA FLUTUANTE */}
      <AiCopilot activePath={path} />

      {/* COMMAND PALETTE (CMD+K) */}
      <CommandDialog open={cmd} onOpenChange={setCmd}>
        <CommandInput placeholder="Buscar cliente, página ou ação…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Ir para">
            {NAV.map((n) => (
              <CommandItem
                key={n.to}
                onSelect={() => {
                  void nav({ to: n.to });
                  setCmd(false);
                }}
              >
                <n.icon className="mr-2 size-4" />
                {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Clientes">
            {app.leads.map((l) => (
              <CommandItem
                key={l.id}
                value={`${l.name} ${l.company}`}
                onSelect={() => {
                  app.select(l.id);
                  setCmd(false);
                }}
              >
                {l.name}
                <span className="text-muted-foreground ml-1.5">· {l.company}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Ações">
            <CommandItem
              onSelect={() => {
                void app.set({ theme: app.theme === "dark" ? "light" : "dark" });
                setCmd(false);
              }}
            >
              Alternar tema (Claro / Escuro)
            </CommandItem>
            <CommandItem
              onSelect={() => {
                void app.set({ structure: app.structure === "solo" ? "equipe" : "solo" });
                setCmd(false);
              }}
            >
              Alternar Modo Solo / Equipe
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* TOUR DIALOG */}
      <Dialog
        open={!app.tourDone || tour > 0}
        onOpenChange={(o) => {
          if (!o) {
            void app.set({ tourDone: true });
            setTour(0);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl p-6">
          {(() => {
            const idx = Math.max(tour - 1, 0);
            const [t, d] = TOUR[idx] ?? TOUR[0] ?? ["Alliar", ""];
            return (
              <div className="space-y-4">
                <div className="flex gap-1">
                  {TOUR.map((_, i) => (
                    <span
                      key={i}
                      className={cn("h-1 flex-1 rounded-full transition-all", i <= idx ? "bg-primary" : "bg-muted")}
                    />
                  ))}
                </div>
                <h2 className="text-lg font-bold tracking-tight">{t}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{d}</p>
                <div className="flex justify-between pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl text-xs"
                    onClick={() => {
                      void app.set({ tourDone: true });
                      setTour(0);
                    }}
                  >
                    Pular
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-xl text-xs"
                    onClick={() => {
                      if (idx === TOUR.length - 1) {
                        void app.set({ tourDone: true });
                        setTour(0);
                      } else setTour(idx + 2);
                    }}
                  >
                    {idx === TOUR.length - 1 ? "Começar a usar" : "Próximo"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Seg({
  value,
  opts,
  onChange,
  disabled,
}: {
  value: string;
  opts: [string, string][];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-xl border border-border/80 bg-muted/40 p-0.5 text-xs">
      {opts.map(([v, l]) => (
        <Button
          key={v}
          disabled={disabled}
          variant="ghost"
          size="sm"
          onClick={() => onChange(v)}
          className={cn(
            "h-7 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
            value === v ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l}
        </Button>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4 min-w-0">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words min-w-0">{title}</h1>
        {sub && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed break-words min-w-0">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <TabTour />
        {children}
      </div>
    </div>
  );
}
