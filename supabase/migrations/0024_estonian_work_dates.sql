-- Report work dates follow the object's Estonian timezone instead of UTC.
-- This prevents late evening/night shifts from appearing on the wrong day.

create or replace view public.v_shift_report
with (security_invoker = true) as
select
  s.id, s.company_id, s.user_id, s.site_id,
  s.started_at, s.start_lat, s.start_lng, s.start_accuracy_m, s.start_address,
  s.ended_at, s.end_lat, s.end_lng, s.end_accuracy_m, s.end_address,
  s.break_seconds, s.worked_seconds, s.status, s.source, s.is_stale, s.note, s.created_at,
  round(coalesce(s.worked_seconds, 0) / 3600.0, 2) as worked_hours,
  (s.started_at at time zone coalesce(si.timezone, 'Europe/Tallinn'))::date as work_date,
  public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) as start_distance_m,
  case when si.id is null or si.lat is null then null
       else public.distance_m(s.start_lat, s.start_lng, si.lat, si.lng) > si.radius_m end as out_of_zone,
  p.first_name, p.last_name, si.name as site_name,
  s.pricing_type, s.pricing_rate, s.quantity, s.unit, s.calculated_total,
  s.worker_rate_id, s.pricing_label, s.is_net,
  case when public.is_admin() or coalesce(auth.role(), '') = 'service_role'
         or exists (select 1 from public.profiles viewer where viewer.id = auth.uid() and viewer.role = 'accountant')
       then s.client_rate_id else null end as client_rate_id,
  case when public.is_admin() or coalesce(auth.role(), '') = 'service_role'
         or exists (select 1 from public.profiles viewer where viewer.id = auth.uid() and viewer.role = 'accountant')
       then s.client_pricing_rate else null end as client_pricing_rate,
  case when public.is_admin() or coalesce(auth.role(), '') = 'service_role'
         or exists (select 1 from public.profiles viewer where viewer.id = auth.uid() and viewer.role = 'accountant')
       then s.client_calculated_total else null end as client_calculated_total
from public.shifts s
join public.profiles p on p.id = s.user_id
left join public.sites si on si.id = s.site_id;
