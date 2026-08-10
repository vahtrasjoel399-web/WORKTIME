-- ============================================================================
-- 0005_assignment.sql — a worker's default job site (admin assigns)
-- New punches are attributed to this site so the "out of zone" flag is meaningful.
-- ============================================================================

alter table public.profiles
  add column if not exists default_site_id uuid references public.sites(id) on delete set null;

-- assign the two demo Ülemiste workers, one Mustamäe
update public.profiles set default_site_id = '22222222-0000-0000-0000-000000000001'
 where id in ('00000001-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000002');
update public.profiles set default_site_id = '22222222-0000-0000-0000-000000000002'
 where id in ('00000001-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000005');
