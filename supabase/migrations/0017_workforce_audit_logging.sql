-- ============================================================================
-- 0017_workforce_audit_logging.sql — append-only workforce audit events
-- ----------------------------------------------------------------------------
-- Reuses public.audit_logs from 0009. Triggers capture browser/RLS writes at
-- the database boundary; the invitation API records service-role creation with
-- the authenticated admin id explicitly. Metadata contains identifiers and
-- event categories only — never names, email addresses, filenames or CV data.
-- ============================================================================

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_action text;
begin
  if new.role <> 'worker' then
    return new;
  end if;

  if old.is_approved is false and new.is_approved is true then
    event_action := 'employee.created';
  elsif old.is_active is true and new.is_active is false then
    event_action := 'employee.deactivated';
  elsif row(
    old.first_name,
    old.last_name,
    old.email,
    old.phone,
    old.position,
    old.is_active,
    old.profile_photo_path,
    old.hourly_rate
  ) is distinct from row(
    new.first_name,
    new.last_name,
    new.email,
    new.phone,
    new.position,
    new.is_active,
    new.profile_photo_path,
    new.hourly_rate
  ) then
    event_action := 'employee.updated';
  else
    return new;
  end if;

  insert into public.audit_logs (
    company_id, actor_id, action, target_type, target_id
  ) values (
    new.company_id, auth.uid(), event_action, 'employee', new.id
  );

  return new;
end
$$;

drop trigger if exists trg_audit_profile_change on public.profiles;
create trigger trg_audit_profile_change
  after update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_employee_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.employee_documents%rowtype;
  event_action text;
  event_actor uuid;
begin
  if tg_op = 'DELETE' then
    source_row := old;
  else
    source_row := new;
  end if;
  if tg_op = 'INSERT' then
    event_actor := coalesce(auth.uid(), new.uploaded_by);
    if new.document_type = 'cv' and exists (
      select 1
        from public.employee_documents d
       where d.employee_id = new.employee_id
         and d.document_type = 'cv'
         and d.id <> new.id
    ) then
      event_action := 'document.replaced';
    else
      event_action := 'document.uploaded';
    end if;
  elsif tg_op = 'UPDATE' then
    event_actor := auth.uid();
    if row(old.storage_path, old.filename, old.document_type)
       is not distinct from row(new.storage_path, new.filename, new.document_type) then
      return new;
    end if;
    event_action := 'document.replaced';
  else
    event_actor := auth.uid();
    event_action := 'document.deleted';
  end if;

  insert into public.audit_logs (
    company_id, actor_id, action, target_type, target_id, metadata
  ) values (
    source_row.company_id,
    event_actor,
    event_action,
    'employee_document',
    source_row.id,
    jsonb_build_object(
      'employee_id', source_row.employee_id,
      'document_type', source_row.document_type
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists trg_audit_employee_document_change on public.employee_documents;
create trigger trg_audit_employee_document_change
  after insert or update or delete on public.employee_documents
  for each row execute function public.audit_employee_document_change();

create or replace function public.audit_site_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and row(
    old.name, old.address, old.description, old.status, old.lat, old.lng, old.radius_m
  ) is not distinct from row(
    new.name, new.address, new.description, new.status, new.lat, new.lng, new.radius_m
  ) then
    return new;
  end if;

  insert into public.audit_logs (
    company_id, actor_id, action, target_type, target_id
  ) values (
    new.company_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'object.created' else 'object.updated' end,
    'object',
    new.id
  );

  return new;
end
$$;

drop trigger if exists trg_audit_site_change on public.sites;
create trigger trg_audit_site_change
  after insert or update on public.sites
  for each row execute function public.audit_site_change();

-- Keep assignment mutation and its audit event in the same transaction.
-- Authenticated clients must use this RPC; the service role remains available
-- for the trusted create-employee route, which writes its audit event itself.
revoke insert, update, delete on table public.employee_assignments
  from authenticated;

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
  employee_default_site_id uuid;
  current_assignment_id uuid;
  current_site_id uuid;
  new_assignment_id uuid;
  event_action text;
  event_target_id uuid;
  event_metadata jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  actor_company := public.current_company_id();

  select p.company_id, p.default_site_id
    into employee_company, employee_default_site_id
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

  if current_assignment_id is not null and current_site_id is not distinct from p_site_id then
    return current_assignment_id;
  end if;

  if current_assignment_id is null and p_site_id is null and employee_default_site_id is null then
    return null;
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
    event_action := 'employee.removed_from_object';
    event_target_id := current_assignment_id;
    event_metadata := jsonb_build_object('site_id', coalesce(current_site_id, employee_default_site_id));
  else
    insert into public.employee_assignments (
      company_id, employee_id, site_id, start_date, created_by
    ) values (
      employee_company, p_employee_id, p_site_id, current_date, auth.uid()
    ) returning id into new_assignment_id;

    update public.profiles
       set default_site_id = p_site_id
     where id = p_employee_id;

    event_target_id := new_assignment_id;
    if current_assignment_id is null then
      event_action := 'employee.assigned_to_object';
      event_metadata := jsonb_build_object('site_id', p_site_id);
    else
      event_action := 'employee.moved_to_object';
      event_metadata := jsonb_build_object(
        'from_site_id', current_site_id,
        'to_site_id', p_site_id
      );
    end if;
  end if;

  insert into public.audit_logs (
    company_id, actor_id, action, target_type, target_id, metadata
  ) values (
    employee_company,
    auth.uid(),
    event_action,
    'employee_assignment',
    event_target_id,
    event_metadata || jsonb_build_object('employee_id', p_employee_id)
  );

  return new_assignment_id;
end
$$;

revoke all on function public.set_employee_assignment(uuid, uuid)
  from public, anon;
grant execute on function public.set_employee_assignment(uuid, uuid)
  to authenticated;

revoke all on function public.audit_profile_change()
  from public, anon, authenticated;
revoke all on function public.audit_employee_document_change()
  from public, anon, authenticated;
revoke all on function public.audit_site_change()
  from public, anon, authenticated;
