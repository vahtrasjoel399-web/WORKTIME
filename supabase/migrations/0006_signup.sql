-- ============================================================================
-- 0006_signup.sql — self-service registration
-- ----------------------------------------------------------------------------
-- Two SECURITY DEFINER RPCs let a freshly-signed-up auth user create their own
-- profile (which RLS would otherwise block, since they have no company yet):
--   register_company() — first user: creates a company + becomes its admin,
--                         returns a short join code to share.
--   register_worker()  — everyone else: joins an existing company by that code
--                         and becomes a worker.
-- Enable email signup in the Supabase dashboard (Auth → Providers → Email) too.
-- ============================================================================

-- short, human-friendly company code (6 chars, ambiguous letters removed)
create or replace function public.gen_join_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random()*32)+1)::int, 1), '')
  from generate_series(1, 6)
$$;

-- First user creates a company and becomes admin. Returns the join code.
create or replace function public.register_company(
  company_name text,
  admin_first text,
  admin_last text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_company uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'profile already exists';
  end if;

  -- generate a unique code
  loop
    code := public.gen_join_code();
    exit when not exists (select 1 from public.companies where join_code = code);
  end loop;

  insert into public.companies (name, join_code)
    values (nullif(trim(company_name), ''), code)
    returning id into new_company;

  insert into public.profiles (id, company_id, first_name, last_name, role, is_active, locale)
    values (auth.uid(), new_company, coalesce(admin_first,''), coalesce(admin_last,''), 'admin', true, 'et');

  return code;
end $$;

-- Everyone else joins an existing company by its code and becomes a worker.
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

  insert into public.profiles (id, company_id, first_name, last_name, role, is_active, locale)
    values (auth.uid(), target_company, coalesce(worker_first,''), coalesce(worker_last,''), 'worker', true, 'et');
end $$;

grant execute on function public.register_company(text, text, text) to authenticated;
grant execute on function public.register_worker(text, text, text)  to authenticated;
grant execute on function public.gen_join_code() to authenticated;
