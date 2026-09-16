-- ============================================================================
-- 0012_workforce_data_model.sql — workforce management data model
-- ----------------------------------------------------------------------------
-- Extends the existing profiles (employees) and sites (objects) instead of
-- introducing duplicate entities. Existing default_site_id remains in place
-- because shift attribution depends on it; employee_assignments adds history.
-- Storage buckets and access policies are intentionally handled in later phases.
-- ============================================================================

-- ── employees: extend the existing auth-linked profile ──
alter table public.profiles
  add column if not exists email text,
  add column if not exists position text,
  add column if not exists profile_photo_path text,
  add column if not exists updated_at timestamptz not null default now();

-- auth.users remains the authentication source of truth. The public copy lets
-- tenant-scoped admin queries display/search an employee email without exposing
-- the auth schema to clients.
update public.profiles p
   set email = lower(u.email)
  from auth.users u
 where u.id = p.id
   and p.email is null
   and u.email is not null;

create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

-- Accounts are created in Auth before their public profile. Populate the
-- mirrored address when existing signup/invitation flows omit it.
create or replace function public.set_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    select lower(u.email) into new.email
      from auth.users u
     where u.id = new.id;
  else
    new.email := lower(trim(new.email));
  end if;
  return new;
end
$$;

drop trigger if exists trg_set_profile_email on public.profiles;
create trigger trg_set_profile_email
  before insert or update of email on public.profiles
  for each row execute function public.set_profile_email();

-- ── objects: extend the existing sites table ──
alter table public.sites
  add column if not exists description text,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.sites
  drop constraint if exists sites_status_check;
alter table public.sites
  add constraint sites_status_check check (status in ('active', 'inactive'));

-- ── shared updated_at maintenance ──
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sites_updated_at on public.sites;
create trigger trg_sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- Keep newly added employer-managed profile fields behind the existing guard.
-- The updated_at value itself is maintained by the database trigger above.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.hourly_rate        is distinct from old.hourly_rate
     or new.role            is distinct from old.role
     or new.is_active       is distinct from old.is_active
     or new.is_approved     is distinct from old.is_approved
     or new.company_id      is distinct from old.company_id
     or new.default_site_id is distinct from old.default_site_id
     or new.first_name      is distinct from old.first_name
     or new.last_name       is distinct from old.last_name
     or new.phone           is distinct from old.phone
     or new.email           is distinct from old.email
     or new.position        is distinct from old.position
     or new.profile_photo_path is distinct from old.profile_photo_path then
    raise exception 'Not allowed to modify employer-managed profile fields';
  end if;
  return new;
end $$;

-- ── employee documents: metadata only; file bytes belong in private Storage ──
create table if not exists public.employee_documents (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  filename       text not null check (length(trim(filename)) > 0),
  storage_path   text not null check (length(trim(storage_path)) > 0),
  document_type  text not null check (length(trim(document_type)) > 0),
  mime_type      text,
  size_bytes     bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (company_id, storage_path)
);

create index if not exists employee_documents_employee_created_idx
  on public.employee_documents(employee_id, created_at desc);
create index if not exists employee_documents_company_idx
  on public.employee_documents(company_id);

-- ── employee ↔ object assignment history ──
create table if not exists public.employee_assignments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  site_id      uuid not null references public.sites(id) on delete restrict,
  start_date   date not null,
  end_date     date,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint employee_assignments_dates_check
    check (end_date is null or end_date >= start_date)
);

create index if not exists employee_assignments_employee_dates_idx
  on public.employee_assignments(employee_id, start_date desc);
create index if not exists employee_assignments_site_dates_idx
  on public.employee_assignments(site_id, start_date desc);
create index if not exists employee_assignments_company_idx
  on public.employee_assignments(company_id);
create unique index if not exists employee_assignments_one_current_idx
  on public.employee_assignments(employee_id)
  where end_date is null;

-- Enforce tenant consistency in the data model independently of frontend code.
create or replace function public.guard_employee_document_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  employee_company uuid;
begin
  select company_id into employee_company
    from public.profiles
   where id = new.employee_id;

  if employee_company is null then
    raise exception 'Employee has no profile';
  end if;
  if new.company_id is distinct from employee_company then
    raise exception 'Document company must match employee company';
  end if;
  if new.uploaded_by is not null and not exists (
    select 1 from public.profiles
     where id = new.uploaded_by and company_id = employee_company
  ) then
    raise exception 'Document uploader belongs to another company';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_employee_document_tenant on public.employee_documents;
create trigger trg_guard_employee_document_tenant
  before insert or update on public.employee_documents
  for each row execute function public.guard_employee_document_tenant();

create or replace function public.guard_employee_assignment_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  employee_company uuid;
begin
  select company_id into employee_company
    from public.profiles
   where id = new.employee_id;

  if employee_company is null then
    raise exception 'Employee has no profile';
  end if;
  if new.company_id is distinct from employee_company then
    raise exception 'Assignment company must match employee company';
  end if;
  if not exists (
    select 1 from public.sites
     where id = new.site_id and company_id = employee_company
  ) then
    raise exception 'Assignment site belongs to another company';
  end if;
  if new.created_by is not null and not exists (
    select 1 from public.profiles
     where id = new.created_by and company_id = employee_company
  ) then
    raise exception 'Assignment creator belongs to another company';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_employee_assignment_tenant on public.employee_assignments;
create trigger trg_guard_employee_assignment_tenant
  before insert or update on public.employee_assignments
  for each row execute function public.guard_employee_assignment_tenant();

-- Preserve existing assignments as current history rows. Their exact original
-- start date was never stored, so the migration date is the earliest truthful
-- date available for the new history model.
insert into public.employee_assignments
  (company_id, employee_id, site_id, start_date, created_by)
select p.company_id, p.id, p.default_site_id, current_date, null
  from public.profiles p
 where p.role = 'worker'
   and p.default_site_id is not null
   and not exists (
     select 1 from public.employee_assignments a
      where a.employee_id = p.id and a.end_date is null
   );

-- New sensitive tables stay default-deny between Phase 1 and the dedicated
-- Phase 2 policies. The service role still bypasses RLS for trusted workflows.
alter table public.employee_documents enable row level security;
alter table public.employee_assignments enable row level security;
