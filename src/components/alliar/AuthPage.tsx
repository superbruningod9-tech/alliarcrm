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
    <div className="relative min-h-screen w-full flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8 overflow-hidden bg-black text-white selection:bg-[#0066CC]/30 font-sans">
      {/* VÍDEO CINEMATOGRÁFICO DE FUNDO (ARQUITETURA & LUXO CORPORATIVO EM ALTA DEFINIÇÃO) */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none scale-105 transition-opacity duration-1000"
        src="https://assets.mixkit.co/videos/preview/mixkit-set-of-plateaus-seen-from-the-sky-in-a-sunset-26070-large.mp4"
      />

      {/* OVERLAY GLASSMORPHISM / CONTRASTE CINEMATOGRÁFICO */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black/85 via-black/60 to-black/75 backdrop-blur-[2px] z-10" />

      {/* CONTEÚDO PRINCIPAL (ELEVADO SOBRE O VÍDEO) */}
      <div className="relative z-20 mx-auto w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        
        {/* COLUNA ESQUERDA: APRESENTAÇÃO EDITORIAL DE ALTO PADRÃO */}
        <div className="lg:col-span-7 space-y-7 pr-0 lg:pr-8">
          {/* BADGE DA MARCA */}
          <div className="inline-flex items-center gap-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 text-xs font-semibold tracking-wide text-zinc-200 shadow-xl">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="uppercase text-[11px] tracking-wider font-mono">Alliar Prime · Private Edition</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08]">
              Arquitetura de vendas para operações de{' '}
              <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                alto impacto.
              </span>
            </h1>
            <p className="text-base sm:text-lg text-zinc-300/90 leading-relaxed max-w-xl font-normal">
              Controle absoluto do seu fluxo comercial no WhatsApp, prospecção ativa de empresas reais e emissão ágil de propostas com inteligência integrada.
            </p>
          </div>

          {/* BENEFÍCIOS REFINADOS EM VIDRO TRANSLÚCIDO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-md p-4 shadow-2xl space-y-2 transition-all hover:bg-white/[0.12] hover:border-white/30">
              <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                <div className="size-8 rounded-xl bg-sky-500/20 border border-sky-400/30 grid place-items-center">
                  <MessageCircle className="size-4 text-sky-300" />
                </div>
                <span>WhatsApp Sem Vácuo</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Roteamento e distribuição imediata com teleprompter inteligente de IA.
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-md p-4 shadow-2xl space-y-2 transition-all hover:bg-white/[0.12] hover:border-white/30">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <div className="size-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 grid place-items-center">
                  <QrCode className="size-4 text-emerald-300" />
                </div>
                <span>Propostas com PIX</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Radar de leitura em tempo real e fechamento automático ao pagar.
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-md p-4 shadow-2xl space-y-2 transition-all hover:bg-white/[0.12] hover:border-white/30">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                <div className="size-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 grid place-items-center">
                  <Compass className="size-4 text-indigo-300" />
                </div>
                <span>Motor de Descoberta B2B</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Empresas no mapa por geolocalização e consulta direta na Receita.
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-md p-4 shadow-2xl space-y-2 transition-all hover:bg-white/[0.12] hover:border-white/30">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <div className="size-8 rounded-xl bg-amber-500/20 border border-amber-400/30 grid place-items-center">
                  <TrendingUp className="size-4 text-amber-300" />
                </div>
                <span>Pipeline Estratégico</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Visão executiva de receita projetada e temperatura de cada negociação.
              </p>
            </div>
          </div>

          {/* SELO DE QUALIDADE */}
          <div className="flex items-center gap-3 pt-2 text-xs text-zinc-400">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
            <span>Infraestrutura corporativa segura com criptografia ponta a ponta.</span>
          </div>
        </div>

        {/* COLUNA DIREITA: CARD DE LOGIN DE LUXO EM VIDRO ACETINADO */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-white/20 bg-white/[0.08] backdrop-blur-xl p-7 sm:p-9 shadow-2xl shadow-black/80 space-y-6">
            
            {/* CABEÇALHO DO FORMULÁRIO */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-400 font-mono">
                  ALLIAR · PORTAL
                </span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-200 border border-white/10">
                  {mode === 'signup' ? 'Novo Cadastro' : 'Acesso Seguro'}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {mode === 'signup'
                  ? 'Criar Acesso Corporativo'
                  : mode === 'forgot'
                  ? 'Recuperar Acesso'
                  : 'Entrar no Sistema'}
              </h2>
              <p className="text-xs text-zinc-300/80">
                {mode === 'signup'
                  ? 'Inicie seu cockpit comercial em segundos.'
                  : 'Insira suas credenciais corporativas para prosseguir.'}
              </p>
            </div>

            {/* ABAS RÁPIDAS ENTRAR / CRIAR CONTA */}
            {mode !== 'forgot' && (
              <div className="flex rounded-xl border border-white/15 bg-black/40 p-1 text-xs backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setMessage('');
                  }}
                  className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
                    mode === 'login'
                      ? 'bg-white text-zinc-950 shadow-md'
                      : 'text-zinc-400 hover:text-white'
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
                  className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
                    mode === 'signup'
                      ? 'bg-white text-zinc-950 shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Cadastrar
                </button>
              </div>
            )}

            {/* FORMULÁRIO DE ENTRADA */}
            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-200">
                    Nome Completo ou Razão
                  </label>
                  <Input
                    name="name"
                    required
                    placeholder="Ex: Carlos Eduardo"
                    className="rounded-xl h-11 bg-black/40 border-white/20 text-white placeholder:text-zinc-500 focus:border-sky-400 focus:ring-sky-400/20 text-sm"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-200">
                  E-mail de Trabalho
                </label>
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  className="rounded-xl h-11 bg-black/40 border-white/20 text-white placeholder:text-zinc-500 focus:border-sky-400 focus:ring-sky-400/20 text-sm"
                />
              </div>

              {mode !== 'forgot' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200">
                      Chave de Acesso
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setMessage('');
                        }}
                        className="text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        Esqueci a senha
                      </button>
                    )}
                  </div>
                  <Input
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder="Mínimo 8 caracteres"
                    className="rounded-xl h-11 bg-black/40 border-white/20 text-white placeholder:text-zinc-500 focus:border-sky-400 focus:ring-sky-400/20 text-sm"
                  />
                </div>
              )}

              {/* BOTÃO PRINCIPAL COM DESTAQUE LUMINOSO */}
              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-xl h-11 text-sm font-bold text-white bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition-all shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {busy ? (
                  'Validando credenciais…'
                ) : mode === 'signup' ? (
                  <>
                    Iniciar Operação <ArrowRight className="size-4" />
                  </>
                ) : mode === 'forgot' ? (
                  'Enviar Redefinição'
                ) : (
                  <>
                    Acessar Plataforma <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </form>

            {message && (
              <div
                role="status"
                className={`p-3.5 rounded-xl text-xs leading-relaxed border backdrop-blur-sm ${
                  isSuccess
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-red-500/20 border-red-400/40 text-red-200'
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
                  className="text-xs font-medium text-zinc-400 hover:text-white underline transition-colors"
                >
                  ← Voltar ao login principal
                </button>
              </div>
            )}

            <div className="border-t border-white/10 pt-4 text-center">
              <p className="text-[11px] text-zinc-400">
                Alliar CRM Enterprise · Conectado com segurança.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
