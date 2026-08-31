-- ============================================================================
-- 0009_privacy_security.sql — privacy/security hardening
-- ----------------------------------------------------------------------------
-- Restricts profile visibility, freezes tenant-owned shift fields, validates
-- cross-tenant references, and adds a minimal append-only compliance audit log.
-- ============================================================================

-- Workers only need their own profile. Admins can see profiles in their tenant.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (
    id = auth.uid()
    or (public.is_admin() and company_id = public.current_company_id())
  );

-- Extend the existing profile guard with fields owned by the employer.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.hourly_rate       is distinct from old.hourly_rate
     or new.role           is distinct from old.role
     or new.is_active      is distinct from old.is_active
     or new.is_approved    is distinct from old.is_approved
     or new.company_id     is distinct from old.company_id
     or new.default_site_id is distinct from old.default_site_id
     or new.first_name     is distinct from old.first_name
     or new.last_name      is distinct from old.last_name
     or new.phone          is distinct from old.phone then
    raise exception 'Not allowed to modify employer-managed profile fields';
  end if;
  return new;
end $$;

-- A shift always inherits its tenant from its worker. A site from another
-- tenant is rejected even if its UUID becomes known.
create or replace function public.guard_shift_tenant_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_company uuid;
begin
  select company_id into owner_company
    from public.profiles
   where id = new.user_id;

  if owner_company is null then
    raise exception 'Shift owner has no profile';
  end if;
  new.company_id := owner_company;

  if new.site_id is not null and not exists (
    select 1 from public.sites
     where id = new.site_id and company_id = owner_company
  ) then
    raise exception 'Shift site belongs to another company';
  end if;

  if tg_op = 'UPDATE' and not public.is_admin() then
    if new.user_id        is distinct from old.user_id
       or new.company_id  is distinct from old.company_id
       or new.site_id     is distinct from old.site_id
       or new.started_at  is distinct from old.started_at
       or new.start_lat   is distinct from old.start_lat
       or new.start_lng   is distinct from old.start_lng
       or new.start_accuracy_m is distinct from old.start_accuracy_m
       or new.start_address is distinct from old.start_address
       or new.source      is distinct from old.source
       or new.created_at  is distinct from old.created_at then
      raise exception 'Not allowed to modify protected shift fields';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_shift_tenant_fields on public.shifts;
create trigger trg_guard_shift_tenant_fields
  before insert or update on public.shifts
  for each row execute function public.guard_shift_tenant_fields();

-- Consent records must inherit their tenant instead of trusting client input.
create or replace function public.set_consent_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select company_id into new.company_id
    from public.profiles
   where id = new.user_id;
  if new.company_id is null then
    raise exception 'Consent owner has no profile';
  end if;
  return new;
end $$;

drop trigger if exists trg_set_consent_company on public.consents;
create trigger trg_set_consent_company
  before insert or update on public.consents
  for each row execute function public.set_consent_company();

-- Append-only security/compliance events. Application routes insert through the
-- service role only after authenticating and authorizing the acting admin.
create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,
  target_type    text not null,
  target_id      uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists audit_logs_company_created_idx
  on public.audit_logs(company_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
  for select using (
    public.is_admin() and company_id = public.current_company_id()
  );

-- No authenticated INSERT/UPDATE/DELETE policies: clients cannot forge or
-- rewrite the audit trail. The trusted server runtime uses service_role.

-- Default-deny direct execution of privileged helpers.
revoke all on function public.export_worker(uuid) from public, anon, authenticated;
grant execute on function public.export_worker(uuid) to service_role;
