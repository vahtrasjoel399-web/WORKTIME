-- ============================================================================
-- 0001_schema.sql — core tables
-- ----------------------------------------------------------------------------
-- Product: point-in-time GPS time tracking. GPS is captured only at shift
-- start and shift end. worked_seconds is derived, never hand-set.
-- ============================================================================

create extension if not exists "pgcrypto";        -- gen_random_uuid()
create extension if not exists "postgis" cascade;  -- (optional) not required; haversine done in SQL

-- ── enums ──
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

-- ── companies ──
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  reg_code    text,
  join_code   text unique,                    -- short code a worker can use with an invite
  created_at  timestamptz not null default now()
);

-- ── profiles (id == auth.users.id) ──
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

-- ── sites (job locations) ──
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

-- ── shifts ──
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

-- ── breaks (pause/resume within a shift) ──
create table if not exists public.breaks (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists breaks_shift_idx on public.breaks(shift_id);

-- ── shift_edits (append-only audit of admin corrections) ──
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

-- ── consents (GDPR: geolocation processing consent with timestamp + version) ──
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'geolocation',
  version     text not null default '1',
  granted     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents(user_id);
