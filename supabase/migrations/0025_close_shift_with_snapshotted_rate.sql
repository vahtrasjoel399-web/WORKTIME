-- Closing an existing shift must use its snapshotted worker rate. Requiring the
-- referenced rate to still be active can trap a worker in an open timer after
-- an admin changes rates or assignments during the shift.

create or replace function public.set_shift_pricing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  profile_type public.pricing_type;
  profile_rate numeric;
  profile_unit text;
  selected_rate public.worker_rates%rowtype;
  selected_client_rate public.site_client_rates%rowtype;
  effective_seconds integer;
  trusted_actor boolean;
  work_day date;
begin
  select p.pricing_type,
         case when p.pricing_type = 'hourly' then coalesce(p.hourly_rate, p.self_hourly_rate) else p.hourly_rate end,
         p.pricing_unit
    into profile_type, profile_rate, profile_unit
    from public.profiles p where p.id = new.user_id;
  if profile_type is null then raise exception 'Shift owner has no pricing profile'; end if;
  trusted_actor := public.is_admin() or coalesce(auth.role(), '') = 'service_role';

  if tg_op = 'INSERT' then
    if new.worker_rate_id is not null then
      select * into selected_rate from public.worker_rates r
       where r.id = new.worker_rate_id and r.employee_id = new.user_id
         and r.company_id = new.company_id and r.is_active
         and (r.site_id is null or r.site_id = new.site_id);
      if selected_rate.id is null then raise exception 'Selected pay rate is not available for this worker and object'; end if;
      new.pricing_type := selected_rate.pricing_type; new.pricing_rate := selected_rate.rate;
      new.unit := selected_rate.unit; new.pricing_label := selected_rate.label; new.is_net := selected_rate.is_net;
    elsif trusted_actor then
      new.pricing_type := coalesce(new.pricing_type, profile_type);
      new.pricing_rate := coalesce(new.pricing_rate, profile_rate);
      new.unit := coalesce(nullif(trim(new.unit), ''), profile_unit);
    else
      new.pricing_type := profile_type; new.pricing_rate := profile_rate; new.unit := profile_unit;
    end if;
    new.pricing_label := coalesce(new.pricing_label, case new.pricing_type when 'hourly' then 'Tunnitöö' when 'area' then 'Pindala' else 'Kogusetöö' end);
  elsif not trusted_actor then
    -- Workers can close their own shift but cannot replace either financial
    -- snapshot. The referenced rate may since have been disabled or reassigned.
    new.pricing_type := old.pricing_type; new.pricing_rate := old.pricing_rate;
    new.unit := old.unit; new.worker_rate_id := old.worker_rate_id;
    new.pricing_label := old.pricing_label; new.is_net := old.is_net;
    new.client_rate_id := old.client_rate_id; new.client_pricing_rate := old.client_pricing_rate;
    new.client_calculated_total := old.client_calculated_total;
  end if;

  if new.pricing_type = 'hourly' then new.quantity := null; new.unit := null;
  elsif new.pricing_type = 'area' then new.unit := 'm²';
  else new.unit := nullif(trim(new.unit), ''); end if;
  if new.pricing_rate is not null and new.pricing_rate < 0 then raise exception 'Pricing rate cannot be negative'; end if;
  if new.client_pricing_rate is not null and new.client_pricing_rate < 0 then raise exception 'Client pricing rate cannot be negative'; end if;
  if new.quantity is not null and new.quantity < 0 then raise exception 'Completed quantity cannot be negative'; end if;
  if new.pricing_type = 'quantity' and new.unit is null then raise exception 'Quantity based work requires a unit'; end if;

  work_day := (new.started_at at time zone 'Europe/Tallinn')::date;
  if trusted_actor and new.client_rate_id is not null then
    select * into selected_client_rate from public.site_client_rates r
     where r.id = new.client_rate_id and r.company_id = new.company_id and r.site_id = new.site_id;
    if selected_client_rate.id is null then raise exception 'Selected client rate is not available for this object'; end if;
    new.client_pricing_rate := selected_client_rate.rate;
  elsif new.client_pricing_rate is null and new.site_id is not null then
    select * into selected_client_rate from public.site_client_rates r
     where r.company_id = new.company_id and r.site_id = new.site_id and r.is_active
       and r.pricing_type = new.pricing_type
       and lower(trim(r.label)) = lower(trim(new.pricing_label))
       and coalesce(r.unit, '') = coalesce(new.unit, '')
       and r.effective_from <= work_day
       and (r.effective_to is null or r.effective_to >= work_day)
     order by r.effective_from desc, r.created_at desc limit 1;
    if selected_client_rate.id is not null then
      new.client_rate_id := selected_client_rate.id;
      new.client_pricing_rate := selected_client_rate.rate;
    end if;
  end if;

  if new.status = 'closed' then
    if new.pricing_type <> 'hourly' and new.pricing_rate is null then raise exception 'Completed work requires a pricing rate'; end if;
    if new.pricing_type <> 'hourly' and new.quantity is null then raise exception 'Completed area or quantity work requires a completed quantity'; end if;
    effective_seconds := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer - new.break_seconds);
    new.calculated_total := public.calculate_work_total(new.pricing_type, new.pricing_rate, effective_seconds, new.quantity);
    new.client_calculated_total := public.calculate_work_total(new.pricing_type, new.client_pricing_rate, effective_seconds, new.quantity);
  else
    new.calculated_total := null; new.client_calculated_total := null;
  end if;
  return new;
end $$;
