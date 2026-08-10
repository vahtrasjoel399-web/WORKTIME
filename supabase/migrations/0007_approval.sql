-- ============================================================================
-- 0007_approval.sql — employer approves self-registered workers
-- ----------------------------------------------------------------------------
-- A worker who registers with a company code lands as "pending" (is_approved =
-- false). The employer sees them in the panel and clicks Accept. Admins and
-- employer-created workers are approved by default.
-- Paste this whole file into Supabase → SQL Editor → Run.
-- ============================================================================

alter table public.profiles
  add column if not exists is_approved boolean not null default true;

-- self-registration now creates a PENDING worker
create or replace function public.register_worker(
  p_join_code text,
  worker_first text,
  worker_last text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target_company uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'profile already exists';
  end if;

  select id into target_company
    from public.companies
   where join_code = upper(trim(p_join_code))
   limit 1;

  if target_company is null then
    raise exception 'invalid company code';
  end if;

  insert into public.profiles (id, company_id, first_name, last_name, role, is_active, is_approved, locale)
    values (auth.uid(), target_company, coalesce(worker_first,''), coalesce(worker_last,''),
            'worker', true, false, 'et');   -- pending until employer approves
end $$;
