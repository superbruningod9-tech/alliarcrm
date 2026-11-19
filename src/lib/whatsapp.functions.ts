import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toE164 } from "./whatsapp";

export const waStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (!process.env["WHATSAPP_API_KEY"]) {
      return {
        connected: false,
        number: null as string | null,
        quality: null as string | null,
        error: null as string | null,
        mode: "direct" as const,
      };
    }
    try {
      const { waGateway } = await import("./whatsapp.server");
      const p = await waGateway(
        "/phone_number?fields=display_phone_number,verified_name,quality_rating,platform_type"
      );
      return {
        connected: true,
        number: `${p.display_phone_number ?? ""}${p.verified_name ? ` · ${p.verified_name}` : ""}`,
        quality: p.quality_rating ?? null,
        error: null,
        mode: "meta_api" as const,
      };
    } catch (e) {
      return {
        connected: false,
        number: null,
        quality: null,
        error: e instanceof Error ? e.message : "Erro",
        mode: "direct" as const,
      };
    }
  });

export const waTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { waGateway } = await import("./whatsapp.server");
      const r = await waGateway(
        "/message_templates?fields=name,status,language,components&limit=50"
      );
      return {
        templates: (r.data ?? []).map(
          (t: {
            name: string;
            status: string;
            language: string;
            components: { type: string; text?: string }[];
          }) => ({
            name: t.name,
            status: t.status,
            language: t.language,
            body: t.components?.find((c) => c.type === "BODY")?.text ?? "",
          })
        ) as { name: string; status: string; language: string; body: string }[],
        error: null as string | null,
      };
    } catch (e) {
      return {
        templates: [],
        error: e instanceof Error ? e.message : "Erro",
      };
    }
  });

const SendInput = z.object({
  tenantId: z.string().uuid(),
  leadId: z.string().uuid(),
  text: z.string().trim().max(4000).optional(),
  template: z
    .object({
      name: z.string().max(512),
      language: z.string().max(20),
      params: z.array(z.string().max(500)).max(10),
    })
    .optional(),
});

export const waSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    // Membership check via RLS: the caller must be able to see the lead.
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id,contact_id,contacts(phone,name)")
      .eq("tenant_id", data.tenantId)
      .eq("id", data.leadId)
      .maybeSingle();

    if (error || !lead) return { ok: false, error: "Negócio não encontrado" };
    const rawPhone = lead.contacts?.phone ?? "";
    const phone = toE164(rawPhone);
    if (!phone || phone.length < 10) {
      return { ok: false, error: "O contato não tem telefone válido com DDD cadastrado" };
    }
    if (!data.text && !data.template) return { ok: false, error: "Mensagem vazia" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const messageText = data.template
      ? `[modelo ${data.template.name}] ${data.template.params.join(" · ")}`
      : data.text!;

    const row = {
      tenant_id: data.tenantId,
      lead_id: data.leadId,
      phone,
      direction: "out",
      kind: data.template ? "template" : "text",
      body: messageText,
      sent_by: context.userId,
    };

    const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(
      data.text || ""
    )}`;

    // Try Meta Cloud Gateway if API key is provided
    if (process.env["WHATSAPP_API_KEY"] && process.env["LOVABLE_API_KEY"]) {
      try {
        const { waGateway, processPending } = await import("./whatsapp.server");
        const body = data.template
          ? {
              messaging_product: "whatsapp",
              to: phone,
              type: "template",
              template: {
                name: data.template.name,
                language: { code: data.template.language },
                components: data.template.params.length
                  ? [
                      {
                        type: "body",
                        parameters: data.template.params.map((t) => ({
                          type: "text",
                          text: t,
                        })),
                      },
                    ]
                  : [],
              },
            }
          : {
              messaging_product: "whatsapp",
              to: phone,
              type: "text",
              text: { body: data.text },
            };

        const r = await waGateway("/messages", {
          method: "POST",
          body: JSON.stringify(body),
        });

        await supabaseAdmin.from("whatsapp_messages").insert({
          ...row,
          wa_id: r.messages?.[0]?.id ?? null,
          status: "accepted",
        });

        await supabaseAdmin.from("lead_events").insert({
          tenant_id: data.tenantId,
          lead_id: data.leadId,
          kind: "whatsapp",
          text: `WhatsApp (API): ${messageText}`,
        });

        await supabaseAdmin
          .from("leads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", data.leadId);

        await processPending(10);
        return { ok: true, waUrl, mode: "api", error: null };
      } catch (err) {
        console.warn("Meta API gateway failed, falling back to direct CRM sync:", err);
      }
    }

    // Direct CRM sync: persist directly in Supabase so it appears in the conversation,
    // updates the timeline and customer's last contact date.
    const { error: insErr } = await supabaseAdmin.from("whatsapp_messages").insert({
      ...row,
      status: "delivered",
      error: null,
    });
    if (insErr) {
      console.error("Error inserting whatsapp message:", insErr);
    }

    await supabaseAdmin.from("lead_events").insert({
      tenant_id: data.tenantId,
      lead_id: data.leadId,
      kind: "whatsapp",
      text: `WhatsApp: ${messageText}`,
    });

    await supabaseAdmin
      .from("leads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.leadId);

    return { ok: true, waUrl, mode: "direct", error: null };
  });

const ReceiveInput = z.object({
  tenantId: z.string().uuid(),
  leadId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

export const waReceive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ReceiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id,contacts(phone)")
      .eq("tenant_id", data.tenantId)
      .eq("id", data.leadId)
      .maybeSingle();

    if (error || !lead) return { ok: false, error: "Negócio não encontrado" };
    const phone = toE164(lead.contacts?.phone ?? "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("whatsapp_messages").insert({
      tenant_id: data.tenantId,
      lead_id: data.leadId,
      phone: phone || "55",
      direction: "in",
      kind: "text",
      body: data.text,
      status: "read",
    });

    await supabaseAdmin.from("lead_events").insert({
      tenant_id: data.tenantId,
      lead_id: data.leadId,
      kind: "whatsapp",
      text: `Cliente respondeu no WhatsApp: ${data.text}`,
    });

    await supabaseAdmin
      .from("leads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.leadId);

    return { ok: true, error: null };
  });
