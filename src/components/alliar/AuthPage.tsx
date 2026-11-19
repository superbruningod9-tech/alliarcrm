import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  MessageCircle,
  PhoneCall,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Zap,
  Users,
  Compass,
} from 'lucide-react';

function formatAuthError(err: unknown): string {
  if (!(err instanceof Error)) return 'Ocorreu um erro. Tente novamente.';
  const msg = err.message;
  if (msg.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique o link de ativação que enviamos para sua caixa de entrada (e pasta de spam).';
  }
  if (msg.includes('User already registered')) {
    return 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.';
  }
  if (msg.includes('Password is known to be weak') || msg.includes('weak_password')) {
    return 'A senha escolhida é fraca ou comum. Crie uma senha mais forte com letras maiúsculas, números e símbolos.';
  }
  if (msg.includes('Password should be at least')) {
    return 'A senha deve conter no mínimo 8 caracteres.';
  }
  if (msg.includes('rate limit')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  return msg;
}

export function AuthPage() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (ready && user) void nav({ to: '/dashboard', replace: true });
  }, [ready, user, nav]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setIsSuccess(false);
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email')).trim();
    const password = String(f.get('password'));

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        });
        if (error) throw error;
        setIsSuccess(true);
        setMessage('Se houver uma conta com esse e-mail, enviamos as instruções para redefinir sua senha.');
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + '/auth',
            data: { display_name: String(f.get('name')) },
          },
        });
        if (error) throw error;
        setIsSuccess(true);
        setMessage('Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail. Por favor, confirme seu e-mail antes de fazer login.');
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await nav({ to: '/dashboard' });
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F3EB] text-[#2B2520] flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8 selection:bg-[#C25E38]/20">
      <div className="mx-auto w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* COLUNA ESQUERDA: APRESENTAÇÃO UX / HERO EXPLICATIVO DO CRM */}
        <div className="lg:col-span-7 space-y-6 pr-0 lg:pr-6">
          {/* BADGE DA MARCA */}
          <div className="inline-flex items-center gap-2 rounded-full bg-[#EFE8DC] border border-[#E0D5C3] px-3.5 py-1 text-xs font-semibold text-[#8C4325] shadow-2xs">
            <Sparkles className="size-3.5 text-[#C25E38]" />
            <span>Alliar CRM Prime · Vendas WhatsApp-First</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#2B2520] leading-[1.15]">
              O CRM definitivo para quem fecha negócios no{' '}
              <span className="text-[#C25E38] underline decoration-[#C25E38]/30 underline-offset-4">
                WhatsApp
              </span>
            </h1>
            <p className="text-base sm:text-lg text-[#6E6458] leading-relaxed max-w-xl">
              Gerencie seus contatos, evite o vácuo com distribuição automática, emita propostas com QR Code PIX e prospere clientes B2B reais em uma única tela.
            </p>
          </div>

          {/* BENEFÍCIOS UX EM DESTAQUE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="rounded-2xl border border-[#E7DED0] bg-[#FFFDF9]/90 p-4 shadow-xs space-y-1.5 transition-all hover:border-[#C25E38]/40 hover:shadow-sm">
              <div className="flex items-center gap-2 text-[#C25E38] font-bold text-sm">
                <div className="size-7 rounded-lg bg-[#C25E38]/10 grid place-items-center">
                  <MessageCircle className="size-4 text-[#C25E38]" />
                </div>
                <span>WhatsApp sem Vácuo</span>
              </div>
              <p className="text-xs text-[#6E6458] leading-relaxed">
                Distribuição round-robin inteligente (SLA de 5min) para nenhum lead esfriar sem atendimento.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7DED0] bg-[#FFFDF9]/90 p-4 shadow-xs space-y-1.5 transition-all hover:border-[#C25E38]/40 hover:shadow-sm">
              <div className="flex items-center gap-2 text-[#166534] font-bold text-sm">
                <div className="size-7 rounded-lg bg-[#166534]/10 grid place-items-center">
                  <QrCode className="size-4 text-[#166534]" />
                </div>
                <span>Propostas & PIX Imediato</span>
              </div>
              <p className="text-xs text-[#6E6458] leading-relaxed">
                Gere links de proposta com radar de visualização em tempo real e chave PIX automática.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7DED0] bg-[#FFFDF9]/90 p-4 shadow-xs space-y-1.5 transition-all hover:border-[#C25E38]/40 hover:shadow-sm">
              <div className="flex items-center gap-2 text-[#1E40AF] font-bold text-sm">
                <div className="size-7 rounded-lg bg-[#1E40AF]/10 grid place-items-center">
                  <Compass className="size-4 text-[#1E40AF]" />
                </div>
                <span>Prospecção Ativa B2B</span>
              </div>
              <p className="text-xs text-[#6E6458] leading-relaxed">
                Busca de empresas reais por CNPJ oficial na Receita Federal e estabelecimentos no Google Maps.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7DED0] bg-[#FFFDF9]/90 p-4 shadow-xs space-y-1.5 transition-all hover:border-[#C25E38]/40 hover:shadow-sm">
              <div className="flex items-center gap-2 text-[#9A3412] font-bold text-sm">
                <div className="size-7 rounded-lg bg-[#9A3412]/10 grid place-items-center">
                  <TrendingUp className="size-4 text-[#9A3412]" />
                </div>
                <span>Funil Visual & Metas</span>
              </div>
              <p className="text-xs text-[#6E6458] leading-relaxed">
                Kanban dinâmico com temperatura de leads (quente, morno, frio) e controle de follow-up.
              </p>
            </div>
          </div>

          {/* SOCIAL PROOF / BADGE DE CONFIANÇA */}
          <div className="flex items-center gap-3 pt-2 text-xs text-[#7A6F62]">
            <div className="flex -space-x-1.5">
              <div className="size-6 rounded-full bg-[#C25E38] text-white text-[10px] font-bold grid place-items-center border-2 border-[#F7F3EB]">A</div>
              <div className="size-6 rounded-full bg-[#166534] text-white text-[10px] font-bold grid place-items-center border-2 border-[#F7F3EB]">P</div>
              <div className="size-6 rounded-full bg-[#1E40AF] text-white text-[10px] font-bold grid place-items-center border-2 border-[#F7F3EB]">C</div>
            </div>
            <span>Junte-se a centenas de empresas que aceleraram suas vendas comerciais.</span>
          </div>
        </div>

        {/* COLUNA DIREITA: CARD DE LOGIN / CADASTRO UX EM TONS BEGE */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-[#E0D5C3] bg-[#FFFDF9] p-6 sm:p-8 shadow-xl shadow-stone-900/5 space-y-6">
            
            {/* CABEÇALHO DO FORMULÁRIO */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#C25E38]">
                  [ALLIAR CRM]
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#EFE8DC] text-[#7A6F62]">
                  {mode === 'signup' ? 'Novo Acesso' : 'Acesso Seguro'}
                </span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[#2B2520]">
                {mode === 'signup'
                  ? 'Cadastre-se Gratuitamente'
                  : mode === 'forgot'
                  ? 'Recuperar Senha'
                  : 'Entrar na sua Conta'}
              </h2>
              <p className="text-xs text-[#7A6F62]">
                {mode === 'signup'
                  ? 'Crie seu ambiente comercial completo em poucos segundos.'
                  : 'Acesse o painel do seu CRM de vendas com segurança.'}
              </p>
            </div>

            {/* ABAS RÁPIDAS ENTRAR / CRIAR CONTA */}
            {mode !== 'forgot' && (
              <div className="flex rounded-xl border border-[#E0D5C3] bg-[#F7F3EB] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setMessage('');
                  }}
                  className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                    mode === 'login'
                      ? 'bg-[#FFFDF9] shadow-xs text-[#2B2520]'
                      : 'text-[#7A6F62] hover:text-[#2B2520]'
                  }`}
                >
                  Fazer Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setMessage('');
                  }}
                  className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                    mode === 'signup'
                      ? 'bg-[#FFFDF9] shadow-xs text-[#2B2520]'
                      : 'text-[#7A6F62] hover:text-[#2B2520]'
                  }`}
                >
                  Criar Conta
                </button>
              </div>
            )}

            {/* FORMULÁRIO DE ENTRADA */}
            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#554D43] mb-1.5">
                    Seu Nome Completo
                  </label>
                  <Input
                    name="name"
                    required
                    maxLength={120}
                    autoComplete="name"
                    placeholder="Ex: Roberto Alencar"
                    className="rounded-xl h-11 bg-[#FBF9F5] border-[#DED4C5] focus:border-[#C25E38] focus:ring-[#C25E38]/20 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#554D43] mb-1.5">
                  E-mail Corporativo
                </label>
                <Input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="seu@empresa.com"
                  className="rounded-xl h-11 bg-[#FBF9F5] border-[#DED4C5] focus:border-[#C25E38] focus:ring-[#C25E38]/20 text-sm"
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#554D43]">
                      Senha de Acesso
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setMessage('');
                        }}
                        className="text-xs font-medium text-[#C25E38] hover:underline"
                      >
                        Esqueceu a senha?
                      </button>
                    )}
                  </div>
                  <Input
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder="Mínimo de 8 caracteres"
                    className="rounded-xl h-11 bg-[#FBF9F5] border-[#DED4C5] focus:border-[#C25E38] focus:ring-[#C25E38]/20 text-sm"
                  />
                </div>
              )}

              {/* BOTÃO PRINCIPAL COM DESTAQUE TERRACOTA (#C25E38) */}
              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-xl h-11 text-sm font-bold text-white bg-[#C25E38] hover:bg-[#A84F2E] active:scale-[0.99] transition-all shadow-md shadow-[#C25E38]/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {busy ? (
                  'Processando…'
                ) : mode === 'signup' ? (
                  <>
                    Cadastrar e Iniciar <ArrowRight className="size-4" />
                  </>
                ) : mode === 'forgot' ? (
                  'Enviar Link de Recuperação'
                ) : (
                  <>
                    Entrar no Alliar CRM <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </form>

            {message && (
              <div
                role="status"
                className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                  isSuccess
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                {message}
              </div>
            )}

            {mode === 'forgot' && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setMessage('');
                  }}
                  className="text-xs font-medium text-[#7A6F62] hover:text-[#2B2520] underline"
                >
                  ← Voltar para a tela de login
                </button>
              </div>
            )}

            <div className="border-t border-[#EAE2D5] pt-4 text-center">
              <p className="text-[11px] text-[#8C8072]">
                Ao continuar, você concorda com os termos de uso do <strong>[ALLIAR CRM]</strong>.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
