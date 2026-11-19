import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { companySchema } from '@/lib/crm-schemas';
import { useAuth } from '@/lib/auth';
import { useApp } from '@/lib/store';
import { saveUserApiKeys } from '@/lib/api-keys';
import { sendWelcomeEmail, generateWelcomeEmailText } from '@/lib/welcome-email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Building2,
  Users,
  User,
  ArrowRight,
  Copy,
  Send,
  CheckCircle2,
  Sparkles,
  Key,
  ExternalLink,
  ShieldCheck,
  Bot,
  MapPin,
  Mail,
  Briefcase,
  DollarSign,
  UserCheck,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type OnboardingStep = 'company_form' | 'mode' | 'invite' | 'api_setup' | 'done';

export function CompanySetup() {
  const { user } = useAuth();
  const app = useApp();
  const query = useQueryClient();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Etapas
  const [step, setStep] = useState<OnboardingStep>('company_form');
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  // Campos Obrigatórios de Cadastro da Empresa
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [segment, setSegment] = useState('');
  const [monthlyRevenue, setMonthlyRevenue] = useState('');
  const [totalEmployees, setTotalEmployees] = useState('');
  const [userCount, setUserCount] = useState('');

  // Modo de trabalho
  const [mode, setMode] = useState<'solo' | 'equipe'>('solo');

  // Convite de colaboradores
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent] = useState<string[]>([]);
  const [inviteLink, setInviteLink] = useState('');

  // Chaves de API no Onboarding (BYOK)
  const [aiKey, setAiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'groq'>('gemini');
  const [b2bKey, setB2bKey] = useState('');
  const [b2bProvider, setB2bProvider] = useState<'google' | 'apollo'>('google');

  // Status de envio do e-mail
  const [welcomeEmailSent, setWelcomeEmailSent] = useState(false);

  function maskCnpj(val: string) {
    return val
      .replace(/\D/g, '')
      .slice(0, 14)
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  async function handleCompanyRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) {
      setMessage('Informe o nome da empresa');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const validName = companySchema.parse(companyName.trim());

      // 1. Cria a empresa no banco de dados via RPC oficial
      const { data: tenantId, error: rpcError } = await supabase.rpc('create_tenant', {
        company_name: validName,
      });
      if (rpcError) throw rpcError;
      if (!tenantId) throw new Error('Não foi possível obter o identificador da empresa criada.');

      setCreatedTenantId(tenantId);

      // 2. Salva as informações cadastrais vinculadas à empresa e ao usuário no banco de dados
      const companyDetails = {
        companyName: validName,
        cnpj: cnpj.replace(/\D/g, ''),
        cnpjFormatted: cnpj,
        address: address.trim(),
        segment: segment.trim(),
        monthlyRevenue: monthlyRevenue.trim(),
        totalEmployees: totalEmployees ? Number(totalEmployees) : null,
        userCount: userCount ? Number(userCount) : 1,
        registeredAt: new Date().toISOString(),
      };

      // Persiste no Supabase na tabela de conexões/configurações corporativas
      try {
        if (user?.id) {
          await supabase.from('b2b_connections').upsert({
            user_id: user.id,
            tenant_id: tenantId,
            provider: 'company_registration',
            key_ciphertext: JSON.stringify(companyDetails),
            connected_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('Persistência em b2b_connections:', err);
      }

      // Persiste no cache local
      try {
        localStorage.setItem(`alliar:company_profile:${tenantId}`, JSON.stringify(companyDetails));
      } catch {}

      // 3. Dispara o e-mail automático de boas-vindas personalizado
      if (user?.email) {
        const emailResult = await sendWelcomeEmail({
          to: user.email,
          recipientName: user.email.split('@')[0] || 'Usuário',
          companyName: validName,
          dashboardUrl: `${window.location.origin}/dashboard`,
        });

        if (emailResult.success) {
          setWelcomeEmailSent(true);
          toast.success(`E-mail de boas-vindas enviado para ${user.email}!`, {
            description: 'Verifique sua caixa de entrada com os dados de acesso.',
          });
        }
      }

      toast.success('Empresa cadastrada com sucesso!');
      setStep('mode');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível cadastrar a empresa');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectMode(selectedMode: 'solo' | 'equipe') {
    setMode(selectedMode);
    if (createdTenantId) {
      try {
        await supabase.from('tenant_settings').update({ structure: selectedMode }).eq('tenant_id', createdTenantId);
      } catch {}
    }
    if (selectedMode === 'equipe') {
      setStep('invite');
    } else {
      setStep('api_setup');
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !createdTenantId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('tenant_invitations').insert({
        tenant_id: createdTenantId,
        email: inviteEmail.trim().toLowerCase(),
      }).select('token').single();
      if (error) throw error;

      const link = `${window.location.origin}/convite?token=${data.token}`;
      setInviteLink(link);
      setInviteSent((prev) => [...prev, inviteEmail.trim()]);
      setInviteEmail('');
      toast.success(`Convite enviado para ${inviteEmail.trim()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar o convite');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveApiStep() {
    if (!user || !createdTenantId) {
      await finishOnboarding();
      return;
    }

    setBusy(true);
    try {
      const keysToSave: Record<string, string> = {};
      if (aiKey.trim()) {
        if (aiProvider === 'gemini') keysToSave['geminiKey'] = aiKey.trim();
        else if (aiProvider === 'openai') keysToSave['openaiKey'] = aiKey.trim();
        else if (aiProvider === 'groq') keysToSave['groqKey'] = aiKey.trim();
      }
      if (b2bKey.trim()) {
        if (b2bProvider === 'google') keysToSave['googlePlacesKey'] = b2bKey.trim();
        else if (b2bProvider === 'apollo') keysToSave['apolloKey'] = b2bKey.trim();
      }

      if (Object.keys(keysToSave).length > 0) {
        await saveUserApiKeys(user.id, createdTenantId, keysToSave);
        toast.success('Chaves de API configuradas com sucesso!');
      }
    } catch (e) {
      console.warn('Erro ao salvar chaves no onboarding:', e);
    } finally {
      setBusy(false);
      await finishOnboarding();
    }
  }

  async function finishOnboarding() {
    if (createdTenantId) {
      await query.invalidateQueries({ queryKey: ['tenants', user?.id] });
      app.switchTenant(createdTenantId);
    }
  }

  // === TELA DE ACEITAR CONVITE ===
  const [showInviteAccept, setShowInviteAccept] = useState(false);

  if (showInviteAccept) {
    return (
      <div className="mx-auto max-w-md py-16 space-y-6">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 mb-4">
            <Users className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Entrar em uma equipe</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cole o link ou código de convite que você recebeu do administrador da empresa.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            try {
              const f = new FormData(e.currentTarget);
              const raw = String(f.get('token')).trim();
              const token = raw.includes('token=') ? new URL(raw).searchParams.get('token') : raw;
              const { data, error } = await supabase.rpc('accept_invitation', { invite_token: token ?? '' });
              if (error) throw error;
              await query.invalidateQueries({ queryKey: ['tenants', user?.id] });
              if (data) app.switchTenant(data);
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Convite inválido ou destinado a outro e-mail');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input name="token" required placeholder="Cole o link ou código do convite aqui" className="text-sm" />
          <Button disabled={busy} className="w-full">
            <CheckCircle2 className="size-4 mr-2" />
            Aceitar convite
          </Button>
        </form>

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShowInviteAccept(false)}>
          ← Voltar e criar minha empresa
        </Button>
        <p role="status" className="text-sm text-destructive text-center">{message}</p>
      </div>
    );
  }

  // === ETAPA 1: CADASTRO OBRIGATÓRIO DA EMPRESA (PÓS-LOGIN) ===
  if (step === 'company_form') {
    return (
      <div className="mx-auto max-w-xl py-10 space-y-6 animate-in fade-in duration-200">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 mb-4 shadow-sm">
            <Building2 className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cadastro Obrigatório da Empresa</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Bem-vindo(a) ao <strong>[ALLIAR CRM]</strong>! Complete o cadastro da sua empresa para liberar seu ambiente e ativar o envio automático do e-mail de boas-vindas.
          </p>
        </div>

        {/* Barra de progresso */}
        <div className="flex gap-1.5">
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
        </div>

        <form onSubmit={handleCompanyRegistration} className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
          {/* Nome da Empresa */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Nome da Empresa <span className="text-destructive">*</span>
            </label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              maxLength={120}
              placeholder="Ex: Prime Tech Soluções Corporativas Ltda"
              className="text-sm"
            />
          </div>

          {/* CNPJ com Máscara */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              CNPJ <span className="text-muted-foreground font-normal">(com máscara automática)</span>
            </label>
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(maskCnpj(e.target.value))}
              placeholder="00.000.000/0001-00"
              maxLength={18}
              className="text-sm font-mono"
            />
          </div>

          {/* Dados Gerais: Segmento e Endereço */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Segmento / Ramo de Atuação
              </label>
              <Input
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="Ex: Saúde, Tecnologia, Varejo, Consultoria..."
                maxLength={120}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Endereço Geral (Cidade / UF)
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP"
                maxLength={200}
                className="text-sm"
              />
            </div>
          </div>

          {/* Faturamento, Funcionários e Quantidade de Usuários */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Faturamento Mensal
              </label>
              <select
                value={monthlyRevenue}
                onChange={(e) => setMonthlyRevenue(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                value={totalEmployees}
                onChange={(e) => setTotalEmployees(e.target.value.replace(/\D/g, ''))}
                type="number"
                min={1}
                placeholder="Ex: 15"
                className="text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Usuários no CRM
              </label>
              <Input
                value={userCount}
                onChange={(e) => setUserCount(e.target.value.replace(/\D/g, ''))}
                type="number"
                min={1}
                placeholder="Ex: 5"
                className="text-sm"
              />
            </div>
          </div>

          {/* Aviso sobre E-mail de Boas-Vindas */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3">
            <Mail className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">E-mail de boas-vindas automático:</strong> Ao concluir o cadastro, um e-mail oficial personalizado do <strong>[ALLIAR CRM]</strong> será enviado para <strong>{user?.email}</strong> contendo o link de acesso direto ao seu painel.
            </div>
          </div>

          <Button disabled={busy || !companyName.trim()} className="w-full gap-2 text-sm font-semibold h-11">
            {busy ? 'Salvando e Cadastrando…' : 'Concluir Cadastro da Empresa & Continuar'}
            <ArrowRight className="size-4" />
          </Button>

          {message && (
            <p role="status" className="text-sm text-destructive text-center font-medium">
              {message}
            </p>
          )}
        </form>

        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground text-center mb-2">Já foi convidado por outra empresa?</p>
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowInviteAccept(true)}>
            <Link2 className="size-3.5 mr-1.5" />
            Aceitar convite de equipe existente
          </Button>
        </div>
      </div>
    );
  }

  // === ETAPA 2: QUESTIONÁRIO — SOLO OU EQUIPE ===
  if (step === 'mode') {
    return (
      <div className="mx-auto max-w-lg py-14 space-y-6 animate-in fade-in duration-200">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Como você vai trabalhar?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escolha o formato inicial de operação para <strong>{companyName}</strong>. Você pode alterar quando quiser nas Configurações.
          </p>
        </div>

        {/* Barra de progresso */}
        <div className="flex gap-1.5">
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* MODO SOLO */}
          <button
            onClick={() => handleSelectMode('solo')}
            className={cn(
              "rounded-xl border-2 bg-card p-6 text-left space-y-3 transition-all hover:border-primary/50 hover:shadow-md",
              "border-muted"
            )}
          >
            <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10">
              <User className="size-6 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Modo Solo</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Trabalho sozinho(a). Tela limpa e produtiva, sem distribuição de leads.
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-blue-500" /> Funil pessoal direto</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-blue-500" /> Foco em velocidade de fechamento</li>
            </ul>
          </button>

          {/* MODO EQUIPE */}
          <button
            onClick={() => handleSelectMode('equipe')}
            className={cn(
              "rounded-xl border-2 bg-card p-6 text-left space-y-3 transition-all hover:border-primary/50 hover:shadow-md",
              "border-muted"
            )}
          >
            <div className="grid size-12 place-items-center rounded-xl bg-emerald-500/10">
              <Users className="size-6 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Modo Equipe</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Tenho equipe comercial. Distribuição round-robin, metas e convites.
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-emerald-500" /> Distribuição automática Anti-Vácuo</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-emerald-500" /> Convites de vendedores</li>
            </ul>
          </button>
        </div>
      </div>
    );
  }

  // === ETAPA 3: CONVITE DE COLABORADORES ===
  if (step === 'invite') {
    return (
      <div className="mx-auto max-w-md py-14 space-y-6 animate-in fade-in duration-200">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/10 mb-4">
            <Users className="size-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold">Convide sua equipe</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Adicione colaboradores por e-mail para acessar <strong>{companyName}</strong>.
          </p>
        </div>

        {/* Barra de progresso */}
        <div className="flex gap-1.5">
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
        </div>

        <form className="flex gap-2" onSubmit={handleSendInvite}>
          <Input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            type="email"
            placeholder="vendedor@empresa.com"
            className="text-sm"
          />
          <Button disabled={busy || !inviteEmail.trim()} className="shrink-0 gap-1.5">
            <Send className="size-3.5" />
            Convidar
          </Button>
        </form>

        {inviteLink && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold">Link de convite:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 rounded border bg-background px-2 py-1 text-xs font-mono truncate"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteLink);
                  toast.success('Link copiado!');
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {inviteSent.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Convites enviados:</p>
            {inviteSent.map((email) => (
              <div key={email} className="flex items-center gap-2 rounded-md border bg-emerald-500/5 p-2 text-xs">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span>{email}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => setStep('api_setup')}>
            Pular por agora
          </Button>
          <Button className="flex-1 gap-2" onClick={() => setStep('api_setup')}>
            Próximo: Conectar APIs <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  // === ETAPA 4: BRING YOUR OWN API (BYOK) ===
  if (step === 'api_setup') {
    return (
      <div className="mx-auto max-w-lg py-12 space-y-6 animate-in fade-in duration-200">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 mb-4">
            <Key className="size-8 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold">Conecte suas APIs</h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              Opcional
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Turbine o CRM com Inteligência Artificial e Prospecção B2B (Google Maps). Se preferir, comece com as opções gratuitas nativas e adicione chaves depois.
          </p>
        </div>

        {/* Barra de progresso */}
        <div className="flex gap-1.5">
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
        </div>

        {/* CARD 1: IA */}
        <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-purple-500" />
              <h2 className="text-sm font-semibold">Inteligência Artificial (Copiloto)</h2>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              Camada Grátis
            </span>
          </div>

          <div className="flex rounded-lg border bg-muted/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => setAiProvider('gemini')}
              className={cn(
                'flex-1 py-1.5 rounded-md font-medium transition-all',
                aiProvider === 'gemini' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              )}
            >
              Google Gemini (Grátis)
            </button>
            <button
              type="button"
              onClick={() => setAiProvider('openai')}
              className={cn(
                'flex-1 py-1.5 rounded-md font-medium transition-all',
                aiProvider === 'openai' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              )}
            >
              OpenAI ChatGPT
            </button>
            <button
              type="button"
              onClick={() => setAiProvider('groq')}
              className={cn(
                'flex-1 py-1.5 rounded-md font-medium transition-all',
                aiProvider === 'groq' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              )}
            >
              Groq Cloud
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              {aiProvider === 'gemini'
                ? 'Chave do Google AI Studio (Gemini)'
                : aiProvider === 'openai'
                ? 'Chave de API OpenAI (sk-...)'
                : 'Chave de API Groq (gsk_...)'}
            </label>
            <Input
              type="password"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={aiProvider === 'gemini' ? 'AIzaSy...' : aiProvider === 'openai' ? 'sk-proj-...' : 'gsk_...'}
              className="text-xs font-mono"
            />
          </div>
        </div>

        {/* CARD 2: B2B */}
        <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-blue-500" />
              <h2 className="text-sm font-semibold">Prospecção B2B & Google Maps</h2>
            </div>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
              Opcional
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Chave Google Places API (Google Cloud)
            </label>
            <Input
              type="password"
              value={b2bKey}
              onChange={(e) => setB2bKey(e.target.value)}
              placeholder="AIzaSy..."
              className="text-xs font-mono"
            />
          </div>

          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-800 dark:text-emerald-300">
            ✅ <strong>Consulta oficial da Receita Federal inclusa:</strong> Busca por CNPJ e dados cadastrais via BrasilAPI já está ativa e 100% gratuita por padrão.
          </div>
        </div>

        {/* AÇÕES DE CONCLUSÃO */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={finishOnboarding}>
            Acessar Painel Agora (Pular APIs)
          </Button>
          <Button className="flex-1 gap-2" disabled={busy} onClick={handleSaveApiStep}>
            {busy ? 'Salvando…' : 'Salvar e Acessar CRM'} <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
