# Technical decisions

Running log. Newest first. Each entry: **what** was decided and **why**, so future changes don't
re-litigate settled ground.

## D-016 — The database attributes a punch to a site; the panel shows the address it read
`site_id` used to be whatever the client sent, and the web app sent nothing — so the employer's
list showed "—" and `out_of_zone` was always null. A `before insert` trigger now resolves it from
the GPS fix taken at shift start: nearest company site whose own radius contains the point, else
the worker's `default_site_id`. The rule lives in SQL so both clients get it and old rows could be
backfilled; `lib/geo.ts` mirrors it in TypeScript only for displaying rows written before the
trigger existed. The workers list shows the resolved site with the reverse-geocoded street address
underneath — when no radius matches, the address *is* the answer, plus how far off the nearest
site it is. Sites therefore need coordinates, so the site form geocodes its own address field.

## D-017 — Admin hour corrections stay inside the shift, and stay logged
An employer can add or take away time (±15 min / ±30 min / ±1 h, or exact timestamps) and can
enter a whole shift by hand for a day that was never clocked. Both go through `shifts` with
`source = 'manual'` and an append-only `shift_edits` row — never a free-floating "adjustment"
number. Hours therefore always remain `ended_at - started_at - break_seconds` (D-014), one
arithmetic for GPS and corrected shifts alike, and every correction can be shown to the worker
with who made it and what the value was before.

## D-015 — The pay period is an ISO week (Mon–Sun), not a calendar month
Wages are paid every week, so every default period in the panel is the running ISO week: the
workers list, the report page, the worker screen and the export filename. `lib/week.ts` computes
week bounds in **UTC**, matching `v_shift_report.work_date`, so a shift never lands in two
different weeks depending on who asks. Longer ranges stay available — they then also render a
per-week breakdown, because that is the table that actually gets paid out. Nothing is scheduled or
cached: the pages are `force-dynamic`, so they roll over to the next week by themselves each Monday.

## D-014 — `worked_seconds` as a generated column
Computed as `extract(epoch from ended_at - started_at) - break_seconds`, `stored`, only meaningful
when `ended_at is not null`. Keeping it generated means clients and reports never disagree on the
arithmetic, and manual admin edits to timestamps recompute automatically.

## D-013 — Earnings computed client-side, never stored
Rate can change and is legally "indicative, pre-tax". We never persist a money amount on a shift;
we store hours and resolve `hourly_rate` (admin) → `self_hourly_rate` (worker) at display time. This
avoids stale/incorrect payroll numbers and keeps the "company rate vs personal estimate" label
honest. Overtime/night/holiday multipliers are explicitly **out of scope** — surfaced in a hint.

## D-012 — Consent stored in its own `consents` table, not a profile boolean
We need the *timestamp* and *version* of the consent text for GDPR defensibility, and a worker may
re-consent after a policy change. A boolean on `profiles` can't express that.

## D-011 — Stale-shift handling: flag, don't auto-close silently
A shift open >16h gets `is_stale = true` and notifies the admin, but is **not** force-closed with a
guessed end time. Guessing payroll hours is worse than flagging for human correction. Admin closes
it via the manual-edit flow, which writes to `shift_edits`.

## D-010 — Manual edits are append-only history in `shift_edits`
Every admin change writes `(field, old_value, new_value, edited_by, created_at)`. We never mutate a
shift without a paper trail; payroll disputes need "who changed what, when".

## D-009 — Out-of-zone is a computed flag, never a block
The app always records the punch. Whether it's inside a site radius is computed (haversine vs
`sites.lat/lng/radius_m`) and shown as a report flag. Blocking a worker from clocking in because GPS
drifted 40 m is unacceptable on a real site.

## D-008 — Offline queue in local SQLite, optimistic UI
`expo-sqlite` holds a `pending_ops` table. The home screen reads local state first so the timer is
instant and correct with no network. A sync worker flushes to Supabase on reconnect
(`NetInfo` + app-foreground). The worker "never loses a punch" — the punch exists locally the
instant it's made.

## D-007 — No background location, point fixation only
Per the spec and to keep store review + GDPR simple: `expo-location` is called once at start and
once at stop with `Accuracy.Balanced`. No `TaskManager`, no background permission. This sidesteps
Apple's background-location review scrutiny and Android's `ACCESS_BACKGROUND_LOCATION` prominent
disclosure requirements entirely.

## D-006 — Reverse geocoding at capture time, address stored on the shift
We resolve the address once when the punch happens (Expo's `reverseGeocodeAsync`, falling back to
Nominatim if unavailable) and store the string. Cheaper than re-resolving in every report, and it
freezes the address as it was at punch time.

## D-005 — RLS is the only authorization layer; anon key everywhere in clients
No custom server. Worker sees/writes only their own `shifts`; admin sees everything within their
`company_id`. `company_id` and `role` are read from the caller's `profiles` row via a
`SECURITY DEFINER` helper (`current_company_id()`, `is_admin()`) to avoid recursive RLS. The
service_role key exists only in the admin's **server** runtime for exports/erasure.

## D-004 — Design tokens as (light, dark) pairs, resolved at runtime
Never hardcode a hex in a component. `theme/tokens.ts` defines paired tokens; `ThemeProvider`
resolves light/dark/system and persists the choice. Light-theme accents are the darker variants for
≥4.5:1 contrast on white, per the spec table.

## D-003 — Money & time typography: JetBrains Mono, tabular figures
Timer and all report hours use tabular-figure mono so digits don't reflow as they change. Count-up
earnings interpolate a number but render through the same tabular face — no horizontal jitter.

## D-002 — Monorepo with npm workspaces
`apps/mobile` and `apps/admin` share nothing at runtime but share types (Supabase-generated) and one
`.env` contract. npm workspaces keeps installs and CI simple without adding Turborepo/pnpm.

## D-001 — Stack fixed per spec
Expo + expo-router + TS (mobile), Next.js App Router + Tailwind (admin), Supabase (Postgres/Auth/
RLS/Storage), reanimated v3 + moti + expo-haptics (motion), MapLibre GL (maps). Not changing without
a recorded reason here.
