import { createContext, useContext, useEffect, useState, type ReactNode, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './auth';
import { contactSchema } from './crm-schemas';
import { beep } from './rules';
import {
  type SupportTicket,
  type Referral,
  type AutomationSettings,
  fetchSupportTickets,
  persistTicket,
  toggleTicketResolution,
  fetchReferrals,
  createReferralRecord,
  convertReferralByLead,
  loadAutomationSettings,
  saveAutomationSettings,
  executeWelcomeAutomation,
  evaluateAntiVacuoRule,
} from './alliar-modules';

export type Stage = 'novo' | 'contato' | 'proposta' | 'negociacao' | 'ganho';
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'novo', label: 'Novos' },
  { id: 'contato', label: 'Em contato' },
  { id: 'proposta', label: 'Proposta enviada' },
  { id: 'negociacao', label: 'Negociação' },
  { id: 'ganho', label: 'Ganho' },
];

export type Event = { at: string; kind: 'msg' | 'call' | 'proposta' | 'audio' | 'pix' | 'nota'; text: string };

export type Lead = {
  id: string;
  contactId?: string | undefined;
  name: string;
  company: string;
  phone: string;
  cnpj?: string;
  value: number;
  stage: Stage;
  temp: 'quente' | 'morno' | 'frio';
  priority: 'alta' | 'média' | 'baixa';
  owner: string;
  ownerId?: string;
  lastContact: string;
  createdAt: string;
  updatedAt: string;
  proposalOpen?: boolean;
  timeline: Event[];
};

type Settings = { structure: 'solo' | 'equipe'; view: 'focado' | 'completo'; theme: 'dark' | 'light'; tourDone: boolean };

function useStateData() {
  const { user } = useAuth();
  const query = useQueryClient();
  const [tenantId, setTenant] = useState<string | null>(null);
  const [selected, select] = useState<string | null>(null);

  // Módulos persistidos: Chamados e Indicações
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [automationSettings, setAutomationSettingsState] = useState<AutomationSettings>(() => loadAutomationSettings(''));

  const tenants = useQuery({
    queryKey: ['tenants', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const active = tenantId ?? tenants.data?.[0]?.id ?? null;

  // Carrega Chamados e Indicações quando o tenant ativo mudar
  useEffect(() => {
    if (!active) return;
    setAutomationSettingsState(loadAutomationSettings(active));

    void fetchSupportTickets(active).then((t) => setTickets(t));
    void fetchReferrals(active).then((r) => setReferrals(r));
  }, [active]);

  const state = useQuery({
    queryKey: ['crm', user?.id, active],
    enabled: !!active && !!user,
    queryFn: async () => {
      if (!active || !user) throw Error('Empresa necessária');
      const results = await Promise.all([
        supabase.from('leads').select('*,contacts(*)').eq('tenant_id', active).order('created_at').limit(1000),
        supabase.from('lead_events').select('*').eq('tenant_id', active).order('created_at').limit(1000),
        supabase.from('tenant_settings').select('*').eq('tenant_id', active).single(),
        supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_roles').select('*').eq('tenant_id', active),
        supabase.from('pipeline_stages').select('*').eq('tenant_id', active).order('position'),
        supabase.rpc('tenant_members', { t: active }),
      ]);
      for (const r of results) if (r.error) throw r.error;
      const [ls, es, settings, prefs, roles, stages, mem] = results;
      const members = (mem.data ?? []) as { user_id: string; role: string; display_name: string; email: string }[];
      const nameOf = (id: string) => {
        const m = members.find((x) => x.user_id === id);
        return m ? m.display_name || m.email || 'Membro' : 'Membro';
      };

      return {
        members,
        leads: (ls.data ?? []).map((l) => ({
          id: l.id,
          contactId: l.contact_id,
          name: l.contacts?.name ?? '',
          company: l.contacts?.company ?? '',
          phone: l.contacts?.phone ?? '',
          cnpj: l.contacts?.cnpj ?? '',
          value: Number(l.value),
          stage: l.stage as Stage,
          temp: l.temp as Lead['temp'],
          priority: l.priority as Lead['priority'],
          owner: l.owner_id === user.id ? 'Você' : nameOf(l.owner_id),
          ownerId: l.owner_id,
          lastContact: new Date(l.updated_at).toLocaleDateString('pt-BR'),
          createdAt: l.created_at,
          updatedAt: l.updated_at,
          proposalOpen: false,
          timeline: (es.data ?? [])
            .filter((e) => e.lead_id === l.id)
            .map((e) => ({
              kind: e.kind as Event['kind'],
              text: e.text,
              at: new Date(e.created_at).toLocaleString('pt-BR'),
            })),
        })),
        settings: settings.data,
        prefs: prefs.data,
        roles: roles.data ?? [],
        stages: stages.data ?? [],
      };
    },
  });

  const isAdmin = state.data?.roles.some((r) => r.user_id === user?.id && r.role === 'admin') ?? false;
  const settings: Settings = {
    structure: (state.data?.settings?.structure ?? 'solo') as Settings['structure'],
    view: (state.data?.prefs?.view ?? 'focado') as Settings['view'],
    theme: (state.data?.prefs?.theme ?? 'dark') as Settings['theme'],
    tourDone: state.data?.prefs?.tour_done ?? true,
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  async function refresh() {
    await query.invalidateQueries({ queryKey: ['crm', user?.id, active] });
    if (active) {
      const [t, r] = await Promise.all([fetchSupportTickets(active), fetchReferrals(active)]);
      setTickets(t);
      setReferrals(r);
    }
  }

  const report = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');

  async function set(p: Partial<Settings>) {
    try {
      if (!user || !active) return;
      if (p.structure) {
        if (!isAdmin) throw Error('Somente o administrador pode alterar o modo da empresa');
        const { error } = await supabase.from('tenant_settings').update({ structure: p.structure }).eq('tenant_id', active);
        if (error) throw error;
      }
      const { error } = await supabase.from('user_preferences').upsert({
        user_id: user.id,
        view: p.view ?? settings.view,
        theme: p.theme ?? settings.theme,
        tour_done: p.tourDone ?? settings.tourDone,
      });
      if (error) throw error;
      await refresh();
    } catch (e) {
      report(e);
    }
  }

  async function addEvent(id: string, e: Omit<Event, 'at'>) {
    try {
      if (!active) return;
      const { error } = await supabase.from('lead_events').insert({ tenant_id: active, lead_id: id, ...e });
      if (error) throw error;
      await refresh();
    } catch (e) {
      report(e);
    }
  }

  async function updateLead(id: string, p: Partial<Lead>) {
    try {
      if (!active) return;
      const currentLead = state.data?.leads.find((l) => l.id === id);

      const { error } = await supabase
        .from('leads')
        .update({
          ...(p.stage ? { stage: p.stage } : {}),
          ...(p.value !== undefined ? { value: p.value } : {}),
          ...(p.temp ? { temp: p.temp } : {}),
          ...(p.priority ? { priority: p.priority } : {}),
          ...(p.ownerId ? { owner_id: p.ownerId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', active)
        .eq('id', id);

      if (error) throw error;

      // AUTOMAÇÃO DE CONVERSÃO DE INDICAÇÃO:
      // Se o negócio foi movido para 'ganho', confere se veio de uma indicação para registrar cashback automaticamente
      if (p.stage === 'ganho' && currentLead) {
        try {
          const conversion = await convertReferralByLead(active, id, p.value ?? currentLead.value);
          if (conversion.converted && conversion.referral) {
            toast.success(`🎁 Indicação convertida! Cashback de R$ ${conversion.reward?.toFixed(2)} gerado para ${conversion.referral.referrerName}`);
            await supabase.from('lead_events').insert({
              tenant_id: active,
              lead_id: id,
              kind: 'nota',
              text: `🎁 [Programa de Indicações] Venda ganha! Cashback de R$ ${conversion.reward?.toFixed(2)} registrado para o indicador ${conversion.referral.referrerName}.`,
            });
          }
        } catch {}
      }

      await refresh();
    } catch (e) {
      report(e);
    }
  }

  async function addLead(
    input: unknown,
    extra?: {
      cnpj: string;
      razao_social: string;
      cnae: string;
      endereco: string;
      socios: { nome: string; qualificacao: string }[];
    },
    referralInfo?: { referrerContactId: string; referrerName: string }
  ) {
    if (!active) throw Error('Selecione uma empresa');
    const p = contactSchema.parse(input);
    const { data: leadId, error } = await supabase.rpc('create_lead', {
      t: active,
      contact_name: p.name,
      contact_company: p.company,
      contact_phone: p.phone,
      contact_email: p.email,
      deal_value: p.value,
    });
    if (error) throw error;

    if (extra && leadId) {
      const { data: l } = await supabase.from('leads').select('contact_id').eq('id', leadId).single();
      if (l) {
        const { error: e } = await supabase
          .from('contacts')
          .update({
            cnpj: extra.cnpj,
            razao_social: extra.razao_social.slice(0, 200),
            cnae: extra.cnae.slice(0, 300),
            endereco: extra.endereco.slice(0, 500),
            socios: extra.socios,
          })
          .eq('tenant_id', active)
          .eq('id', l.contact_id);
        if (e) throw e;
      }
    }

    // Se a criação veio de um link de indicação, registra na tabela de indicações
    if (referralInfo && leadId) {
      try {
        await createReferralRecord(active, {
          referrerContactId: referralInfo.referrerContactId,
          referrerName: referralInfo.referrerName,
          referredName: p.name,
          referredPhone: p.phone,
          referredEmail: p.email,
          leadId,
          dealValue: p.value,
          rewardPct: automationSettings.referralRewardPct,
        });

        await supabase.from('lead_events').insert({
          tenant_id: active,
          lead_id: leadId,
          kind: 'nota',
          text: `🤝 Lead originado via Link Mágico de Indicação de ${referralInfo.referrerName}.`,
        });
      } catch {}
    }

    // AUTOMAÇÃO DE FUNIL 1: MENSAGEM AUTOMÁTICA DE BOAS-VINDAS
    if (automationSettings.welcomeEnabled && leadId) {
      try {
        const seller = state.data?.members.find((m) => m.user_id === user?.id);
        const sellerName = seller?.display_name || seller?.email || 'Alliar';
        await executeWelcomeAutomation({
          tenantId: active,
          leadId,
          leadName: p.name,
          leadPhone: p.phone,
          companyName: p.company,
          sellerName,
        });
        toast.info(`🤖 Boas-vindas automática enviada para ${p.name} no WhatsApp`);
      } catch (err) {
        console.error('Erro na automação de boas-vindas:', err);
      }
    }

    await refresh();
    return leadId;
  }

  // --- MÉTODOS DE CHAMADOS (PÓS-VENDA /portal) ---
  async function addTicket(ticketData: {
    title: string;
    description?: string;
    contactName?: string;
    contactId?: string | undefined;
    priority?: 'alta' | 'média' | 'baixa';
  }) {
    if (!active) throw Error('Selecione uma empresa');
    const created = await persistTicket(active, ticketData);
    setTickets((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
    toast.success(`Chamado aberto com sucesso · Protocolo ${created.protocol}`);

    // Se vinculado a um lead, adiciona à timeline
    if (ticketData.contactId) {
      const matchLead = state.data?.leads.find((l) => l.contactId === ticketData.contactId || l.id === ticketData.contactId);
      if (matchLead) {
        void addEvent(matchLead.id, {
          kind: 'nota',
          text: `🎫 Chamado de pós-venda aberto (${created.protocol}): ${created.title} · SLA ${created.slaLabel}`,
        });
      }
    }
    return created;
  }

  async function toggleTicket(ticketId: string) {
    if (!active) return;
    const updated = await toggleTicketResolution(active, ticketId);
    setTickets(updated);
    const target = updated.find((t) => t.id === ticketId || t.protocol === ticketId);
    if (target?.status === 'resolvido') {
      toast.success(`Chamado ${target.protocol} marcado como resolvido`);
    } else {
      toast.info(`Chamado reaberto`);
    }
  }

  // --- MÉTODOS DE INDICAÇÕES (/indicacoes) ---
  async function addReferral(data: {
    referrerContactId: string;
    referrerName: string;
    referredName: string;
    referredPhone: string;
    referredEmail?: string | undefined;
    dealValue?: number;
  }) {
    if (!active) throw Error('Selecione uma empresa');
    const created = await createReferralRecord(active, {
      ...data,
      rewardPct: automationSettings.referralRewardPct,
    });
    setReferrals((prev) => [created, ...prev]);
    toast.success(`Indicação registrada para ${data.referrerName}`);
    return created;
  }

  function setReferralRewardPct(pct: number) {
    if (!active) return;
    const updated = saveAutomationSettings(active, { referralRewardPct: pct });
    setAutomationSettingsState(updated);
    toast.success(`Taxa de cashback de indicações salva em ${pct}%`);
  }

  function updateAutomationSettings(partial: Partial<AutomationSettings>) {
    if (!active) return;
    const updated = saveAutomationSettings(active, partial);
    setAutomationSettingsState(updated);
    toast.success('Configurações do motor de automação salvas');
  }

  // --- AUTOMAÇÃO DE FUNIL 2: ANTI-VÁCUO ROUND-ROBIN (5 MINUTOS) ---
  const runningAntiVacuo = useRef(false);

  const executeAntiVacuoCheck = useCallback(async (forcedLeads?: Lead[]) => {
    if (!active || !state.data?.members || state.data.members.length <= 1) return [];
    if (runningAntiVacuo.current) return [];

    runningAntiVacuo.current = true;
    try {
      const leadsToCheck = forcedLeads || state.data.leads || [];
      const transfers = evaluateAntiVacuoRule({
        leads: leadsToCheck,
        teamMembers: state.data.members,
        currentUserId: user?.id || '',
        slaMinutes: automationSettings.antiVacuoMinutes,
      });

      if (transfers.length > 0) {
        beep(750, 300); // Alerta sonoro anti-vácuo
        for (const t of transfers) {
          await supabase
            .from('leads')
            .update({ owner_id: t.newOwnerId, updated_at: new Date().toISOString() })
            .eq('tenant_id', active)
            .eq('id', t.leadId);

          await supabase.from('lead_events').insert({
            tenant_id: active,
            lead_id: t.leadId,
            kind: 'nota',
            text: `⚡ [Anti-Vácuo SLA ${automationSettings.antiVacuoMinutes}m] Lead ficou ${t.minutesInVacuo}min sem resposta e foi transferido automaticamente para ${t.newOwnerName} via round-robin.`,
          });

          toast.warning(`⚡ SLA Anti-vácuo disparado! Lead "${t.leadName}" transferido para ${t.newOwnerName}.`);
        }
        await refresh();
      }
      return transfers;
    } finally {
      runningAntiVacuo.current = false;
    }
  }, [active, state.data?.members, state.data?.leads, user?.id, automationSettings.antiVacuoMinutes]);

  // Simulação manual de anti-vácuo para teste imediato
  const simulateAntiVacuo = useCallback(async (targetLeadId?: string) => {
    if (!active || !state.data?.members || state.data.members.length <= 1) {
      toast.error('Para testar a distribuição round-robin, é necessário ter pelo menos 2 membros na equipe (veja em Equipe).');
      return;
    }
    const targetLead = targetLeadId ? state.data.leads.find((l) => l.id === targetLeadId) : state.data.leads.find((l) => l.stage === 'novo');
    if (!targetLead) {
      toast.error('Nenhum lead na etapa "Novos" para testar o Anti-Vácuo.');
      return;
    }

    // Força data criada há 6 minutos para disparar o SLA
    const simulatedLead = {
      ...targetLead,
      createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
      lastContact: new Date(Date.now() - 6 * 60000).toISOString(),
    };

    toast.info(`Simulando lead "${simulatedLead.name}" sem resposta há 6 minutos...`);
    await executeAntiVacuoCheck([simulatedLead]);
  }, [active, state.data?.members, state.data?.leads, executeAntiVacuoCheck]);

  // Intervalo em background para verificar anti-vácuo a cada 20 segundos no modo equipe
  useEffect(() => {
    if (!active || settings.structure !== 'equipe' || !automationSettings.antiVacuoEnabled) return;
    const interval = setInterval(() => {
      void executeAntiVacuoCheck();
    }, 20000);
    return () => clearInterval(interval);
  }, [active, settings.structure, automationSettings.antiVacuoEnabled, executeAntiVacuoCheck]);

  return {
    ...settings,
    set,
    leads: state.data?.leads ?? [],
    updateLead,
    addEvent,
    addLead,
    selected,
    select,
    tenantId: active,
    tenants: tenants.data ?? [],
    switchTenant: (id: string) => {
      select(null);
      setTenant(id);
    },
    isAdmin,
    loading: tenants.isPending || (!!active && state.isPending),
    error: tenants.error ?? state.error,
    refresh,
    stages: state.data?.stages ?? [],
    members: state.data?.members ?? [],
    commissionRate: Number(state.data?.settings?.commission_rate ?? 0),
    pixKey: state.data?.settings?.pix_key ?? '',

    // Módulo 1: Chamados e Pós-venda
    tickets,
    addTicket,
    toggleTicket,

    // Módulo 2: Programa de Indicações
    referrals,
    addReferral,
    referralRewardPct: automationSettings.referralRewardPct,
    setReferralRewardPct,

    // Módulo 3: Automações de Funil
    automationSettings,
    updateAutomationSettings,
    executeAntiVacuoCheck,
    simulateAntiVacuo,
  };
}

type Ctx = ReturnType<typeof useStateData>;
const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const data = useStateData();
  return <C.Provider value={data}>{children}</C.Provider>;
}

export function useApp() {
  const c = useContext(C);
  if (!c) throw Error('useApp fora do AppProvider');
  return c;
}
