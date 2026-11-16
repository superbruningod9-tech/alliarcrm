import { b2bRow, normalizeDomain, requireIndividualKey, type B2BRow } from './b2b';
type Provider = { verify: (key: string) => Promise<void>; enrich: (key: string, domains: string[]) => Promise<B2BRow[]> };
async function apollo(path: string, key: string, body?: unknown) {
  const response = await fetch(`https://api.apollo.io/api/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { 'X-Api-Key': requireIndividualKey(key), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  if (!response.ok) {
    const raw = await response.text();
    // Redact credentials before surfacing provider errors, even if a provider echoes them.
    const safe = raw.split(key).join('[redacted]').slice(0, 1500);
    console.error(`Apollo [${response.status}]: ${safe}`);
    throw Error(`Apollo [${response.status}]: ${safe}`);
  }
  return response.json();
}
// Explicit server-side registry: adding a provider never permits arbitrary caller-supplied URLs.
export const b2bProviders: Record<string, Provider> = {
  apollo: {
    async verify(key) { await apollo('auth/health', key); },
    async enrich(key, domains) {
      const payload = await apollo('organizations/bulk_enrich', key, { domains: domains.map(normalizeDomain) });
      const organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
      return organizations.filter((o: unknown) => o && typeof o === 'object').map((o: Record<string, unknown>) => b2bRow.parse({ name: o['name'], company: o['name'], domain: typeof o['primary_domain'] === 'string' ? o['primary_domain'] : '', email: '', phone: typeof o['phone'] === 'string' ? o['phone'] : '' }));
    },
  },
};