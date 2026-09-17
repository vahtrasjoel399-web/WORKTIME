-- ============================================================================
-- 0013_workforce_rls.sql — workforce tenant isolation and access control
-- ----------------------------------------------------------------------------
-- Company admins can manage only their own tenant. Workers can read only their
-- own profile, shifts, assignments and current site. Employee documents are
-- admin-only. Storage object policies are added separately in Phase 3.
-- ============================================================================

-- ── RLS is mandatory on every tenant/sensitive table ──
alter table public.companies            enable row level security;
alter table public.profiles             enable row level security;
alter table public.sites                enable row level security;
alter table public.employee_documents   enable row level security;
alter table public.employee_assignments enable row level security;
alter table public.shifts               enable row level security;
alter table public.breaks               enable row level security;
alter table public.shift_edits          enable row level security;
alter table public.consents             enable row level security;
alter table public.audit_logs           enable row level security;

-- Anonymous clients authenticate through Supabase Auth; they never need direct
-- table access. Authenticated access below is still constrained by RLS.
revoke all on table public.companies from anon;
revoke all on table public.profiles from anon;
revoke all on table public.sites from anon;
revoke all on table public.employee_documents from anon;
revoke all on table public.employee_assignments from anon;
revoke all on table public.shifts from anon;
revoke all on table public.breaks from anon;
revoke all on table public.shift_edits from anon;
revoke all on table public.consents from anon;
revoke all on table public.audit_logs from anon;

grant select, insert, update, delete on table public.employee_documents to authenticated;
grant select, insert, update, delete on table public.employee_assignments to authenticated;

-- RLS helper functions are intended only for signed-in sessions.
revoke all on function public.current_company_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- nearest_site bypasses RLS internally and is used only by the shift trigger.
-- Do not expose it as a cross-tenant site lookup RPC.
revoke all on function public.nearest_site(uuid, double precision, double precision)
  from public, anon, authenticated;

-- ── profile tenant integrity ──
-- A worker cannot be silently moved between tenants, and default_site_id must
-- always reference an object owned by the same company.
create or replace function public.guard_profile_tenant_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'A profile company cannot be changed';
  end if;

  if new.default_site_id is not null and not exists (
    select 1
      from public.sites s
     where s.id = new.default_site_id
       and s.company_id = new.company_id
  ) then
    raise exception 'Profile site belongs to another company';
  end if;

  return new;
end
$$;

drop trigger if exists trg_guard_profile_tenant_fields on public.profiles;
create trigger trg_guard_profile_tenant_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_tenant_fields();

revoke all on function public.guard_profile_tenant_fields()
  from public, anon, authenticated;

-- ── companies ──
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
  for select to authenticated
  using (id = public.current_company_id());

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies
  for update to authenticated
  using (public.is_admin() and id = public.current_company_id())
  with check (public.is_admin() and id = public.current_company_id());

-- ── employees/profiles ──
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.is_admin() and company_id = public.current_company_id())
  );

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid() and company_id = public.current_company_id())
  with check (id = auth.uid() and company_id = public.current_company_id());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ── employee documents ──
-- No worker policy exists: a worker cannot list, open or mutate any employee
-- document, including their own CV. Admin access remains tenant-scoped.
drop policy if exists employee_documents_admin_select on public.employee_documents;
create policy employee_documents_admin_select on public.employee_documents
  for select to authenticated
  using (public.is_admin() and company_id = public.current_company_id());

drop policy if exists employee_documents_admin_insert on public.employee_documents;
create policy employee_documents_admin_insert on public.employee_documents
  for insert to authenticated
  with check (
    public.is_admin()
    and company_id = public.current_company_id()
    and uploaded_by = auth.uid()
  );

drop policy if exists employee_documents_admin_update on public.employee_documents;
create policy employee_documents_admin_update on public.employee_documents
  for update to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

drop policy if exists employee_documents_admin_delete on public.employee_documents;
create policy employee_documents_admin_delete on public.employee_documents
  for delete to authenticated
  using (public.is_admin() and company_id = public.current_company_id());

-- ── employee assignment history ──
drop policy if exists employee_assignments_read on public.employee_assignments;
create policy employee_assignments_read on public.employee_assignments
  for select to authenticated
  using (
    employee_id = auth.uid()
    or (public.is_admin() and company_id = public.current_company_id())
  );

drop policy if exists employee_assignments_admin_insert on public.employee_assignments;
create policy employee_assignments_admin_insert on public.employee_assignments
  for insert to authenticated
  with check (
    public.is_admin()
    and company_id = public.current_company_id()
    and created_by = auth.uid()
  );

drop policy if exists employee_assignments_admin_update on public.employee_assignments;
create policy employee_assignments_admin_update on public.employee_assignments
  for update to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

drop policy if exists employee_assignments_admin_delete on public.employee_assignments;
create policy employee_assignments_admin_delete on public.employee_assignments
  for delete to authenticated
  using (public.is_admin() and company_id = public.current_company_id());

-- ── objects/sites ──
-- Admins see their company's sites. Workers see only the current assignment;
-- default_site_id is retained as a compatibility fallback until Phase 8.
drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_admin()
      or exists (
        select 1
          from public.employee_assignments a
         where a.employee_id = auth.uid()
           and a.site_id = sites.id
           and a.end_date is null
      )
      or exists (
        select 1
          from public.profiles p
         where p.id = auth.uid()
           and p.default_site_id = sites.id
      )
    )
  );

drop policy if exists sites_admin_write on public.sites;
create policy sites_admin_write on public.sites
  for all to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ── shifts ──
drop policy if exists shifts_worker_select on public.shifts;
create policy shifts_worker_select on public.shifts
  for select to authenticated
  using (
    (user_id = auth.uid() and company_id = public.current_company_id())
    or (public.is_admin() and company_id = public.current_company_id())
  );

drop policy if exists shifts_worker_insert on public.shifts;
create policy shifts_worker_insert on public.shifts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and source = 'app'
  );

drop policy if exists shifts_worker_update on public.shifts;
create policy shifts_worker_update on public.shifts
  for update to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id())
  with check (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and source = 'app'
  );

drop policy if exists shifts_admin_all on public.shifts;
create policy shifts_admin_all on public.shifts
  for all to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ── breaks ──
drop policy if exists breaks_select on public.breaks;
create policy breaks_select on public.breaks
  for select to authenticated
  using (
    exists (
      select 1
        from public.shifts s
       where s.id = breaks.shift_id
         and (
           (s.user_id = auth.uid() and s.company_id = public.current_company_id())
           or (public.is_admin() and s.company_id = public.current_company_id())
         )
    )
  );

drop policy if exists breaks_worker_write on public.breaks;
create policy breaks_worker_write on public.breaks
  for all to authenticated
  using (
    exists (
      select 1 from public.shifts s
       where s.id = breaks.shift_id
         and s.user_id = auth.uid()
         and s.company_id = public.current_company_id()
         and s.status = 'open'
    )
  )
  with check (
    exists (
      select 1 from public.shifts s
       where s.id = breaks.shift_id
         and s.user_id = auth.uid()
         and s.company_id = public.current_company_id()
         and s.status = 'open'
    )
  );

drop policy if exists breaks_admin_write on public.breaks;
create policy breaks_admin_write on public.breaks
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.shifts s
       where s.id = breaks.shift_id
         and s.company_id = public.current_company_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.shifts s
       where s.id = breaks.shift_id
         and s.company_id = public.current_company_id()
    )
  );

-- ── shift edit history ──
drop policy if exists shift_edits_select on public.shift_edits;
create policy shift_edits_select on public.shift_edits
  for select to authenticated
  using (
    exists (
      select 1
        from public.shifts s
       where s.id = shift_edits.shift_id
         and (
           (s.user_id = auth.uid() and s.company_id = public.current_company_id())
           or (public.is_admin() and s.company_id = public.current_company_id())
         )
    )
  );

drop policy if exists shift_edits_admin_insert on public.shift_edits;
create policy shift_edits_admin_insert on public.shift_edits
  for insert to authenticated
  with check (
    public.is_admin()
    and edited_by = auth.uid()
    and exists (
      select 1 from public.shifts s
       where s.id = shift_edits.shift_id
         and s.company_id = public.current_company_id()
    )
  );

-- ── consent records ──
drop policy if exists consents_self on public.consents;
drop policy if exists consents_self_read on public.consents;
drop policy if exists consents_self_insert on public.consents;
drop policy if exists consents_admin_read on public.consents;

create policy consents_self_read on public.consents
  for select to authenticated
  using (user_id = auth.uid());

create policy consents_self_insert on public.consents
  for insert to authenticated
  with check (user_id = auth.uid());

create policy consents_admin_read on public.consents
  for select to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.profiles p
       where p.id = consents.user_id
         and p.company_id = public.current_company_id()
    )
  );

-- ── append-only audit log ──
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated
  using (public.is_admin() and company_id = public.current_company_id());

revoke insert, update, delete, truncate on table public.audit_logs
  from anon, authenticated;

-- Trigger/helper functions must not be callable as public RPCs. Their triggers
-- and trusted service-role workflows continue to function.
revoke all on function public.guard_employee_document_tenant()
  from public, anon, authenticated;
revoke all on function public.guard_employee_assignment_tenant()
  from public, anon, authenticated;
revoke all on function public.guard_shift_tenant_fields()
  from public, anon, authenticated;
revoke all on function public.set_shift_company()
  from public, anon, authenticated;
revoke all on function public.set_shift_site()
  from public, anon, authenticated;
revoke all on function public.protect_profile_columns()
  from public, anon, authenticated;
revoke all on function public.set_profile_email()
  from public, anon, authenticated;
revoke all on function public.set_updated_at()
  from public, anon, authenticated;

