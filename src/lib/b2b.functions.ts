import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { b2bRow, normalizeDomain } from './b2b';
const tenant = z.object({ tenantId: z.string().uuid() });
export const getB2BStatus = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).b2bStatus(context, data.tenantId));
export const saveB2BConnection = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.extend({ apiKey: z.string().trim().min(8).max(512) }).parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).connectB2B(context, data.tenantId, data.apiKey));
export const removeB2BConnection = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).disconnectB2B(context, data.tenantId));
export const runB2BEnrichment = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.extend({ domains: z.array(z.string().max(300).transform(normalizeDomain)).min(1).max(10), provider: z.literal('apollo').default('apollo') }).parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).enrichB2B(context, data));
export const getB2BJobs = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.extend({ page: z.number().int().min(1).max(10000).default(1), size: z.number().int().min(1).max(100).default(10) }).parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).listB2BJobs(context, data));
export const importB2BRows = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.extend({ rows: z.array(b2bRow).min(1).max(100) }).parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).importB2B(context, data.tenantId, data.rows));
export const getB2BMetrics = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => tenant.parse(input)).handler(async ({ context, data }) => (await import('./b2b.server')).metricB2B(context, data.tenantId));

export const getCompanyDataFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input =>
    z.object({
      cnpj: z.string().optional(),
      domain: z.string().optional(),
      name: z.string().optional(),
      city: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { getCompanyData } = await import('./b2b.server');
    return getCompanyData(data.cnpj, data.domain, data.name, data.city);
  });
