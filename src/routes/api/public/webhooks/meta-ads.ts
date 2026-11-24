import { createFileRoute } from "@tanstack/react-router";
import { processMetaAdsWebhook, loadIntegrationSettings } from "@/lib/integrations";
import { jsonSuccess, validateWebhook, getTenantId } from "@/middleware/webhookSecurity";
import { z } from "zod";

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
        const schema = z.object({ entry: z.any() }).passthrough();
        const { valid, error, data } = await validateWebhook(request, schema);
        if (!valid) return error;

        const tenantId = getTenantId(request);
        const body = data as any;
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

        return jsonSuccess({ status: "success", result });
      },
    },
  },
});
