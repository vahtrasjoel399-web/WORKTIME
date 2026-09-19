-- ============================================================================
-- 0015_employee_assignment_management.sql — atomic employee ↔ site changes
-- ----------------------------------------------------------------------------
-- Admins assign, move or remove a worker through one tenant-checked transaction.
-- The history row is closed instead of deleted, while default_site_id remains
-- synchronized for the existing shift attribution fallback.
-- ============================================================================

create or replace function public.set_employee_assignment(
  p_employee_id uuid,
  p_site_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_company uuid;
  employee_company uuid;
  current_assignment_id uuid;
  current_site_id uuid;
  new_assignment_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  actor_company := public.current_company_id();

  -- Lock the employee row so two simultaneous moves cannot create competing
  -- current assignments. The partial unique index remains a second safeguard.
  select p.company_id
    into employee_company
    from public.profiles p
   where p.id = p_employee_id
     and p.role = 'worker'
     and p.company_id = actor_company
   for update;

  if employee_company is null then
    raise exception 'Employee not found in your company';
  end if;

  if p_site_id is not null and not exists (
    select 1
      from public.sites s
     where s.id = p_site_id
       and s.company_id = employee_company
       and s.status = 'active'
  ) then
    raise exception 'Active site not found in your company';
  end if;

  select a.id, a.site_id
    into current_assignment_id, current_site_id
    from public.employee_assignments a
   where a.employee_id = p_employee_id
     and a.end_date is null
   for update;

  -- Repeating the current assignment is idempotent.
  if current_assignment_id is not null and current_site_id is not distinct from p_site_id then
    return current_assignment_id;
  end if;

  if current_assignment_id is not null then
    update public.employee_assignments
       set end_date = greatest(start_date, current_date)
     where id = current_assignment_id;
  end if;

  if p_site_id is null then
    update public.profiles
       set default_site_id = null
     where id = p_employee_id;
    return null;
  end if;

  insert into public.employee_assignments (
    company_id,
    employee_id,
    site_id,
    start_date,
    created_by
  ) values (
    employee_company,
    p_employee_id,
    p_site_id,
    current_date,
    auth.uid()
  )
  returning id into new_assignment_id;

  update public.profiles
     set default_site_id = p_site_id
   where id = p_employee_id;

  return new_assignment_id;
end
$$;

revoke all on function public.set_employee_assignment(uuid, uuid)
  from public, anon;
grant execute on function public.set_employee_assignment(uuid, uuid)
  to authenticated;
