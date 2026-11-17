import { createFileRoute } from "@tanstack/react-router";
import { processMetaAdsWebhook, loadIntegrationSettings } from "@/lib/integrations";

export const Route = createFileRoute("/api/public/webhooks/meta-ads")({
  server: {
    handlers: {
      // Validação do Webhook pela Meta (Instagram / Facebook)
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const tenantId = url.searchParams.get("t") || "default";

        const settings = loadIntegrationSettings(tenantId);

        if (mode === "subscribe" && token === settings.metaVerifyToken) {
          return new Response(challenge || "OK", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      // Recepção de leads gerados em anúncios
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const tenantId = url.searchParams.get("t") || "default";

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            return new Response("Invalid JSON", { status: 400 });
          }

          // Meta envia estrutura com 'entry'
          const entry = body.entry?.[0];
          const change = entry?.changes?.[0]?.value;

          const leadName = change?.lead_name || body.lead_name || "Lead Anúncio Instagram";
          const leadPhone = change?.phone_number || body.phone_number || body.lead_phone || "";
          const leadEmail = change?.email || body.email || body.lead_email || "";
          const campaignName = change?.campaign_name || body.campaign_name || "Campanha Instagram Ads";
          const adName = change?.ad_name || body.ad_name || "Feed / Stories";
          const formId = change?.form_id || body.form_id || "";

          const result = await processMetaAdsWebhook({
            tenantId,
            leadName,
            leadPhone,
            leadEmail,
            campaignName,
            adName,
            formId,
          });

          return new Response(JSON.stringify({ status: "success", result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
