-- ============================================================================
-- 0002_rls.sql — Row Level Security
-- ----------------------------------------------------------------------------
-- Worker: reads/writes only their own shifts/breaks; reads own profile + sites
--         in their company. Admin: full access within their own company_id.
-- Authorization lives entirely here — there is no custom server. (D-005)
-- ============================================================================

-- ── helpers (SECURITY DEFINER to avoid RLS recursion when reading profiles) ──
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

-- ── enable RLS ──
alter table public.companies   enable row level security;
alter table public.profiles    enable row level security;
alter table public.sites       enable row level security;
alter table public.shifts      enable row level security;
alter table public.breaks      enable row level security;
alter table public.shift_edits enable row level security;
alter table public.consents    enable row level security;

-- ── companies ──
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
  for select using (id = public.current_company_id());

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies
  for update using (id = public.current_company_id() and public.is_admin());

-- ── profiles ──
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

-- ── sites ──
drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites
  for select using (company_id = public.current_company_id());

drop policy if exists sites_admin_write on public.sites;
create policy sites_admin_write on public.sites
  for all using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

-- ── shifts ──
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

-- ── breaks (guarded through the parent shift's ownership) ──
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

-- ── shift_edits (readable by owner/admin; only admins create) ──
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

-- ── consents (a worker manages their own; admin may read for compliance) ──
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
