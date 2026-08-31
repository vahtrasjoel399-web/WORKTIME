# Tööaeg — GPS time tracking for construction crews

Production-oriented monorepo for a **worker mobile app** (Expo / React Native) and an
**employer web panel** (Next.js), backed entirely by **Supabase** (Postgres + Auth + RLS + Storage).

The product records *point-in-time* GPS at shift start and shift end only — **no background
tracking** — computes worked hours (breaks subtracted), estimates gross earnings, and gives the
employer live status, per-worker calendars, a live map, and payroll-ready CSV/XLSX exports.

Pay runs **weekly**: every default period is the running ISO week (Mon–Sun), the workers list and
report show what each worker earned in it, and any longer range is also broken down week by week
(D-015).

```
apps/
  mobile/        Expo + expo-router + TypeScript worker app (Android + iOS)
  admin/         Next.js App Router + Tailwind employer panel (Vercel)
supabase/
  migrations/    SQL: schema, RLS, functions/triggers, seed
  functions/     Edge Functions (stale-shift sweeper, GDPR export/delete)
DECISIONS.md     Running log of technical decisions
.env.example     Every environment variable used across the repo
```

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Supabase setup](#supabase-setup)
3. [Mobile app (Expo)](#mobile-app-expo)
4. [Admin panel (Next.js)](#admin-panel-nextjs)
5. [Environment variables](#environment-variables)
6. [Building for the stores (EAS)](#building-for-the-stores-eas)
7. [Legal & GDPR — read before deploying](#legal--gdpr)
8. [Project layout](#project-layout)

---

## Prerequisites

- **Node.js 20 LTS** and **npm 10+** — <https://nodejs.org>
- **Supabase CLI** — `npm i -g supabase` (or `scoop install supabase`)
- **Expo / EAS CLI** — `npm i -g eas-cli`
- A **Supabase project** (free tier is fine to start) — <https://supabase.com>
- For store builds: an **Expo account**, a **Google Play Console** account, an **Apple Developer** account.

> This repo is a **workspace**. From the root, `npm install` installs both apps (npm workspaces).

---

## Supabase setup

1. Create a project at <https://supabase.com/dashboard>. Note the **Project URL**, **anon key**,
   and **service_role key** (Project Settings → API).
2. Link the CLI and push migrations:

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push          # applies everything in supabase/migrations in order
   ```

   Or run locally first: `supabase start` then `supabase db reset` (this also loads the seed).

3. **Auth providers.** In Dashboard → Authentication → Providers enable:
   - **Email** (email + password) — used for invited workers and admins.
   - **Phone** (SMS OTP) — requires an SMS provider (Twilio/MessageBird). Configure under
     Authentication → Providers → Phone. Phone login is optional; email works out of the box.
4. **Disable public sign-ups.** Authentication → Settings → *Allow new users to sign up* → **off**.
   Accounts are created only by an admin (see below), never self-registration.
5. Deploy Edge Functions:

   ```bash
   supabase functions deploy close-stale-shifts
   supabase functions deploy gdpr-worker
   ```

   Then schedule the sweeper (Dashboard → Database → Cron, or `pg_cron`):

   ```sql
   select cron.schedule('close-stale-shifts', '*/15 * * * *',
     $$ select net.http_post(
          url := 'https://<ref>.functions.supabase.co/close-stale-shifts',
          headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
        ) $$);
   ```

### Creating the first company + admin

Public sign-up is disabled, so bootstrap via the SQL editor / service role. See
[`supabase/migrations/0004_seed.sql`](supabase/migrations/0004_seed.sql) for a worked example that
creates one company, two sites, and five workers. To make a real admin:

```sql
-- 1. Create the auth user in Dashboard → Authentication → Add user (email + password).
-- 2. Copy their UUID, then:
insert into public.companies (name, reg_code) values ('Acme Ehitus OÜ', '12345678')
  returning id;   -- copy company_id
insert into public.profiles (id, company_id, first_name, last_name, role, is_active, locale)
  values ('<auth-uid>', '<company_id>', 'Anna', 'Admin', 'admin', true, 'et');
```

---

## Mobile app (Expo)

```bash
cd apps/mobile
cp ../../.env.example .env          # fill EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
npm install
npx expo start                      # press a for Android, i for iOS, or scan QR in Expo Go
```

- GPS is captured **only** at start/stop. The app never tracks in the background.
- Offline: shifts are written to a local SQLite queue and synced when the network returns.
- Languages: **ET / RU / EN / FI**, default from device locale, switchable in Settings.

## Admin panel (Next.js)

```bash
cd apps/admin
cp ../../.env.example .env.local    # fill NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY (+ service role for exports)
npm install
npm run dev                         # http://localhost:3000
```

Deploy to Vercel: import the repo, set root directory to `apps/admin`, add the env vars, deploy.

---

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | mobile | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | anon key (safe in client, RLS-protected) |
| `NEXT_PUBLIC_SUPABASE_URL` | admin | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | admin | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | admin (server only) | server-side exports / GDPR delete — **never** shipped to the browser or the mobile app |
| `MAPTILER_KEY` *(optional)* | admin | nicer map tiles; falls back to a free OSM raster style |

> **Never** put the service_role key in `apps/mobile` or any `NEXT_PUBLIC_*` variable.

---

## Building for the stores (EAS)

```bash
cd apps/mobile
eas login
eas build:configure
eas build -p android --profile production   # → AAB for Google Play
eas build -p ios     --profile production   # → IPA for App Store
eas submit -p android
eas submit -p ios
```

Store listing copy (ET / EN / RU) lives in [`apps/mobile/store/`](apps/mobile/store/). Icons and
splash are in [`apps/mobile/assets/`](apps/mobile/assets/). Full checklist in
[`apps/mobile/store/PUBLISHING.md`](apps/mobile/store/PUBLISHING.md).

---

## Legal & GDPR

**The employer must notify workers in writing about GPS fixation before rolling this out.**
Location is a special-care data point under GDPR and Estonian/EU labour practice. This product is
built to make that defensible:

- GPS is captured **only** at the two moments of shift start and shift end — never continuously,
  never in the background.
- On first launch the worker sees a **location notice** explaining exactly what is recorded and why;
  the acknowledgement (with timestamp and notice version) is stored in `public.consents`. This is
  evidence that the notice was shown, not a substitute for the employer documenting a lawful basis.
- GPS points are retained **24 months**, then auto-deleted (`purge_old_gps()` scheduled function).
- The admin panel provides **per-worker data export** and **full deletion** (GDPR right of access
  and right to erasure).

You are still responsible for your own DPA, privacy notice, and works-council/employee
consultation obligations. This README is not legal advice.

---

## Project layout

```
apps/mobile/app/            expo-router screens (auth group, app group)
apps/mobile/src/lib/        supabase client, offline sqlite queue, sync, location
apps/mobile/src/theme/      design tokens + ThemeProvider (light/dark/system)
apps/mobile/src/i18n/       et/ru/en/fi message catalogs
apps/mobile/src/components/ Timer arc, ShiftButton, etc.
apps/admin/app/             App Router pages (workers, worker card, map, reports, sites)
apps/admin/lib/             supabase server/browser clients, exports
supabase/migrations/        0001 schema · 0002 rls · 0003 functions · 0004 seed
supabase/functions/         close-stale-shifts, gdpr-worker
```

See [`DECISIONS.md`](DECISIONS.md) for why things are the way they are.
#   W O R K T I M E 
 
 
