import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  if (msg.includes('missing OAuth secret') || msg.includes('validation_failed')) {
    return 'O login com Google precisa ter o Client ID e Secret configurados no painel do Supabase. Enquanto isso, use o login com E-mail e Senha.';
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
    <div className="grid min-h-screen place-items-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <span className="text-primary text-sm font-semibold tracking-wider">ALLIAR CRM</span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {mode === 'signup' ? 'Crie sua conta' : mode === 'forgot' ? 'Recuperar senha' : 'Faça login na Alliar'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Seu espaço de vendas com WhatsApp e CRM Prime.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <label className="block text-sm font-medium">
              Seu nome completo
              <Input name="name" required maxLength={120} autoComplete="name" placeholder="Ex: Lucas Silva" className="mt-1.5 rounded-xl" />
            </label>
          )}

          <label className="block text-sm font-medium">
            E-mail
            <Input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="seu@email.com" className="mt-1.5 rounded-xl" />
          </label>

          {mode !== 'forgot' && (
            <label className="block text-sm font-medium">
              Senha
              <Input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="Mínimo 8 caracteres"
                className="mt-1.5 rounded-xl"
              />
            </label>
          )}

          <Button disabled={busy} className="w-full rounded-xl h-11 text-sm font-semibold shadow-sm" type="submit">
            {busy ? 'Aguarde…' : mode === 'signup' ? 'Criar minha conta' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Entrar na plataforma'}
          </Button>
        </form>

        {message && (
          <div
            role="status"
            className={`p-3 rounded-xl text-sm border ${
              isSuccess
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setMessage('');
            }}
          >
            {mode === 'signup' ? 'Já tenho conta' : 'Criar conta'}
          </Button>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setMode(mode === 'forgot' ? 'login' : 'forgot');
              setMessage('');
            }}
          >
            {mode === 'forgot' ? 'Voltar' : 'Esqueci minha senha'}
          </Button>
        </div>

        <Link to="/auth" className="sr-only">
          Acesso
        </Link>
      </div>
    </div>
  );
}
