import { supabase } from "@/integrations/supabase/client";

export type FormField = { name: string; label: string; type: "text" | "email" | "tel" | "textarea" | "checkbox" | "select"; required?: boolean; options?: string[] };
export type FormDefinition = { id: string; slug: string; name: string; fields: FormField[]; created_at: string; updated_at?: string };

export async function listForms(tenantId: string): Promise<FormDefinition[]> {
  const { data, error } = await supabase.from("forms").select("*").eq("tenant_id", tenantId).order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as FormDefinition[];
}

export async function createForm(tenantId: string, name: string, slug: string, fields: FormField[]) {
  const { error } = await supabase.from("forms").insert({ tenant_id: tenantId, name, slug, fields: fields as never });
  if (error) throw error;
}
