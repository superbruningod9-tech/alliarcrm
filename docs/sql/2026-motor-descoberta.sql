-- Motor de Descoberta B2B — aplicar manualmente no SQL Editor do Supabase.
-- Fica em docs/sql (e NÃO em supabase/migrations ou drizzle) por regra do AGENTS.md.
-- Idempotente: pode rodar mais de uma vez. Depende de public.is_member(uuid) já existente.

create extension if not exists pg_trgm;

-- Cache global (dados brutos públicos, sem dados de CRM). Só o servidor (service role) acessa.
create table if not exists public.discovery_cache (
  cache_key   text primary key,               -- ex.: "osm:<hash bbox+nicho>" | "site:dominio.com"
  source      text not null,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists discovery_cache_expires_idx on public.discovery_cache (expires_at);
alter table public.discovery_cache enable row level security;
-- sem policies: nenhum usuário autenticado lê/escreve; apenas service_role (ignora RLS).

create table if not exists public.search_jobs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null,
  mode        text not null check (mode in ('area','reverse','bulk')),
  niches      text[] not null default '{}',
  expanded_terms text[] not null default '{}',
  area        jsonb not null default '{}',      -- {type:'circle'|'polygon'|'city', ...}
  filters     jsonb not null default '{}',      -- CNAE, porte, idade...
  status      text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  progress    int not null default 0 check (progress between 0 and 100),
  total_found int not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists search_jobs_tenant_idx on public.search_jobs (tenant_id, created_at desc);
create index if not exists search_jobs_status_idx on public.search_jobs (status) where status in ('queued','running');

create table if not exists public.search_cells (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.search_jobs(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cell_path   text not null,                    -- id quadtree (ex.: r0c0_13)
  depth       int not null default 0,
  lat_min     double precision not null,
  lng_min     double precision not null,
  lat_max     double precision not null,
  lng_max     double precision not null,
  term        text,
  status      text not null default 'queued' check (status in ('queued','running','done','failed','saturated')),
  results_count int not null default 0,
  from_cache  boolean not null default false,
  attempts    int not null default 0,
  error       text,
  updated_at  timestamptz not null default now()
);
create index if not exists search_cells_job_idx on public.search_cells (job_id, status);
create index if not exists search_cells_tenant_idx on public.search_cells (tenant_id);

create table if not exists public.crm_businesses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null,
  job_id      uuid references public.search_jobs(id) on delete set null,
  merge_key   text not null,                    -- cnpj | dominio | nome|cep
  name        text not null,
  category    text,
  categories  text[] not null default '{}',
  address     text, neighborhood text, city text, state text, cep text,
  lat         double precision, lng double precision,
  website     text,
  rating      numeric(2,1), reviews_count int,
  claimed     boolean, photos_count int,
  opening_hours text,
  sources     text[] not null default '{}',
  field_sources jsonb not null default '{}',    -- {phone:['google_maps','site'], ...}
  triggers    text[] not null default '{}',     -- gatilhos de abordagem
  score       int not null default 0 check (score between 0 and 100),
  tags        text[] not null default '{}',
  funnel_stage text not null default 'novo',
  notes       text,
  crm_lead_id uuid,                             -- vínculo com public.leads quando importado ao funil
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, merge_key)
);
create index if not exists crm_businesses_tenant_idx on public.crm_businesses (tenant_id, created_at desc);
create index if not exists crm_businesses_name_trgm on public.crm_businesses using gin (name gin_trgm_ops);
create index if not exists crm_businesses_score_idx on public.crm_businesses (tenant_id, score desc);

create table if not exists public.lead_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  business_id uuid not null references public.crm_businesses(id) on delete cascade,
  kind        text not null check (kind in ('phone','email','social')),
  value       text not null,                    -- E.164 | e-mail | URL
  label       text,                             -- mobile|landline|whatsapp|instagram...
  whatsapp    boolean not null default false,
  sources     text[] not null default '{}',
  confirmed   boolean not null default false,   -- visto em 2+ fontes
  validation  text not null default 'unverified' check (validation in ('unverified','valid','invalid')),
  created_at  timestamptz not null default now(),
  unique (business_id, kind, value)
);
create index if not exists lead_contacts_tenant_idx on public.lead_contacts (tenant_id);
create index if not exists lead_contacts_value_idx on public.lead_contacts (tenant_id, value);

create table if not exists public.lead_company_profiles (
  business_id uuid primary key references public.crm_businesses(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cnpj text, razao_social text, nome_fantasia text, situacao text,
  abertura date, porte text, capital_social numeric,
  cnae_principal jsonb, cnaes_secundarios jsonb not null default '[]',
  socios jsonb not null default '[]',
  site_diagnosis jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists lead_company_profiles_tenant_idx on public.lead_company_profiles (tenant_id);
create index if not exists lead_company_profiles_cnpj_idx on public.lead_company_profiles (tenant_id, cnpj);

create table if not exists public.lead_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  business_id uuid not null references public.crm_businesses(id) on delete cascade,
  rating      int check (rating between 1 and 5),
  text        text,
  reviewed_at text,
  created_at  timestamptz not null default now()
);
create index if not exists lead_reviews_business_idx on public.lead_reviews (business_id);

-- RLS: cada tenant só vê/edita o que é seu (is_member) e só escreve como ele mesmo.
do $$
declare t text;
begin
  foreach t in array array['search_jobs','search_cells','crm_businesses','lead_contacts','lead_company_profiles','lead_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(tenant_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member(tenant_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member(tenant_id)) with check (public.is_member(tenant_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_member(tenant_id))', t || '_delete', t);
  end loop;
end $$;

-- Impede o cliente de forjar user_id em jobs/negócios
drop policy if exists search_jobs_insert on public.search_jobs;
create policy search_jobs_insert on public.search_jobs for insert to authenticated
  with check (public.is_member(tenant_id) and user_id = auth.uid());
drop policy if exists crm_businesses_insert on public.crm_businesses;
create policy crm_businesses_insert on public.crm_businesses for insert to authenticated
  with check (public.is_member(tenant_id) and user_id = auth.uid());
