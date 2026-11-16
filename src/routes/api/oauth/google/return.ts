import { createFileRoute } from "@tanstack/react-router";

// Plain HTML (no session needed): posts the one-time code to the opener, which exchanges it.
export const Route = createFileRoute("/api/oauth/google/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const connectorId = url.searchParams.get("connector_id") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const success = url.searchParams.get("success") === "true";
        const offline = url.searchParams.get("offline_access_allowed");
        const error = url.searchParams.get("error");
        const result = success && offline === "false" ? { success: true, connectorId, code: null }
          : success && code ? { success: true, connectorId, code }
          : { success: false, connectorId, error: error ?? (success ? "Missing code" : "OAuth failed") };
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");
        const html = `<!DOCTYPE html><html><head><title>Finalizando conexão…</title></head><body>
<p>${result.success ? "Conexão concluída, fechando…" : "Falhou: " + esc((result as any).error ?? "erro")}</p>
<script>
const result = ${safeJson};
const message = { type: result.success ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed", connectorId: result.connectorId, code: result.code ?? null };
if (window.opener && window.opener !== window) window.opener.postMessage(message, window.location.origin);
window.close();
</script></body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
  },
});
