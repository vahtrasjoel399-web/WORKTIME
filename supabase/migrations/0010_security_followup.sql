-- ============================================================================
-- 0010_security_followup.sql — follow-up hardening for privacy/security
-- ----------------------------------------------------------------------------
-- 0009 was already deployed before review. Keep that migration immutable and
-- apply corrections here so migration history matches deployed databases.
-- ============================================================================

-- Notice acknowledgements are append-only for clients. A worker may read and
-- create their own record, but cannot rewrite or erase what was acknowledged.
drop policy if exists consents_self on public.consents;
drop policy if exists consents_self_read on public.consents;
drop policy if exists consents_self_insert on public.consents;

create policy consents_self_read on public.consents
  for select using (user_id = auth.uid());

create policy consents_self_insert on public.consents
  for insert with check (user_id = auth.uid());

-- PostgreSQL grants function execution to PUBLIC by default. Explicitly keep
-- maintenance and data-export helpers behind the service role.
revoke all on function public.export_worker(uuid) from public, anon, authenticated;
revoke all on function public.mark_stale_shifts() from public, anon, authenticated;
revoke all on function public.purge_old_gps() from public, anon, authenticated;
grant execute on function public.export_worker(uuid) to service_role;
grant execute on function public.mark_stale_shifts() to service_role;
grant execute on function public.purge_old_gps() to service_role;

-- Client roles can read audit events only through RLS; they cannot forge or
-- mutate them even if project-level default grants change later.
revoke insert, update, delete, truncate on table public.audit_logs from anon, authenticated;

-- Freeze a worker's completed punch. The one supported transition is open to
-- closed; offline sync may harmlessly resend identical values afterwards.
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

  if tg_op = 'UPDATE'
     and not public.is_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
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

    if old.status = 'closed' and new is distinct from old then
      raise exception 'A completed shift can only be corrected by an admin';
    end if;
    if old.status = 'open' and new.status = 'closed' and new.ended_at is null then
      raise exception 'A completed shift requires an end time';
    end if;
    if old.status = 'open' and new.status = 'open'
       and (new.ended_at is not null
            or new.end_lat is not null
            or new.end_lng is not null
            or new.end_accuracy_m is not null
            or new.end_address is not null) then
      raise exception 'An open shift cannot contain end fields';
    end if;
  end if;

  return new;
end $$;

-- The GPS purge runs as service_role and must be allowed through this trigger.
