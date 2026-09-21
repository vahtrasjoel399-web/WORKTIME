-- ============================================================================
-- 0019_pricing_system.sql — hourly, area and quantity based work pricing
-- ----------------------------------------------------------------------------
-- Profiles hold the default pricing configuration. Every shift snapshots that
-- configuration so changing a worker's future rate never rewrites payroll
-- history. The database is the source of truth for the final rounded amount.
-- ============================================================================

do $$ begin
  create type public.pricing_type as enum ('hourly', 'area', 'quantity');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists pricing_type public.pricing_type not null default 'hourly',
  add column if not exists pricing_unit text;

alter table public.profiles
  drop constraint if exists profiles_pricing_unit_check,
  drop constraint if exists profiles_pricing_rate_check;
alter table public.profiles
  add constraint profiles_pricing_unit_check check (
    pricing_type <> 'quantity'
    or (pricing_unit is not null and length(trim(pricing_unit)) between 1 and 24)
  );
alter table public.profiles
  add constraint profiles_pricing_rate_check check (
    (hourly_rate is null or hourly_rate >= 0)
    and (self_hourly_rate is null or self_hourly_rate >= 0)
    and (pricing_type = 'hourly' or hourly_rate is not null)
  );

alter table public.shifts
  add column if not exists pricing_type public.pricing_type,
  add column if not exists pricing_rate numeric(12,4),
  add column if not exists quantity numeric(14,3),
  add column if not exists unit text,
  add column if not exists calculated_total numeric(14,2);

-- Existing records predate pricing selection and are therefore hourly. The
-- best available historical rate is the worker's current employer/personal
-- rate; future records snapshot the exact rate at creation time.
-- The tenant guard intentionally rejects edits to closed shifts when there is
-- no authenticated admin/service JWT. A migration runs without either, so
-- suspend only that guard for this trusted backfill. PostgreSQL restores the
-- trigger automatically if any later statement in this transaction fails.
alter table public.shifts disable trigger trg_guard_shift_tenant_fields;

update public.shifts s
   set pricing_type = 'hourly',
       pricing_rate = coalesce(p.hourly_rate, p.self_hourly_rate),
       calculated_total = case
         when s.status = 'closed' and coalesce(p.hourly_rate, p.self_hourly_rate) is not null
           then round((coalesce(s.worked_seconds, 0)::numeric / 3600) * coalesce(p.hourly_rate, p.self_hourly_rate), 2)
         else null
       end
  from public.profiles p
 where p.id = s.user_id
   and s.pricing_type is null;

alter table public.shifts enable trigger trg_guard_shift_tenant_fields;

alter table public.shifts
  alter column pricing_type set default 'hourly',
  alter column pricing_type set not null;

alter table public.shifts
  drop constraint if exists shifts_pricing_rate_check,
  drop constraint if exists shifts_quantity_check,
  drop constraint if exists shifts_unit_check,
  drop constraint if exists shifts_calculated_total_check;
alter table public.shifts
  add constraint shifts_pricing_rate_check check (pricing_rate is null or pricing_rate >= 0),
  add constraint shifts_quantity_check check (quantity is null or quantity >= 0),
  add constraint shifts_unit_check check (unit is null or length(trim(unit)) between 1 and 24),
  add constraint shifts_calculated_total_check check (calculated_total is null or calculated_total >= 0);

create or replace function public.calculate_work_total(
  p_pricing_type public.pricing_type,
  p_rate numeric,
  p_worked_seconds integer,
  p_quantity numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_rate is null then null
    when p_pricing_type = 'hourly'
      then round((greatest(coalesce(p_worked_seconds, 0), 0)::numeric / 3600) * p_rate, 2)
    when p_quantity is null then null
    else round(p_quantity * p_rate, 2)
  end
$$;

create or replace function public.set_shift_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_type public.pricing_type;
  profile_rate numeric;
  profile_unit text;
  effective_seconds integer;
  trusted_actor boolean;
begin
  select p.pricing_type,
         case when p.pricing_type = 'hourly'
              then coalesce(p.hourly_rate, p.self_hourly_rate)
              else p.hourly_rate end,
         p.pricing_unit
    into profile_type, profile_rate, profile_unit
    from public.profiles p
   where p.id = new.user_id;

  if profile_type is null then
    raise exception 'Shift owner has no pricing profile';
  end if;

  trusted_actor := public.is_admin() or coalesce(auth.role(), '') = 'service_role';

  if tg_op = 'INSERT' then
    if trusted_actor then
      new.pricing_type := coalesce(new.pricing_type, profile_type);
      new.pricing_rate := coalesce(new.pricing_rate, profile_rate);
      new.unit := coalesce(nullif(trim(new.unit), ''), profile_unit);
    else
      -- Workers cannot choose a more favourable rate in a direct API call.
      new.pricing_type := profile_type;
      new.pricing_rate := profile_rate;
      new.unit := profile_unit;
    end if;
  elsif not trusted_actor then
    new.pricing_type := old.pricing_type;
    new.pricing_rate := old.pricing_rate;
    new.unit := old.unit;
  end if;

  if new.pricing_type = 'hourly' then
    new.quantity := null;
    new.unit := null;
  elsif new.pricing_type = 'area' then
    new.unit := 'm²';
  else
    new.unit := nullif(trim(new.unit), '');
  end if;

  if new.pricing_rate is not null and new.pricing_rate < 0 then
    raise exception 'Pricing rate cannot be negative';
  end if;
  if new.quantity is not null and new.quantity < 0 then
    raise exception 'Completed quantity cannot be negative';
  end if;
  if new.pricing_type = 'quantity' and new.unit is null then
    raise exception 'Quantity based work requires a unit';
  end if;

  if new.status = 'closed' then
    if new.pricing_type <> 'hourly' and new.pricing_rate is null then
      raise exception 'Completed work requires a pricing rate';
    end if;
    if new.pricing_type <> 'hourly' and new.quantity is null then
      raise exception 'Completed area or quantity work requires a completed quantity';
    end if;
    effective_seconds := greatest(
      0,
      floor(extract(epoch from (new.ended_at - new.started_at)))::integer - new.break_seconds
    );
    new.calculated_total := public.calculate_work_total(
      new.pricing_type, new.pricing_rate, effective_seconds, new.quantity
    );
  else
    new.calculated_total := null;
  end if;

  return new;
end
$$;

drop trigger if exists trg_00_set_shift_pricing on public.shifts;
create trigger trg_00_set_shift_pricing
  before insert or update on public.shifts
  for each row execute function public.set_shift_pricing();

-- Add pricing configuration to the existing employer-managed profile guard.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.hourly_rate        is distinct from old.hourly_rate
     or new.role            is distinct from old.role
     or new.is_active       is distinct from old.is_active
     or new.is_approved     is distinct from old.is_approved
     or new.company_id      is distinct from old.company_id
     or new.default_site_id is distinct from old.default_site_id
     or new.first_name      is distinct from old.first_name
     or new.last_name       is distinct from old.last_name
     or new.phone           is distinct from old.phone
     or new.email           is distinct from old.email
     or new.position        is distinct from old.position
     or new.profile_photo_path is distinct from old.profile_photo_path
     or new.pricing_type    is distinct from old.pricing_type
     or new.pricing_unit    is distinct from old.pricing_unit then
    raise exception 'Not allowed to modify employer-managed profile fields';
  end if;
  return new;
end $$;

-- Include pricing changes in the established employee audit event.
create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare event_action text;
begin
  if new.role <> 'worker' then return new; end if;

  if old.is_approved is false and new.is_approved is true then
    event_action := 'employee.created';
  elsif old.is_active is true and new.is_active is false then
    event_action := 'employee.deactivated';
  elsif row(
    old.first_name, old.last_name, old.email, old.phone, old.position,
    old.is_active, old.profile_photo_path, old.hourly_rate,
    old.pricing_type, old.pricing_unit
  ) is distinct from row(
    new.first_name, new.last_name, new.email, new.phone, new.position,
    new.is_active, new.profile_photo_path, new.hourly_rate,
    new.pricing_type, new.pricing_unit
  ) then
    event_action := 'employee.updated';
  else
    return new;
  end if;

  insert into public.audit_logs (company_id, actor_id, action, target_type, target_id)
  values (new.company_id, auth.uid(), event_action, 'employee', new.id);
  return new;
end
$$;

-- Keep the existing report-view column order and append pricing fields so
-- CREATE OR REPLACE remains compatible with deployed consumers.
create or replace view public.v_shift_report
with (security_invoker = true) as
select
  s.id, s.company_id, s.user_id, s.site_id,
  s.started_at, s.start_lat, s.start_lng, s.start_accuracy_m, s.start_address,
  s.ended_at, s.end_lat, s.end_lng, s.end_accuracy_m, s.end_address,
  s.break_seconds, s.worked_seconds, s.status, s.source, s.is_stale, s.note, s.created_at,
  round(coalesce(s.worked_seconds, 0) / 3600.0, 2) as worked_hours,
  (s.started_at at time zone 'UTC')::date as work_date,
  public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) as start_distance_m,
  case
    when si.id is null or si.lat is null then null
    else public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) > si.radius_m
  end as out_of_zone,
  p.first_name, p.last_name,
  si.name as site_name,
  s.pricing_type, s.pricing_rate, s.quantity, s.unit, s.calculated_total
from public.shifts s
join public.profiles p on p.id = s.user_id
left join public.sites si on si.id = s.site_id;

grant execute on function public.calculate_work_total(public.pricing_type, numeric, integer, numeric)
  to authenticated, service_role;
