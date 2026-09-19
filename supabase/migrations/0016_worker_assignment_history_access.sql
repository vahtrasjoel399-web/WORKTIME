-- ============================================================================
-- 0016_worker_assignment_history_access.sql — worker object-history visibility
-- ----------------------------------------------------------------------------
-- A worker may read site details only when that site appears in their own
-- assignment history. This supports the mobile work-history screen without
-- exposing other workers, documents or unrelated company sites.
-- ============================================================================

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
      )
      or exists (
        select 1
          from public.profiles p
         where p.id = auth.uid()
           and p.default_site_id = sites.id
      )
    )
  );
