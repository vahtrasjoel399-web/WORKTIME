-- ============================================================================
-- 0003_functions.sql — triggers, guards, derived views, maintenance jobs
-- ============================================================================

-- ── haversine distance in metres ──
create or replace function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end
$$;

-- ── guard: non-admins may not touch protected profile columns ──
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;   -- admins may set rate/role/active/etc within their company (RLS checked)
  end if;
  -- worker self-update: freeze employer-owned fields
  if new.hourly_rate    is distinct from old.hourly_rate
     or new.role        is distinct from old.role
     or new.is_active   is distinct from old.is_active
     or new.company_id  is distinct from old.company_id
     or new.first_name  is distinct from old.first_name
     or new.last_name   is distinct from old.last_name then
    raise exception 'Not allowed to modify employer-managed fields';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ── defense: force company_id / defaults on shift insert from client ──
create or replace function public.set_shift_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.company_id := coalesce(new.company_id, (select company_id from public.profiles where id = new.user_id));
  return new;
end $$;

drop trigger if exists trg_set_shift_company on public.shifts;
create trigger trg_set_shift_company
  before insert on public.shifts
  for each row execute function public.set_shift_company();

-- ── report view: hours + out-of-zone flag (admin-facing) ──
create or replace view public.v_shift_report
with (security_invoker = true) as
select
  s.*,
  round(coalesce(s.worked_seconds, 0) / 3600.0, 2)                          as worked_hours,
  (s.started_at at time zone 'UTC')::date                                    as work_date,
  public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng)               as start_distance_m,
  case
    when si.id is null or si.lat is null then null
    else public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) > si.radius_m
  end                                                                        as out_of_zone,
  p.first_name, p.last_name,
  si.name as site_name
from public.shifts s
join public.profiles p on p.id = s.user_id
left join public.sites si on si.id = s.site_id;

-- ── maintenance: flag shifts open longer than 16h (called by Edge Function) ──
create or replace function public.mark_stale_shifts()
returns setof public.shifts
language sql security definer set search_path = public as $$
  update public.shifts
     set is_stale = true
   where status = 'open'
     and is_stale = false
     and started_at < now() - interval '16 hours'
  returning *;
$$;

-- ── maintenance: GDPR — drop GPS coords older than 24 months ──
create or replace function public.purge_old_gps()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.shifts
     set start_lat = null, start_lng = null, start_accuracy_m = null,
         end_lat = null, end_lng = null, end_accuracy_m = null
   where started_at < now() - interval '24 months'
     and (start_lat is not null or end_lat is not null);
  get diagnostics n = row_count;
  return n;
end $$;

-- ── GDPR: full export of one worker (admin/service only) ──
create or replace function public.export_worker(target uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'profile',  (select to_jsonb(p) from public.profiles p where p.id = target),
    'shifts',   (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.shifts s where s.user_id = target),
    'breaks',   (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
                   from public.breaks b join public.shifts s on s.id = b.shift_id where s.user_id = target),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.consents c where c.user_id = target),
    'exported_at', now()
  );
$$;

grant execute on function public.distance_m(double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.export_worker(uuid) to service_role;
grant execute on function public.mark_stale_shifts() to service_role;
grant execute on function public.purge_old_gps() to service_role;
