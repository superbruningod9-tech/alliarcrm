
-- ===== Core =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text not null default ''
);
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','vendedor')),
  unique (tenant_id, user_id)
);
create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'light',
  view text not null default 'kanban',
  tour_done boolean not null default false
);
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  commission_rate numeric not null default 10,
  pix_key text not null default '',
  structure text not null default 'solo'
);
create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  token text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create table public.pipeline_stages (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null,
  label text not null,
  position int not null,
  primary key (tenant_id, id)
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  cnpj text not null default '',
  razao_social text not null default '',
  cnae text not null default '',
  endereco text not null default '',
  socios jsonb not null default '[]'::jsonb,
  unique (tenant_id, id)
);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null,
  owner_id uuid not null,
  stage text not null default 'novo',
  temp text not null default 'morno',
  priority text not null default 'media',
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, owner_id) references public.user_roles(tenant_id, user_id),
  foreign key (tenant_id, stage) references public.pipeline_stages(tenant_id, id)
);
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  kind text not null,
  text text not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, lead_id) references public.leads(tenant_id, id) on delete cascade
);
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  user_id uuid not null,
  rate numeric not null,
  amount numeric not null,
  status text not null default 'pending',
  unique (tenant_id, lead_id),
  foreign key (tenant_id, lead_id) references public.leads(tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references public.user_roles(tenant_id, user_id)
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  base numeric not null,
  discount numeric not null default 0,
  total numeric,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, lead_id) references public.leads(tenant_id, id) on delete cascade
);

-- ===== Modules =====
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, slug text not null,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.funnel_automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  welcome_enabled boolean not null default true,
  welcome_message_template text,
  anti_vacuo_enabled boolean not null default true,
  anti_vacuo_minutes int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.imported_prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  prospect_id text not null, company_name text not null, phone text not null,
  lead_id uuid references public.leads(id) on delete set null,
  imported_at timestamptz not null default now()
);
create table public.incoming_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null, event text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'success',
  summary text not null default '',
  created_at timestamptz not null default now()
);
create table public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  whatsapp_provider text not null default 'meta',
  meta_lead_ads_active boolean not null default false,
  meta_verify_token text not null default encode(extensions.gen_random_bytes(12),'hex'),
  google_ads_active boolean not null default false,
  google_ads_key text not null default encode(extensions.gen_random_bytes(12),'hex'),
  kiwify_active boolean not null default false, kiwify_secret text,
  hotmart_active boolean not null default false, hotmart_token text,
  asaas_active boolean not null default false, asaas_api_key text,
  stripe_active boolean not null default false, stripe_webhook_secret text,
  mercado_pago_active boolean not null default false, mercado_pago_token text,
  auto_move_to_ganho boolean not null default true,
  auto_open_portal_project boolean not null default true,
  auto_send_portal_magic_link boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.prospecting_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  segment text not null, city text not null,
  results_count int not null default 0,
  created_at timestamptz not null default now()
);
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  referrer_contact_id text not null, referrer_name text not null,
  referred_name text not null, referred_phone text not null, referred_email text,
  magic_link text not null, magic_token text not null,
  status text not null default 'pending',
  deal_value numeric not null default 0,
  reward_pct numeric not null default 10,
  reward_amount numeric not null default 0,
  lead_id uuid references public.leads(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  protocol text not null, title text not null, description text,
  contact_id uuid references public.contacts(id) on delete set null,
  contact_name text not null default '',
  priority text not null default 'media',
  status text not null default 'aberto',
  sla_hours int not null default 24,
  sla_label text not null default '24h',
  sla_deadline timestamptz not null default now() + interval '24 hours',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone text not null, direction text not null,
  kind text not null default 'text', body text not null default '',
  wa_id text unique, status text not null default 'pending', status_at timestamptz,
  error text, sent_by uuid,
  created_at timestamptz not null default now()
);
create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique, event text not null, payload jsonb not null,
  attempts int not null default 0, processed_at timestamptz, processing_error text,
  received_at timestamptz not null default now()
);
create table public.workflows (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, description text,
  nodes jsonb not null default '[]'::jsonb, edges jsonb not null default '[]'::jsonb,
  active boolean not null default false, executions_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workflow_execution_logs (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id text not null, workflow_name text not null,
  lead_id text not null, lead_name text not null,
  node_id text not null, node_label text not null,
  status text not null, output text not null default '',
  executed_at timestamptz not null default now()
);
create table public.b2b_connections (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null, provider text not null, key_ciphertext text not null,
  connected_at timestamptz not null default now(),
  primary key (tenant_id, user_id, provider)
);
create table public.b2b_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null, provider text not null,
  domains jsonb not null default '[]'::jsonb, results jsonb not null default '[]'::jsonb,
  status text not null default 'pending', error text,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create table public.b2b_imports (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fingerprint text not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, fingerprint)
);

-- ===== Helper functions =====
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where tenant_id = t and user_id = auth.uid())
$$;
create or replace function public.is_tenant_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where tenant_id = t and user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1), ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_tenant(company_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if coalesce(trim(company_name),'') = '' then raise exception 'Nome obrigatório'; end if;
  insert into public.profiles(id) values (auth.uid()) on conflict do nothing;
  insert into public.tenants(name) values (trim(company_name)) returning id into t;
  insert into public.user_roles(tenant_id,user_id,role) values (t, auth.uid(), 'admin');
  insert into public.tenant_settings(tenant_id) values (t);
  insert into public.integration_settings(tenant_id) values (t);
  insert into public.funnel_automation_rules(tenant_id) values (t);
  insert into public.pipeline_stages(tenant_id,id,label,position) values
    (t,'novo','Novos',0),(t,'contato','Em contato',1),(t,'proposta','Proposta enviada',2),
    (t,'negociacao','Negociação',3),(t,'ganho','Ganho',4);
  return t;
end $$;

create or replace function public.create_lead(t uuid, contact_name text, contact_company text, contact_email text, contact_phone text, deal_value numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid; l uuid;
begin
  if not public.is_member(t) then raise exception 'Sem acesso a esta empresa'; end if;
  if coalesce(trim(contact_name),'') = '' then raise exception 'Nome obrigatório'; end if;
  insert into public.contacts(tenant_id,name,company,email,phone)
  values (t, trim(contact_name), coalesce(contact_company,''), coalesce(contact_email,''), coalesce(contact_phone,''))
  returning id into c;
  insert into public.leads(tenant_id,contact_id,owner_id,value)
  values (t, c, auth.uid(), greatest(coalesce(deal_value,0),0)) returning id into l;
  return l;
end $$;

create or replace function public.accept_invitation(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.tenant_invitations; my_email text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select email into my_email from auth.users where id = auth.uid();
  select * into inv from public.tenant_invitations where token = invite_token for update;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now()
     or lower(inv.email) <> lower(coalesce(my_email,'')) then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail';
  end if;
  if exists(select 1 from public.user_roles where tenant_id = inv.tenant_id and user_id = auth.uid()) then
    raise exception 'Você já faz parte desta empresa';
  end if;
  insert into public.profiles(id) values (auth.uid()) on conflict do nothing;
  insert into public.user_roles(tenant_id,user_id,role) values (inv.tenant_id, auth.uid(), 'vendedor');
  update public.tenant_invitations set accepted_at = now() where id = inv.id;
  return inv.tenant_id;
end $$;

create or replace function public.tenant_members(t uuid)
returns table(user_id uuid, role text, display_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(t) then raise exception 'Sem acesso a esta empresa'; end if;
  return query
    select r.user_id, r.role, coalesce(p.display_name,''), coalesce(u.email,'')::text
    from public.user_roles r
    left join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    where r.tenant_id = t order by r.role, p.display_name;
end $$;

create or replace function public.import_b2b_rows(t uuid, rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; fp text; c uuid; l uuid; imported int := 0; skipped int := 0;
begin
  if not public.is_tenant_admin(t) then raise exception 'Apenas administradores'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    fp := lower(coalesce(nullif(trim(r->>'email'),''), nullif(trim(r->>'domain'),'') || '|' || trim(r->>'name'), trim(r->>'name') || '|' || coalesce(r->>'company','')));
    if exists(select 1 from public.b2b_imports where tenant_id = t and fingerprint = fp) then
      skipped := skipped + 1; continue;
    end if;
    insert into public.contacts(tenant_id,name,company,email,phone)
    values (t, left(trim(r->>'name'),200), coalesce(r->>'company',''), coalesce(r->>'email',''), coalesce(r->>'phone',''))
    returning id into c;
    insert into public.leads(tenant_id,contact_id,owner_id) values (t, c, auth.uid()) returning id into l;
    insert into public.lead_events(tenant_id,lead_id,kind,text) values (t, l, 'nota', 'Importado via B2B');
    insert into public.b2b_imports(tenant_id,fingerprint,lead_id,user_id) values (t, fp, l, auth.uid());
    imported := imported + 1;
  end loop;
  return jsonb_build_object('imported', imported, 'skipped', skipped);
end $$;

-- ===== Triggers =====
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create trigger forms_touch before update on public.forms for each row execute function public.touch_updated_at();
create trigger workflows_touch before update on public.workflows for each row execute function public.touch_updated_at();
create trigger far_touch before update on public.funnel_automation_rules for each row execute function public.touch_updated_at();
create trigger is_touch before update on public.integration_settings for each row execute function public.touch_updated_at();

create or replace function public.proposal_total() returns trigger language plpgsql set search_path = public as $$
begin new.total := round(new.base * (1 - coalesce(new.discount,0)/100.0), 2); return new; end $$;
create trigger proposals_total before insert or update on public.proposals for each row execute function public.proposal_total();

create or replace function public.lead_won_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare rate numeric;
begin
  if new.stage = 'ganho' and (tg_op = 'INSERT' or old.stage is distinct from 'ganho') then
    select commission_rate into rate from public.tenant_settings where tenant_id = new.tenant_id;
    rate := coalesce(rate, 0);
    insert into public.commissions(tenant_id,lead_id,user_id,rate,amount)
    values (new.tenant_id, new.id, new.owner_id, rate, round(new.value * rate / 100.0, 2))
    on conflict (tenant_id, lead_id) do nothing;
  end if;
  return new;
end $$;
create trigger leads_commission after insert or update of stage on public.leads
for each row execute function public.lead_won_commission();

-- ===== Grants =====
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on public.whatsapp_webhook_events from authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_tenant(text), public.create_lead(uuid,text,text,text,text,numeric),
  public.accept_invitation(text), public.tenant_members(uuid), public.import_b2b_rows(uuid,jsonb),
  public.is_member(uuid), public.is_tenant_admin(uuid) from public, anon;
grant execute on function public.create_tenant(text), public.create_lead(uuid,text,text,text,text,numeric),
  public.accept_invitation(text), public.tenant_members(uuid), public.import_b2b_rows(uuid,jsonb),
  public.is_member(uuid), public.is_tenant_admin(uuid) to authenticated;

-- ===== RLS =====
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "own profile or teammates" on public.profiles for select to authenticated
  using (id = auth.uid() or exists(select 1 from public.user_roles a join public.user_roles b on a.tenant_id=b.tenant_id where a.user_id=auth.uid() and b.user_id=profiles.id));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "own prefs" on public.user_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read tenant" on public.tenants for select to authenticated using (public.is_member(id));
create policy "admins update tenant" on public.tenants for update to authenticated using (public.is_tenant_admin(id));
create policy "admins delete tenant" on public.tenants for delete to authenticated using (public.is_tenant_admin(id));

create policy "members read roles" on public.user_roles for select to authenticated using (public.is_member(tenant_id));
create policy "admins update roles" on public.user_roles for update to authenticated using (public.is_tenant_admin(tenant_id) and user_id <> auth.uid());
create policy "admins delete roles" on public.user_roles for delete to authenticated using (public.is_tenant_admin(tenant_id) and user_id <> auth.uid());

create policy "members read settings" on public.tenant_settings for select to authenticated using (public.is_member(tenant_id));
create policy "admins update settings" on public.tenant_settings for update to authenticated using (public.is_tenant_admin(tenant_id));

create policy "admins invitations" on public.tenant_invitations for all to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

create policy "members read stages" on public.pipeline_stages for select to authenticated using (public.is_member(tenant_id));
create policy "admins manage stages" on public.pipeline_stages for all to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

create policy "admins integration settings" on public.integration_settings for all to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy "members read integration settings" on public.integration_settings for select to authenticated using (public.is_member(tenant_id));

create policy "members read commissions" on public.commissions for select to authenticated using (public.is_member(tenant_id));
create policy "admins update commissions" on public.commissions for update to authenticated using (public.is_tenant_admin(tenant_id));

create policy "own b2b connections" on public.b2b_connections for all to authenticated
  using (user_id = auth.uid() and public.is_member(tenant_id)) with check (user_id = auth.uid() and public.is_member(tenant_id));
create policy "own b2b jobs" on public.b2b_jobs for select to authenticated using (user_id = auth.uid() and public.is_member(tenant_id));
create policy "members b2b imports" on public.b2b_imports for select to authenticated using (public.is_member(tenant_id));

do $$ declare t text; begin
  foreach t in array array['contacts','leads','lead_events','proposals','forms','funnel_automation_rules','imported_prospects',
    'incoming_webhook_logs','prospecting_searches','referrals','support_tickets','whatsapp_messages','workflows','workflow_execution_logs'] loop
    execute format('create policy "members manage" on public.%I for all to authenticated using (public.is_member(tenant_id)) with check (public.is_member(tenant_id))', t);
  end loop;
end $$;
