import { createFileRoute } from "@tanstack/react-router";
import { jsonSuccess, validateWebhook, getTenantId } from "@/middleware/webhookSecurity";
import { z } from "zod";

export const Route = createFileRoute("/api/public/webhooks/payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const tenantId = url.searchParams.get("t") || "default";
          const queryGateway = (url.searchParams.get("gateway") || "").toLowerCase();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Detecta gateway e normaliza payload
          let gateway: "kiwify" | "hotmart" | "asaas" | "stripe" | "mercadopago" = "kiwify";
          let customerName = "Cliente";
          let customerPhone = "";
          let customerEmail = "";
          let amount = 0;
          let orderId = `ord_${Date.now()}`;
          let paymentMethod = "PIX";

          if (queryGateway === "hotmart" || body.event === "PURCHASE_APPROVED" || body.data?.buyer) {
            gateway = "hotmart";
            customerName = body.data?.buyer?.name || body.buyer?.name || "Comprador Hotmart";
            customerEmail = body.data?.buyer?.email || body.buyer?.email || "";
            customerPhone = body.data?.buyer?.checkout_phone || body.buyer?.phone || "";
            amount = Number(body.data?.purchase?.price?.value || body.purchase?.price || 0);
            orderId = body.data?.purchase?.transaction || body.purchase?.transaction || orderId;
            paymentMethod = body.data?.purchase?.payment_type || "PIX";
          } else if (queryGateway === "asaas" || body.event === "PAYMENT_RECEIVED" || body.payment?.customer) {
            gateway = "asaas";
            customerName = body.payment?.customerName || body.customer?.name || "Cliente Asaas";
            customerEmail = body.payment?.customerEmail || body.customer?.email || "";
            customerPhone = body.payment?.customerPhone || body.customer?.mobilePhone || "";
            amount = Number(body.payment?.value || body.payment?.netValue || 0);
            orderId = body.payment?.id || orderId;
            paymentMethod = body.payment?.billingType || "PIX";
          } else if (queryGateway === "stripe" || body.type?.startsWith("payment_intent") || body.type?.startsWith("checkout")) {
            gateway = "stripe";
            const obj = body.data?.object || {};
            customerName = obj.customer_details?.name || obj.billing_details?.name || "Cliente Stripe";
            customerEmail = obj.customer_details?.email || obj.billing_details?.email || "";
            customerPhone = obj.customer_details?.phone || "";
            amount = Number((obj.amount || obj.amount_total || 0) / 100);
            orderId = obj.id || orderId;
            paymentMethod = "Cartão / Stripe";
          } else if (queryGateway === "mercadopago" || body.action?.startsWith("payment") || body.type === "payment") {
            gateway = "mercadopago";
            customerName = body.data?.payer?.first_name ? `${body.data.payer.first_name} ${body.data.payer.last_name || ""}` : "Cliente Mercado Pago";
            customerEmail = body.data?.payer?.email || "";
            customerPhone = body.data?.payer?.phone?.number || "";
            amount = Number(body.data?.transaction_amount || 0);
            orderId = body.data?.id || orderId;
            paymentMethod = "PIX / Mercado Pago";
          } else {
            // Default: Kiwify
            gateway = "kiwify";
            customerName = body.customer?.full_name || body.customer?.name || "Cliente Kiwify";
            customerEmail = body.customer?.email || "";
            customerPhone = body.customer?.mobile || "";
            amount = Number(body.order_amount || body.commissions?.my_commission || 0) / (body.order_amount > 10000 ? 100 : 1);
            orderId = body.order_id || orderId;
            paymentMethod = body.payment_method || "PIX";
          }

          const result = await processPaymentWebhook({
            tenantId,
            gateway,
            customerName,
            customerPhone,
            customerEmail,
            amount: amount || 2500,
            orderId,
            paymentMethod,
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
