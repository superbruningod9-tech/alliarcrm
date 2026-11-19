import { createFileRoute } from "@tanstack/react-router";
import { processMetaAdsWebhook } from "@/lib/integrations";
import {
  authenticateWebhook,
  json,
  sanitizeTenantId,
  verifyMetaChallenge,
} from "@/lib/webhook-security";

const clip = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max);

export const Route = createFileRoute("/api/public/webhooks/meta-ads")({
  server: {
    handlers: {
      // Validação do Webhook pela Meta (Instagram / Facebook)
      GET: async ({ request }) => verifyMetaChallenge(request),

      // Recepção de leads gerados em anúncios (autenticada)
      POST: async ({ request }) => {
        try {
          const tenantId = sanitizeTenantId(new URL(request.url).searchParams.get("t"));
          if (!tenantId) return json({ error: "Parâmetro t inválido" }, 400);

          const auth = await authenticateWebhook(request, { allowMetaSignature: true });
          if ("response" in auth) return auth.response;
          const body = auth.body ?? {};

          const entry = body.entry?.[0];
          const change = entry?.changes?.[0]?.value;

          const result = await processMetaAdsWebhook({
            tenantId,
            leadName: clip(change?.lead_name || body.lead_name) || "Lead Anúncio Instagram",
            leadPhone: clip(change?.phone_number || body.phone_number || body.lead_phone, 40),
            leadEmail: clip(change?.email || body.email || body.lead_email, 200),
            campaignName: clip(change?.campaign_name || body.campaign_name) || "Campanha Instagram Ads",
            adName: clip(change?.ad_name || body.ad_name) || "Feed / Stories",
            formId: clip(change?.form_id || body.form_id, 100),
          });

          return json({ status: "success", result });
        } catch (err) {
          console.error("[meta-ads webhook]", err);
          return json({ error: "Erro interno" }, 500);
        }
      },
    },
  },
});
