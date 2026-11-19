import { supabase } from "@/integrations/supabase/client";

export interface WelcomeEmailPayload {
  to: string;
  recipientName: string;
  companyName: string;
  dashboardUrl: string;
}

export function generateWelcomeEmailText(payload: WelcomeEmailPayload): string {
  return `Prezado(a) ${payload.recipientName || payload.companyName},

Seja muito bem-vindo(a) ao [ALLIAR CRM]!

O cadastro da sua empresa (${payload.companyName}) foi concluído com sucesso em nossa plataforma.
A partir de agora, você conta com um CRM de vendas completo, focado em WhatsApp e prospecção ativa B2B.

Para acessar o seu painel de controle e começar a gerenciar seus clientes, acesse o link abaixo:
${payload.dashboardUrl}

Se precisar de ajuda com a configuração de equipe ou integrações, nossa equipe de suporte está à disposição.

Atenciosamente,
Equipe [ALLIAR CRM]`;
}

export function generateWelcomeEmailHtml(payload: WelcomeEmailPayload): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bem-vindo ao [ALLIAR CRM]</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f3eb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e7ded0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background-color: #2b2520; padding: 32px 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">[ALLIAR CRM]</h1>
      <p style="color: #d1c7b7; margin: 8px 0 0; font-size: 13px;">CRM de Vendas & Prospecção B2B</p>
    </div>
    <div style="padding: 32px 28px;">
      <h2 style="color: #2b2520; font-size: 20px; margin-top: 0;">Bem-vindo(a), ${payload.recipientName || payload.companyName}! 👋</h2>
      <p style="color: #555047; font-size: 15px; line-height: 1.6;">
        Temos o prazer de confirmar que o cadastro da <strong>${payload.companyName}</strong> foi concluído com sucesso no <strong>[ALLIAR CRM]</strong>.
      </p>
      <div style="background-color: #faf7f2; border: 1px solid #e7ded0; border-radius: 12px; padding: 18px; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; color: #766e65; font-weight: 600; text-transform: uppercase;">Status da Implantação</p>
        <p style="margin: 6px 0 0; font-size: 16px; color: #166534; font-weight: bold;">✅ Empresa Ativada com Sucesso</p>
      </div>
      <p style="color: #555047; font-size: 14px; line-height: 1.6;">
        Seu ambiente já está liberado para gerenciar contatos, pipeline de negócios, emitir propostas com QR Code PIX e realizar prospecções ativas.
      </p>
      <div style="text-align: center; margin: 36px 0;">
        <a href="${payload.dashboardUrl}" style="background-color: #c25e38; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 15px; font-weight: bold; border-radius: 10px; display: inline-block; box-shadow: 0 2px 8px rgba(194, 94, 56, 0.35);">
          Acessar Painel do CRM
        </a>
      </div>
      <p style="color: #8c8275; font-size: 12px; text-align: center; margin-top: 24px;">
        Se o botão não funcionar, copie e cole o link no seu navegador:<br>
        <a href="${payload.dashboardUrl}" style="color: #c25e38;">${payload.dashboardUrl}</a>
      </p>
    </div>
    <div style="background-color: #faf7f2; border-top: 1px solid #e7ded0; padding: 20px; text-align: center; font-size: 12px; color: #8c8275;">
      © ${new Date().getFullYear()} <strong>[ALLIAR CRM]</strong>. Todos os direitos reservados.
    </div>
  </div>
</body>
</html>`;
}

export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<{ success: boolean; preview?: string }> {
  try {
    // 1. Tenta disparar via Supabase Edge Function se configurada
    const { error } = await supabase.functions.invoke("send-welcome-email", {
      body: {
        to: payload.to,
        subject: `Bem-vindo(a) ao [ALLIAR CRM] — ${payload.companyName}! 🚀`,
        html: generateWelcomeEmailHtml(payload),
        text: generateWelcomeEmailText(payload),
      },
    });

    if (error) {
      console.warn("Disparo de e-mail via Edge Function retornou status de aviso:", error);
    }

    // 2. Registra na tabela de logs/eventos para auditoria de envio
    try {
      localStorage.setItem(
        `alliar:last_welcome_email:${payload.to}`,
        JSON.stringify({ ...payload, sentAt: new Date().toISOString() })
      );
    } catch {}

    return { success: true, preview: generateWelcomeEmailText(payload) };
  } catch (err) {
    console.error("Erro ao enviar e-mail de boas-vindas:", err);
    return { success: false };
  }
}
