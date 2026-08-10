-- ============================================================================
-- setup_all.sql — paste ALL of this into Supabase → SQL Editor → Run (once).
-- Combines: schema + RLS + functions + site assignment + self-signup RPCs.
-- Does NOT include demo data (real company is created via the admin panel signup).
-- After running: Auth → Providers → Email → enable "Confirm email" = OFF for
-- instant signup while testing.
-- ============================================================================


-- >>>>>>>>>> 0001_schema.sql <<<<<<<<<<

-- ============================================================================
-- 0001_schema.sql ā€” core tables
-- ----------------------------------------------------------------------------
-- Product: point-in-time GPS time tracking. GPS is captured only at shift
-- start and shift end. worked_seconds is derived, never hand-set.
-- ============================================================================

create extension if not exists "pgcrypto";        -- gen_random_uuid()
create extension if not exists "postgis" cascade;  -- (optional) not required; haversine done in SQL

-- ā”€ā”€ enums ā”€ā”€
do $$ begin
  create type user_role   as enum ('worker', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shift_status as enum ('open', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shift_source as enum ('app', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type theme_pref   as enum ('light', 'dark', 'system');
exception when duplicate_object then null; end $$;

-- ā”€ā”€ companies ā”€ā”€
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  reg_code    text,
  join_code   text unique,                    -- short code a worker can use with an invite
  created_at  timestamptz not null default now()
);

-- ā”€ā”€ profiles (id == auth.users.id) ā”€ā”€
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  first_name         text not null default '',
  last_name          text not null default '',
  phone              text,
  role               user_role not null default 'worker',
  is_active          boolean not null default true,
  locale             text not null default 'et',      -- 'et' | 'ru' | 'en' | 'fi'
  -- earnings inputs
  hourly_rate        numeric(10,2),                   -- set by admin; NULL = not set
  self_hourly_rate   numeric(10,2),                   -- worker fallback
  currency           text not null default 'EUR',
  target_shift_hours numeric(4,2) not null default 8, -- drives the timer arc
  show_earnings      boolean not null default true,
  theme              theme_pref not null default 'system',
  created_at         timestamptz not null default now()
);
create index if not exists profiles_company_idx on public.profiles(company_id);

-- ā”€ā”€ sites (job locations) ā”€ā”€
create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  address     text,
  lat         double precision,
  lng         double precision,
  radius_m    integer not null default 150,
  created_at  timestamptz not null default now()
);
create index if not exists sites_company_idx on public.sites(company_id);

-- ā”€ā”€ shifts ā”€ā”€
create table if not exists public.shifts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  site_id           uuid references public.sites(id) on delete set null,

  started_at        timestamptz not null default now(),
  start_lat         double precision,
  start_lng         double precision,
  start_accuracy_m  double precision,
  start_address     text,

  ended_at          timestamptz,
  end_lat           double precision,
  end_lng           double precision,
  end_accuracy_m    double precision,
  end_address       text,

  break_seconds     integer not null default 0,
  -- worked_seconds: derived, only meaningful once closed. (see DECISIONS D-014)
  worked_seconds    integer generated always as (
    case
      when ended_at is null then null
      else greatest(0, floor(extract(epoch from (ended_at - started_at)))::int - break_seconds)
    end
  ) stored,

  status            shift_status not null default 'open',
  source            shift_source not null default 'app',
  is_stale          boolean not null default false,   -- open > 16h
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists shifts_company_idx on public.shifts(company_id);
create index if not exists shifts_user_idx    on public.shifts(user_id);
create index if not exists shifts_started_idx on public.shifts(started_at);

-- Exactly one OPEN shift per worker.
create unique index if not exists shifts_one_open_per_user
  on public.shifts(user_id) where (status = 'open');

-- ā”€ā”€ breaks (pause/resume within a shift) ā”€ā”€
create table if not exists public.breaks (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists breaks_shift_idx on public.breaks(shift_id);

-- ā”€ā”€ shift_edits (append-only audit of admin corrections) ā”€ā”€
create table if not exists public.shift_edits (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  edited_by   uuid not null references public.profiles(id),
  field       text not null,
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now()
);
create index if not exists shift_edits_shift_idx on public.shift_edits(shift_id);

-- ā”€ā”€ consents (GDPR: geolocation processing consent with timestamp + version) ā”€ā”€
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'geolocation',
  version     text not null default '1',
  granted     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents(user_id);


-- >>>>>>>>>> 0002_rls.sql <<<<<<<<<<

-- ============================================================================
-- 0002_rls.sql ā€” Row Level Security
-- ----------------------------------------------------------------------------
-- Worker: reads/writes only their own shifts/breaks; reads own profile + sites
--         in their company. Admin: full access within their own company_id.
-- Authorization lives entirely here ā€” there is no custom server. (D-005)
-- ============================================================================

-- ā”€ā”€ helpers (SECURITY DEFINER to avoid RLS recursion when reading profiles) ā”€ā”€
create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

grant execute on function public.current_company_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ā”€ā”€ enable RLS ā”€ā”€
alter table public.companies   enable row level security;
alter table public.profiles    enable row level security;
alter table public.sites       enable row level security;
alter table public.shifts      enable row level security;
alter table public.breaks      enable row level security;
alter table public.shift_edits enable row level security;
alter table public.consents    enable row level security;

-- ā”€ā”€ companies ā”€ā”€
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
  for select using (id = public.current_company_id());

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies
  for update using (id = public.current_company_id() and public.is_admin());

-- ā”€ā”€ profiles ā”€ā”€
-- everyone reads coworkers in their company (list needs names); writes are scoped.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (company_id = public.current_company_id());

-- a worker may update only their own self-service fields; RLS guards the row,
-- a trigger (0003) guards which columns. Admin may update anyone in company.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ā”€ā”€ sites ā”€ā”€
drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites
  for select using (company_id = public.current_company_id());

drop policy if exists sites_admin_write on public.sites;
create policy sites_admin_write on public.sites
  for all using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ā”€ā”€ shifts ā”€ā”€
-- worker: own rows only. admin: whole company.
drop policy if exists shifts_worker_select on public.shifts;
create policy shifts_worker_select on public.shifts
  for select using (
    user_id = auth.uid()
    or (public.is_admin() and company_id = public.current_company_id())
  );

drop policy if exists shifts_worker_insert on public.shifts;
create policy shifts_worker_insert on public.shifts
  for insert with check (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and source = 'app'
  );

drop policy if exists shifts_worker_update on public.shifts;
create policy shifts_worker_update on public.shifts
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists shifts_admin_all on public.shifts;
create policy shifts_admin_all on public.shifts
  for all using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ā”€ā”€ breaks (guarded through the parent shift's ownership) ā”€ā”€
drop policy if exists breaks_select on public.breaks;
create policy breaks_select on public.breaks
  for select using (
    exists (
      select 1 from public.shifts s
      where s.id = breaks.shift_id
        and (s.user_id = auth.uid()
             or (public.is_admin() and s.company_id = public.current_company_id()))
    )
  );

drop policy if exists breaks_worker_write on public.breaks;
create policy breaks_worker_write on public.breaks
  for all using (
    exists (select 1 from public.shifts s
            where s.id = breaks.shift_id and s.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.shifts s
            where s.id = breaks.shift_id and s.user_id = auth.uid())
  );

drop policy if exists breaks_admin_write on public.breaks;
create policy breaks_admin_write on public.breaks
  for all using (
    public.is_admin() and exists (
      select 1 from public.shifts s
      where s.id = breaks.shift_id and s.company_id = public.current_company_id())
  )
  with check (
    public.is_admin() and exists (
      select 1 from public.shifts s
      where s.id = breaks.shift_id and s.company_id = public.current_company_id())
  );

-- ā”€ā”€ shift_edits (readable by owner/admin; only admins create) ā”€ā”€
drop policy if exists shift_edits_select on public.shift_edits;
create policy shift_edits_select on public.shift_edits
  for select using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_edits.shift_id
        and (s.user_id = auth.uid()
             or (public.is_admin() and s.company_id = public.current_company_id()))
    )
  );

drop policy if exists shift_edits_admin_insert on public.shift_edits;
create policy shift_edits_admin_insert on public.shift_edits
  for insert with check (
    public.is_admin()
    and edited_by = auth.uid()
    and exists (select 1 from public.shifts s
                where s.id = shift_edits.shift_id
                  and s.company_id = public.current_company_id())
  );

-- ā”€ā”€ consents (a worker manages their own; admin may read for compliance) ā”€ā”€
drop policy if exists consents_self on public.consents;
create policy consents_self on public.consents
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists consents_admin_read on public.consents;
create policy consents_admin_read on public.consents
  for select using (
    public.is_admin() and exists (
      select 1 from public.profiles p
      where p.id = consents.user_id and p.company_id = public.current_company_id())
  );


-- >>>>>>>>>> 0003_functions.sql <<<<<<<<<<

-- ============================================================================
-- 0003_functions.sql ā€” triggers, guards, derived views, maintenance jobs
-- ============================================================================

-- ā”€ā”€ haversine distance in metres ā”€ā”€
create or replace function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end
$$;

-- ā”€ā”€ guard: non-admins may not touch protected profile columns ā”€ā”€
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;   -- admins may set rate/role/active/etc within their company (RLS checked)
  end if;
  -- worker self-update: freeze employer-owned fields
  if new.hourly_rate    is distinct from old.hourly_rate
     or new.role        is distinct from old.role
     or new.is_active   is distinct from old.is_active
     or new.company_id  is distinct from old.company_id
     or new.first_name  is distinct from old.first_name
     or new.last_name   is distinct from old.last_name then
    raise exception 'Not allowed to modify employer-managed fields';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ā”€ā”€ defense: force company_id / defaults on shift insert from client ā”€ā”€
create or replace function public.set_shift_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.company_id := coalesce(new.company_id, (select company_id from public.profiles where id = new.user_id));
  return new;
end $$;

drop trigger if exists trg_set_shift_company on public.shifts;
create trigger trg_set_shift_company
  before insert on public.shifts
  for each row execute function public.set_shift_company();

-- ā”€ā”€ report view: hours + out-of-zone flag (admin-facing) ā”€ā”€
create or replace view public.v_shift_report
with (security_invoker = true) as
select
  s.*,
  round(coalesce(s.worked_seconds, 0) / 3600.0, 2)                          as worked_hours,
  (s.started_at at time zone 'UTC')::date                                    as work_date,
  public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng)               as start_distance_m,
  case
    when si.id is null or si.lat is null then null
    else public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) > si.radius_m
  end                                                                        as out_of_zone,
  p.first_name, p.last_name,
  si.name as site_name
from public.shifts s
join public.profiles p on p.id = s.user_id
left join public.sites si on si.id = s.site_id;

-- ā”€ā”€ maintenance: flag shifts open longer than 16h (called by Edge Function) ā”€ā”€
create or replace function public.mark_stale_shifts()
returns setof public.shifts
language sql security definer set search_path = public as $$
  update public.shifts
     set is_stale = true
   where status = 'open'
     and is_stale = false
     and started_at < now() - interval '16 hours'
  returning *;
$$;

-- ā”€ā”€ maintenance: GDPR ā€” drop GPS coords older than 24 months ā”€ā”€
create or replace function public.purge_old_gps()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.shifts
     set start_lat = null, start_lng = null, start_accuracy_m = null,
         end_lat = null, end_lng = null, end_accuracy_m = null
   where started_at < now() - interval '24 months'
     and (start_lat is not null or end_lat is not null);
  get diagnostics n = row_count;
  return n;
end $$;

-- ā”€ā”€ GDPR: full export of one worker (admin/service only) ā”€ā”€
create or replace function public.export_worker(target uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'profile',  (select to_jsonb(p) from public.profiles p where p.id = target),
    'shifts',   (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.shifts s where s.user_id = target),
    'breaks',   (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
                   from public.breaks b join public.shifts s on s.id = b.shift_id where s.user_id = target),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.consents c where c.user_id = target),
    'exported_at', now()
  );
$$;

grant execute on function public.distance_m(double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.export_worker(uuid) to service_role;
grant execute on function public.mark_stale_shifts() to service_role;
grant execute on function public.purge_old_gps() to service_role;


-- >>>>>>>>>> 0005_assignment.sql <<<<<<<<<<

-- ============================================================================
-- 0005_assignment.sql ā€” a worker's default job site (admin assigns)
-- New punches are attributed to this site so the "out of zone" flag is meaningful.
-- ============================================================================

alter table public.profiles
  add column if not exists default_site_id uuid references public.sites(id) on delete set null;

-- assign the two demo Ćlemiste workers, one MustamĆ¤e
update public.profiles set default_site_id = '22222222-0000-0000-0000-000000000001'
 where id in ('00000001-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000002');
update public.profiles set default_site_id = '22222222-0000-0000-0000-000000000002'
 where id in ('00000001-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000005');


-- >>>>>>>>>> 0006_signup.sql <<<<<<<<<<

-- ============================================================================
-- 0006_signup.sql ā€” self-service registration
-- ----------------------------------------------------------------------------
-- Two SECURITY DEFINER RPCs let a freshly-signed-up auth user create their own
-- profile (which RLS would otherwise block, since they have no company yet):
--   register_company() ā€” first user: creates a company + becomes its admin,
--                         returns a short join code to share.
--   register_worker()  ā€” everyone else: joins an existing company by that code
--                         and becomes a worker.
-- Enable email signup in the Supabase dashboard (Auth ā†’ Providers ā†’ Email) too.
-- ============================================================================

-- short, human-friendly company code (6 chars, ambiguous letters removed)
create or replace function public.gen_join_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random()*32)+1)::int, 1), '')
  from generate_series(1, 6)
$$;

-- First user creates a company and becomes admin. Returns the join code.
create or replace function public.register_company(
  company_name text,
  admin_first text,
  admin_last text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_company uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'profile already exists';
  end if;

  -- generate a unique code
  loop
    code := public.gen_join_code();
    exit when not exists (select 1 from public.companies where join_code = code);
  end loop;

  insert into public.companies (name, join_code)
    values (nullif(trim(company_name), ''), code)
    returning id into new_company;

  insert into public.profiles (id, company_id, first_name, last_name, role, is_active, locale)
    values (auth.uid(), new_company, coalesce(admin_first,''), coalesce(admin_last,''), 'admin', true, 'et');

  return code;
end $$;

-- Everyone else joins an existing company by its code and becomes a worker.
create or replace function public.register_worker(
  p_join_code text,
  worker_first text,
  worker_last text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target_company uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'profile already exists';
  end if;

  select id into target_company
    from public.companies
   where join_code = upper(trim(p_join_code))
   limit 1;

  if target_company is null then
    raise exception 'invalid company code';
  end if;

  insert into public.profiles (id, company_id, first_name, last_name, role, is_active, locale)
    values (auth.uid(), target_company, coalesce(worker_first,''), coalesce(worker_last,''), 'worker', true, 'et');
end $$;

grant execute on function public.register_company(text, text, text) to authenticated;
grant execute on function public.register_worker(text, text, text)  to authenticated;
grant execute on function public.gen_join_code() to authenticated;

