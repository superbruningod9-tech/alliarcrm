/**
 * Proteção dos endpoints públicos de webhook (server-only).
 * Falha FECHADO: sem segredo configurado no servidor, nada é aceito.
 *
 * Variáveis de ambiente (configure no Netlify > Site settings > Environment):
 *  - WEBHOOK_SHARED_SECRET : segredo enviado em `?secret=` ou no header `x-webhook-secret`
 *  - META_WEBHOOK_VERIFY_TOKEN : token de verificação (GET) da Meta (fallback: WEBHOOK_SHARED_SECRET)
 *  - META_APP_SECRET : (opcional) valida a assinatura `X-Hub-Signature-256` da Meta
 */

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/** Comparação em tempo constante para evitar timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const env = (name: string): string => {
  const value = (globalThis as any).process?.env?.[name];
  return typeof value === "string" ? value : "";
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Aceita apenas ids simples de tenant (evita injeção em chaves/queries). */
export function sanitizeTenantId(raw: string | null): string | null {
  const value = (raw || "default").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

export function hasSharedSecret(request: Request): boolean {
  const expected = env("WEBHOOK_SHARED_SECRET");
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = request.headers.get("x-webhook-secret") || url.searchParams.get("secret") || "";
  return safeEqual(provided, expected);
}

async function validSignature(request: Request, rawBody: string): Promise<boolean> {
  const appSecret = env("META_APP_SECRET");
  const header = request.headers.get("x-hub-signature-256");
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(header.slice(7), hex);
}

/**
 * Lê e valida o corpo de um webhook. Retorna `{ response }` se deve ser rejeitado,
 * ou `{ body }` (JSON) se autenticado.
 */
export async function authenticateWebhook(
  request: Request,
  opts: { allowMetaSignature?: boolean } = {},
): Promise<{ response: Response } | { body: any }> {
  if (!env("WEBHOOK_SHARED_SECRET") && !(opts.allowMetaSignature && env("META_APP_SECRET"))) {
    return { response: json({ error: "Webhook não configurado no servidor" }, 503) };
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_WEBHOOK_BODY_BYTES) return { response: json({ error: "Payload muito grande" }, 413) };

  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BODY_BYTES) return { response: json({ error: "Payload muito grande" }, 413) };

  const authorized =
    hasSharedSecret(request) || (opts.allowMetaSignature ? await validSignature(request, raw) : false);
  if (!authorized) return { response: json({ error: "Não autorizado" }, 401) };

  try {
    return { body: raw ? JSON.parse(raw) : {} };
  } catch {
    return { response: json({ error: "JSON inválido" }, 400) };
  }
}

/** Verificação GET da Meta (hub.challenge). */
export function verifyMetaChallenge(request: Request): Response {
  const url = new URL(request.url);
  const expected = env("META_WEBHOOK_VERIFY_TOKEN") || env("WEBHOOK_SHARED_SECRET");
  if (!expected) return json({ error: "Webhook não configurado no servidor" }, 503);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  if (mode === "subscribe" && safeEqual(token, expected)) {
    return new Response(challenge.slice(0, 256), { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}
