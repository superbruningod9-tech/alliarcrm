import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { z } from 'zod';
import { b2bRow, canManageB2B, normalizeDomain, requireIndividualKey } from './b2b';
import { decryptB2B, encryptB2B } from './b2b-crypto.server';
import { b2bProviders } from './b2b-provider.server';

export type B2BContext = { supabase: SupabaseClient<Database>; userId: string };
export const tenantInput = z.object({ tenantId: z.string().uuid() });
export const enrichInput = tenantInput.extend({ domains: z.array(z.string().max(300).transform(normalizeDomain)).min(1).max(10), provider: z.literal('apollo').default('apollo') });
export const jobsInput = tenantInput.extend({ page: z.number().int().min(1).max(10000).default(1), size: z.number().int().min(1).max(100).default(10) });
export async function authorizeB2B(context: B2BContext, tenantId: string) {
  const { data, error } = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  if (!canManageB2B(data?.role)) throw Error('Somente administradores desta empresa podem gerenciar B2B.');
}
export async function b2bStatus(context: B2BContext, tenantId: string) {
  await authorizeB2B(context, tenantId);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('b2b_connections').select('provider,connected_at').eq('user_id', context.userId).eq('tenant_id', tenantId);
  if (error) throw error;
  return data;
}
export async function connectB2B(context: B2BContext, tenantId: string, apiKey: string) {
  await authorizeB2B(context, tenantId);
  await b2bProviders['apollo']?.verify(apiKey);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('b2b_connections').upsert({ user_id: context.userId, tenant_id: tenantId, provider: 'apollo', key_ciphertext: encryptB2B(apiKey), connected_at: new Date().toISOString() });
  if (error) throw error;
  return { connected: true };
}
export async function disconnectB2B(context: B2BContext, tenantId: string) {
  await authorizeB2B(context, tenantId);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('b2b_connections').delete().eq('user_id', context.userId).eq('tenant_id', tenantId).eq('provider', 'apollo');
  if (error) throw error;
  return { connected: false };
}
export async function enrichB2B(context: B2BContext, input: z.infer<typeof enrichInput>) {
  await authorizeB2B(context, input.tenantId);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const connection = await supabaseAdmin.from('b2b_connections').select('key_ciphertext').eq('user_id', context.userId).eq('tenant_id', input.tenantId).eq('provider', input.provider).maybeSingle();
  if (connection.error) throw connection.error;
  const key = requireIndividualKey(connection.data ? decryptB2B(connection.data.key_ciphertext) : null);
  const job = await supabaseAdmin.from('b2b_jobs').insert({ tenant_id: input.tenantId, user_id: context.userId, provider: input.provider, domains: input.domains }).select('id').single();
  if (job.error) throw job.error;
  const id = job.data.id;
  const processing = await supabaseAdmin.from('b2b_jobs').update({ status: 'processing' }).eq('id', id);
  if (processing.error) throw processing.error;
  try {
    const provider = b2bProviders[input.provider];
    if (!provider) throw Error('Fonte indisponível');
    const rows = await provider.enrich(key, input.domains);
    const saved = await supabaseAdmin.from('b2b_jobs').update({ status: 'completed', results: rows as Json, finished_at: new Date().toISOString() }).eq('id', id);
    if (saved.error) throw saved.error;
    return { jobId: id, rows };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Enriquecimento falhou';
    const saved = await supabaseAdmin.from('b2b_jobs').update({ status: 'failed', error, finished_at: new Date().toISOString() }).eq('id', id);
    if (saved.error) console.error('B2B job status could not be saved', saved.error.message);
    throw Error(error);
  }
}
export async function listB2BJobs(context: B2BContext, input: z.infer<typeof jobsInput>) {
  await authorizeB2B(context, input.tenantId);
  const { data, count, error } = await context.supabase.from('b2b_jobs').select('*', { count: 'exact' }).eq('tenant_id', input.tenantId).eq('user_id', context.userId).order('created_at', { ascending: false }).order('id', { ascending: false }).range((input.page - 1) * input.size, input.page * input.size - 1);
  if (error) throw error;
  return { jobs: data, total: count ?? 0, page: input.page, size: input.size };
}
export async function importB2B(context: B2BContext, tenantId: string, rows: unknown) {
  await authorizeB2B(context, tenantId);
  const valid = z.array(b2bRow).min(1).max(100).parse(rows);
  const { data, error } = await context.supabase.rpc('import_b2b_rows', { t: tenantId, rows: valid as Json });
  if (error) throw error;
  return data as { imported: number; skipped: number };
}
export async function metricB2B(context: B2BContext, tenantId: string) {
  await authorizeB2B(context, tenantId);
  const statuses = ['queued', 'processing', 'completed', 'failed'] as const;
  const counts = await Promise.all(statuses.map(async status => {
    const { count, error } = await context.supabase.from('b2b_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('user_id', context.userId).eq('status', status);
    if (error) throw error; return count ?? 0;
  }));
  return Object.fromEntries(statuses.map((status, i) => [status, counts[i] ?? 0]));
}
export async function b2bRequestContext(request: Request): Promise<B2BContext> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw Error('Unauthorized');
  const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw Error('Configuração indisponível');
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization }, fetch: (input, init) => { const headers = new Headers(init?.headers); headers.set('apikey', key); return fetch(input, { ...init, headers }); } } });
  const { data, error } = await supabase.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw Error('Unauthorized');
  return { supabase, userId: data.user.id };
}