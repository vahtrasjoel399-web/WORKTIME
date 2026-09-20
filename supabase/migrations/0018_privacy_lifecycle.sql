-- ============================================================================
-- 0018_privacy_lifecycle.sql — GPS retention enforcement
-- ----------------------------------------------------------------------------
-- Precise coordinates, accuracy and reverse-geocoded addresses are removed
-- after 24 months. Shift time/payroll history and assigned site remain intact.
-- The existing scheduled close-stale-shifts function invokes this maintenance.
-- ============================================================================

create or replace function public.purge_old_gps()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged_count integer;
begin
  update public.shifts
     set start_lat = null,
         start_lng = null,
         start_accuracy_m = null,
         start_address = null,
         end_lat = null,
         end_lng = null,
         end_accuracy_m = null,
         end_address = null
   where started_at < now() - interval '24 months'
     and (
       start_lat is not null
       or start_lng is not null
       or start_accuracy_m is not null
       or start_address is not null
       or end_lat is not null
       or end_lng is not null
       or end_accuracy_m is not null
       or end_address is not null
     );

  get diagnostics purged_count = row_count;
  return purged_count;
end
$$;

revoke all on function public.purge_old_gps()
  from public, anon, authenticated;
grant execute on function public.purge_old_gps()
  to service_role;

