-- Multiple net pay rates, site metadata and explicit monthly adjustments.
-- Existing profile/shift pricing columns remain as a backwards-compatible default.

alter table public.sites
  add column if not exists country_code text,
  add column if not exists currency text not null default 'EUR',
  add column if not exists timezone text not null default 'Europe/Tallinn';

create table if not exists public.worker_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  pricing_type public.pricing_type not null,
  unit text,
  rate numeric(12,4) not null check (rate >= 0),
  currency text not null default 'EUR' check (length(currency) = 3),
  is_net boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_rates_unit_check check (
    (pricing_type = 'hourly' and unit is null)
    or (pricing_type = 'area' and unit = 'm²')
    or (pricing_type = 'quantity' and length(trim(unit)) between 1 and 24)
  )
);

create index if not exists worker_rates_employee_active_idx
  on public.worker_rates(employee_id, is_active, site_id);

create table if not exists public.monthly_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  amount numeric(14,2) not null,
  currency text not null default 'EUR' check (length(currency) = 3),
  is_net boolean not null default true,
  note text not null default '' check (length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists monthly_adjustments_employee_period_idx
  on public.monthly_adjustments(employee_id, period_month desc);

alter table public.shifts
  add column if not exists worker_rate_id uuid references public.worker_rates(id) on delete set null,
  add column if not exists pricing_label text,
  add column if not exists is_net boolean not null default true;

alter table public.worker_rates enable row level security;
alter table public.monthly_adjustments enable row level security;

create policy worker_rates_read on public.worker_rates
  for select to authenticated using (
    company_id = public.current_company_id()
    and (employee_id = auth.uid() or public.is_admin() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'accountant'
    ))
  );
create policy worker_rates_admin_write on public.worker_rates
  for all to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

create policy monthly_adjustments_read on public.monthly_adjustments
  for select to authenticated using (
    company_id = public.current_company_id()
    and (employee_id = auth.uid() or public.is_admin() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'accountant'
    ))
  );
create policy monthly_adjustments_admin_write on public.monthly_adjustments
  for all to authenticated
  using (public.is_admin() and company_id = public.current_company_id())
  with check (public.is_admin() and company_id = public.current_company_id());

grant select on public.worker_rates, public.monthly_adjustments to authenticated;
grant insert, update, delete on public.worker_rates, public.monthly_adjustments to authenticated;

drop trigger if exists trg_worker_rates_updated_at on public.worker_rates;
create trigger trg_worker_rates_updated_at before update on public.worker_rates
  for each row execute function public.set_updated_at();

-- Validate and snapshot a selected rate. Workers may only use their own active
-- rate valid for the shift's object; admins may still correct historical rows.
create or replace function public.set_shift_pricing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  profile_type public.pricing_type;
  profile_rate numeric;
  profile_unit text;
  selected_rate public.worker_rates%rowtype;
  effective_seconds integer;
  trusted_actor boolean;
begin
  select p.pricing_type,
         case when p.pricing_type = 'hourly' then coalesce(p.hourly_rate, p.self_hourly_rate) else p.hourly_rate end,
         p.pricing_unit
    into profile_type, profile_rate, profile_unit
    from public.profiles p where p.id = new.user_id;
  if profile_type is null then raise exception 'Shift owner has no pricing profile'; end if;
  trusted_actor := public.is_admin() or coalesce(auth.role(), '') = 'service_role';

  if new.worker_rate_id is not null then
    select * into selected_rate from public.worker_rates r
     where r.id = new.worker_rate_id and r.employee_id = new.user_id
       and r.company_id = new.company_id and r.is_active
       and (r.site_id is null or r.site_id = new.site_id);
    if selected_rate.id is null then raise exception 'Selected pay rate is not available for this worker and object'; end if;
    new.pricing_type := selected_rate.pricing_type;
    new.pricing_rate := selected_rate.rate;
    new.unit := selected_rate.unit;
    new.pricing_label := selected_rate.label;
    new.is_net := selected_rate.is_net;
  elsif tg_op = 'INSERT' then
    if trusted_actor then
      new.pricing_type := coalesce(new.pricing_type, profile_type);
      new.pricing_rate := coalesce(new.pricing_rate, profile_rate);
      new.unit := coalesce(nullif(trim(new.unit), ''), profile_unit);
    else
      new.pricing_type := profile_type; new.pricing_rate := profile_rate; new.unit := profile_unit;
    end if;
    new.pricing_label := coalesce(new.pricing_label, case new.pricing_type when 'hourly' then 'Tunnitöö' when 'area' then 'Pindala' else 'Kogusetöö' end);
  elsif not trusted_actor then
    new.pricing_type := old.pricing_type; new.pricing_rate := old.pricing_rate;
    new.unit := old.unit; new.worker_rate_id := old.worker_rate_id;
    new.pricing_label := old.pricing_label; new.is_net := old.is_net;
  end if;

  if new.pricing_type = 'hourly' then new.quantity := null; new.unit := null;
  elsif new.pricing_type = 'area' then new.unit := 'm²';
  else new.unit := nullif(trim(new.unit), ''); end if;
  if new.pricing_rate is not null and new.pricing_rate < 0 then raise exception 'Pricing rate cannot be negative'; end if;
  if new.quantity is not null and new.quantity < 0 then raise exception 'Completed quantity cannot be negative'; end if;
  if new.pricing_type = 'quantity' and new.unit is null then raise exception 'Quantity based work requires a unit'; end if;
  if new.status = 'closed' then
    if new.pricing_type <> 'hourly' and new.pricing_rate is null then raise exception 'Completed work requires a pricing rate'; end if;
    if new.pricing_type <> 'hourly' and new.quantity is null then raise exception 'Completed area or quantity work requires a completed quantity'; end if;
    effective_seconds := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer - new.break_seconds);
    new.calculated_total := public.calculate_work_total(new.pricing_type, new.pricing_rate, effective_seconds, new.quantity);
  else new.calculated_total := null; end if;
  return new;
end $$;

-- Seed one default rate for each existing worker with a configured employer rate.
insert into public.worker_rates (company_id, employee_id, label, pricing_type, unit, rate, currency, is_net)
select p.company_id, p.id,
  case p.pricing_type when 'hourly' then 'Tunnitöö' when 'area' then 'Pindala' else coalesce(p.pricing_unit, 'Kogus') end,
  p.pricing_type,
  case when p.pricing_type = 'hourly' then null when p.pricing_type = 'area' then 'm²' else p.pricing_unit end,
  p.hourly_rate, p.currency, true
from public.profiles p
where p.role = 'worker' and p.hourly_rate is not null
  and not exists (select 1 from public.worker_rates r where r.employee_id = p.id);

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
  case when si.id is null or si.lat is null then null
       else public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) > si.radius_m end as out_of_zone,
  p.first_name, p.last_name, si.name as site_name,
  s.pricing_type, s.pricing_rate, s.quantity, s.unit, s.calculated_total,
  s.worker_rate_id, s.pricing_label, s.is_net
from public.shifts s
join public.profiles p on p.id = s.user_id
left join public.sites si on si.id = s.site_id;
