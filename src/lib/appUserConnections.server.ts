import { encryptConnectionKey, decryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

/** "user" = a seller's own account; "tenant" = the company's shared account (owner_id = tenant id). */
export type OwnerKind = "user" | "tenant";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function saveConnection(kind: OwnerKind, ownerId: string, userId: string, connectorId: string, key: string, accountEmail: string | null) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").upsert(
    { owner_kind: kind, owner_id: ownerId, user_id: userId, connector_id: connectorId, connection_key_ciphertext: encryptConnectionKey(key), account_email: accountEmail, updated_at: new Date().toISOString() },
    { onConflict: "owner_kind,owner_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnection(kind: OwnerKind, ownerId: string, connectorId: string) {
  const db = await admin();
  const { data, error } = await db.from("app_user_connections").select("connection_key_ciphertext, account_email")
    .eq("owner_kind", kind).eq("owner_id", ownerId).eq("connector_id", connectorId).maybeSingle();
  if (error) throw error;
  return data ? { key: decryptConnectionKey(data.connection_key_ciphertext), email: data.account_email } : null;
}

export async function deleteConnection(kind: OwnerKind, ownerId: string, connectorId: string) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").delete().eq("owner_kind", kind).eq("owner_id", ownerId).eq("connector_id", connectorId);
  if (error) throw error;
}
