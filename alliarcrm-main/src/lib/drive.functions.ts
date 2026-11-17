import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_drive";
const SCOPES = ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/drive.file"];

const Scope = z.object({ tenantId: z.string().uuid(), scope: z.enum(["user", "tenant"]) });
type Ctx = { supabase: any; userId: string };

/** Members may use the company account; only admins may change it. */
async function authorize(ctx: Ctx, tenantId: string, needAdmin: boolean) {
  const { data, error } = await ctx.supabase.rpc(needAdmin ? "is_tenant_admin" : "is_member", { t: tenantId });
  if (error || !data) throw new Error(needAdmin ? "Somente administradores podem alterar a conta da empresa" : "Sem acesso a esta empresa");
}
const owner = (scope: "user" | "tenant", ctx: Ctx, tenantId: string) => (scope === "user" ? ctx.userId : tenantId);

export const driveStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.tenantId, false);
    const { getConnection } = await import("./appUserConnections.server");
    const [p, c] = await Promise.all([getConnection("user", context.userId, CONNECTOR), getConnection("tenant", data.tenantId, CONNECTOR)]);
    return { personal: p ? { email: p.email } : null, company: c ? { email: c.email } : null, active: p ? "personal" : c ? "company" : null };
  });

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Scope.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.tenantId, data.scope === "tenant");
    const clientAPIKey = process.env["GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientAPIKey) throw new Error("Google Drive não está configurado");
    const request = getRequest();
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/google/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: CONNECTOR, appUserId: owner(data.scope, context, data.tenantId),
      clientAPIKey, returnUrl, credentialsConfiguration: { scopes: SCOPES },
    });
    return { authorizationUrl };
  });

export const completeDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Scope.extend({ code: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.tenantId, data.scope === "tenant");
    const { exchangeAppUserOAuthCode, callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== CONNECTOR) throw new Error("Conexão retornou o serviço errado");
    const about = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey, connectorId: CONNECTOR, path: "/drive/v3/about?fields=user(emailAddress)" });
    const email = about.ok ? ((await about.json()) as any)?.user?.emailAddress ?? null : null;
    const { saveConnection } = await import("./appUserConnections.server");
    await saveConnection(data.scope, owner(data.scope, context, data.tenantId), context.userId, CONNECTOR, connectionAPIKey, email);
    return { ok: true, email };
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Scope.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.tenantId, data.scope === "tenant");
    const id = owner(data.scope, context, data.tenantId);
    const { getConnection, deleteConnection } = await import("./appUserConnections.server");
    const conn = await getConnection(data.scope, id, CONNECTOR);
    if (conn) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: conn.key, connectorId: CONNECTOR }).catch((e) => console.error("drive disconnect", e));
      await deleteConnection(data.scope, id, CONNECTOR);
    }
    return { ok: true };
  });

/** Uploads a text file using the seller's own Drive, falling back to the company's shared Drive. */
export const uploadToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid(), name: z.string().min(1).max(200), content: z.string().max(500_000), mimeType: z.string().max(100).default("text/plain") }).parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.tenantId, false);
    const { getConnection } = await import("./appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const personal = await getConnection("user", context.userId, CONNECTOR);
    const conn = personal ?? (await getConnection("tenant", data.tenantId, CONNECTOR));
    if (!conn) return { error: "Conecte um Google Drive (pessoal ou da empresa) em Integrações." };
    const boundary = "alliar" + Math.random().toString(36).slice(2);
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: data.name })}\r\n--${boundary}\r\nContent-Type: ${data.mimeType}; charset=UTF-8\r\n\r\n${data.content}\r\n--${boundary}--`;
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY, connectionAPIKey: conn.key, connectorId: CONNECTOR, requiredScopes: SCOPES,
      path: "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      init: { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    });
    if (await appUserReconnectRequired(res)) return { error: "O acesso ao Google Drive precisa ser renovado. Reconecte em Integrações." };
    if (!res.ok) { const t = await res.text(); console.error("drive upload", res.status, t); return { error: `Falha ao enviar ao Drive (${res.status})` }; }
    const f = (await res.json()) as { id: string; name: string; webViewLink?: string };
    return { error: null, link: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, account: personal ? "pessoal" : "empresa", email: conn.email };
  });
