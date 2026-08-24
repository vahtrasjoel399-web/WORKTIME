-- ============================================================================
-- 0008_auto_site.sql — a punch finds its own job site
-- ----------------------------------------------------------------------------
-- Until now `site_id` was only ever set if a client sent it, so web punches had
-- none: the employer's list showed "—" and `out_of_zone` stayed null. The GPS
-- fix taken at shift start already says where the worker is, so the database
-- resolves the site itself: nearest company site whose radius contains the fix,
-- else the worker's assigned default site. (DECISIONS D-016)
-- ============================================================================

-- ── nearest site containing the point, within its own radius ──
create or replace function public.nearest_site(
  p_company uuid,
  p_lat double precision,
  p_lng double precision
) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id
    from public.sites s
   where s.company_id = p_company
     and s.lat is not null
     and s.lng is not null
     and public.distance_m(p_lat, p_lng, s.lat, s.lng) <= s.radius_m
   order by public.distance_m(p_lat, p_lng, s.lat, s.lng)
   limit 1
$$;

-- ── fill site_id on insert, and again if the start fix is corrected later ──
create or replace function public.set_shift_site()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.site_id is null and new.start_lat is not null and new.start_lng is not null then
    new.site_id := public.nearest_site(new.company_id, new.start_lat, new.start_lng);
  end if;
  -- no geo match (fix outside every radius, or site coordinates not filled in):
  -- fall back to the site the employer assigned to this worker
  if new.site_id is null then
    new.site_id := (select default_site_id from public.profiles where id = new.user_id);
  end if;
  return new;
end $$;

-- Runs after trg_set_shift_company (same timing, alphabetical order), so
-- company_id is already resolved when this looks up the company's sites.
drop trigger if exists trg_set_shift_site on public.shifts;
create trigger trg_set_shift_site
  before insert or update of start_lat, start_lng on public.shifts
  for each row execute function public.set_shift_site();

-- ── backfill: attribute existing shifts that were recorded without a site ──
update public.shifts s
   set site_id = coalesce(
         public.nearest_site(s.company_id, s.start_lat, s.start_lng),
         (select p.default_site_id from public.profiles p where p.id = s.user_id)
       )
 where s.site_id is null;
