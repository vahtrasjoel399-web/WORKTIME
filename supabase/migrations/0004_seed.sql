-- ============================================================================
-- 0004_seed.sql — demo data: 1 company, 2 sites, 1 admin + 5 workers
-- ----------------------------------------------------------------------------
-- Creates auth users directly (works for `supabase db reset` / local dev).
-- All demo accounts use password:  Passw0rd!
-- On a hosted project you'd instead create users via the Dashboard/Admin API
-- and only insert the public.* rows. This block is idempotent-ish for reset.
-- ============================================================================

-- fixed UUIDs so re-runs are stable
-- admin:   00000000-0000-0000-0000-0000000000a1
-- workers: ...0001 .. ...0005
-- company: 11111111-1111-1111-1111-111111111111

insert into public.companies (id, name, reg_code, join_code)
values ('11111111-1111-1111-1111-111111111111', 'Põhjala Ehitus OÜ', '12345678', 'POHJALA')
on conflict (id) do nothing;

insert into public.sites (id, company_id, name, address, lat, lng, radius_m) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Ülemiste objekt', 'Valukoja 8, Tallinn', 59.4230, 24.7990, 150),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Mustamäe objekt', 'Ehitajate tee 5, Tallinn', 59.3950, 24.6620, 200)
on conflict (id) do nothing;

-- ── auth users ──
do $$
declare
  ids uuid[] := array[
    '000000a1-0000-0000-0000-000000000001'::uuid,  -- admin
    '00000001-0000-0000-0000-000000000001'::uuid,
    '00000001-0000-0000-0000-000000000002'::uuid,
    '00000001-0000-0000-0000-000000000003'::uuid,
    '00000001-0000-0000-0000-000000000004'::uuid,
    '00000001-0000-0000-0000-000000000005'::uuid
  ];
  emails text[] := array[
    'admin@pohjala.test',
    'mart@pohjala.test','jaan@pohjala.test','katrin@pohjala.test',
    'oleg@pohjala.test','sofia@pohjala.test'
  ];
  i int;
begin
  for i in 1 .. array_length(ids,1) loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            emails[i], crypt('Passw0rd!', gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{}')
    on conflict (id) do nothing;
  end loop;
end $$;

-- ── profiles ──
insert into public.profiles
  (id, company_id, first_name, last_name, phone, role, is_active, locale,
   hourly_rate, self_hourly_rate, currency, target_shift_hours, show_earnings, theme)
values
  ('000000a1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Anna','Admin','+37250000000','admin', true,'et', null, null,'EUR',8,true,'system'),
  ('00000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Mart','Kask','+37251111111','worker',true,'et', 14.50, null,'EUR',8,true,'system'),
  ('00000001-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Jaan','Tamm','+37252222222','worker',true,'et', 14.50, null,'EUR',8,true,'dark'),
  ('00000001-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Katrin','Saar','+37253333333','worker',true,'et', null, 16.00,'EUR',8,false,'light'),
  ('00000001-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Oleg','Petrov','+37254444444','worker',true,'ru', null, 15.00,'EUR',8,true,'system'),
  ('00000001-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Sofia','Ilves','+37255555555','worker',true,'fi', 14.50, null,'EUR',7.5,true,'system')
on conflict (id) do nothing;

-- consent records (all workers consented on their first login demo date)
insert into public.consents (user_id, kind, version, granted, created_at)
select id, 'geolocation', '1', true, now() - interval '20 days'
from public.profiles where role = 'worker'
on conflict do nothing;

-- ── a few historical shifts (closed) + one live open shift for the map demo ──
-- closed shifts across the current month for Mart & Jaan on Ülemiste
insert into public.shifts
  (id, company_id, user_id, site_id, started_at, start_lat, start_lng, start_accuracy_m, start_address,
   ended_at, end_lat, end_lng, end_accuracy_m, end_address, break_seconds, status, source)
values
  ('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
   '00000001-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001',
   date_trunc('day', now()) - interval '2 days' + interval '8 hours',
   59.4231,24.7991,12,'Valukoja 8, Tallinn',
   date_trunc('day', now()) - interval '2 days' + interval '16 hours 30 minutes',
   59.4232,24.7989,10,'Valukoja 8, Tallinn', 1800, 'closed','app'),
  ('33333333-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
   '00000001-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001',
   date_trunc('day', now()) - interval '1 day' + interval '7 hours 45 minutes',
   59.4229,24.7995,18,'Valukoja 8, Tallinn',
   date_trunc('day', now()) - interval '1 day' + interval '16 hours',
   59.4230,24.7990,14,'Valukoja 8, Tallinn', 2700, 'closed','app')
on conflict (id) do nothing;

-- one OPEN shift for Oleg (shows on the live map)
insert into public.shifts
  (id, company_id, user_id, site_id, started_at, start_lat, start_lng, start_accuracy_m, start_address,
   break_seconds, status, source)
values
  ('33333333-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111',
   '00000001-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000002',
   now() - interval '3 hours 12 minutes',
   59.3951,24.6621,9,'Ehitajate tee 5, Tallinn', 0, 'open','app')
on conflict (id) do nothing;
