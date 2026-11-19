"REGRAS OBRIGATÓRIAS: Nunca crie dados mockados ou placeholders. Nunca instale bibliotecas pagas quando houver API nativa do navegador ou API pública gratuita. Sempre rode npm run builde vitest runantes de finalizar o PR."
<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->
- Alliar business data is persisted in Cloud with tenant-scoped RLS; src/lib/store.tsx adapts queries for existing screens, never browser storage, to prevent demo/tenant mixing.
- Signed-in content lives under the managed _authenticated layout; public auth/reset/invite routes remain outside so redirects and recovery work.
- Tenant membership and roles live only in user_roles; privileged membership changes use authenticated SQL functions so clients cannot self-promote.
- Contact + lead creation and earned commissions are transactional SQL functions/triggers to avoid partial saves and duplicate accruals.
- Business rules (discount approval, round-robin, PIX payload) are pure functions in src/lib/rules.ts and src/lib/pix.ts so they stay unit-tested.
- Live AI runs only in requireSupabaseAuth server functions (src/lib/ai.functions.ts → ai.server.ts) so the gateway key and prompts never reach the browser.
- WhatsApp uses the official Cloud API connector; the signed webhook stores every delivery in whatsapp_webhook_events before processing, with bounded retry of pending rows on each call, so no callback is lost.
- Team member names/e-mails come from the tenant_members SQL function, which reads auth emails only for members of the same company.
- Lead forms are tenant-scoped rows in public.forms managed in-app; there is no unauthenticated form-creation endpoint.
- B2B uses authenticated server functions and an allowlisted provider registry; credentials are encrypted server-only rows keyed by user, tenant and provider, preventing cross-account billing.
- B2B CSV imports run through a transactional SQL function with tenant-level deduplication; provider calls execute bounded batches within the request, with durable job states and no background in-memory queue.
- Integrations embeds the existing B2B settings and dashboard rather than duplicating data flows, so connection isolation and CSV deduplication remain consistent across screens.
- Google Drive uses the App User Connector with encrypted keys in server-only app_user_connections (owner_kind user|tenant); uploads prefer the seller's own Drive and fall back to the company's admin-managed shared account, so large companies can centralize files.
