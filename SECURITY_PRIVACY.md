# Worktime security and privacy implementation

This document describes technical safeguards, not a certification of GDPR compliance or legal advice.

## Implemented

- Every operational row is tenant-scoped by `company_id` and protected by Supabase RLS.
- Workers can read only their own profile; admins can read profiles in their own company.
- Shift tenant ownership is derived server-side from the worker profile.
- Cross-company `site_id` references are rejected in the database.
- Workers cannot rewrite protected punch fields after a shift has been created.
- GPS is captured only at shift start and finish; there is no background tracking.
- GPS coordinates are purged after 24 months by `purge_old_gps()` when it is scheduled.
- Worker export and deletion verify the caller, target UUID and tenant before service-role access.
- Payroll export and live-location APIs require an admin session.
- Sensitive API responses use `Cache-Control: private, no-store`.
- CSV exports neutralize spreadsheet formula injection.
- Exports and worker deletion are written to an append-only audit log.
- Client-side notice acknowledgements are append-only and checked by notice version.
- Completed worker punches are immutable; only an admin can correct them.
- Privileged export and maintenance functions are executable only by `service_role`.
- The first-run location screen records acknowledgement of a versioned notice, not blanket consent.

## Deployment requirements

1. Apply all migrations, including `0009_privacy_security.sql` and `0010_security_followup.sql`.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` only in the server runtime.
3. Schedule `purge_old_gps()` and verify that the job runs successfully.
4. Require HTTPS in production.
5. Configure Supabase Auth rate limits, email verification and leaked-password protection.
6. Restrict production database/dashboard access and enable MFA for operator accounts.
7. Test backup restoration and document the backup deletion lifecycle.
8. Review Supabase, hosting, email, maps and error monitoring as subprocessors.

## Required before a public paid launch

- A lawyer-reviewed privacy notice, terms, DPA and subprocessor list.
- A documented lawful basis and necessity assessment for employee location processing.
- A DPIA assessment; perform a full DPIA if the planned use is likely to be high risk.
- Company-configurable retention instead of one global 24-month GPS period.
- Organization export/deletion and a recovery window before destructive deletion.
- More granular roles if managers or accountants will use the product.
- Automated database tests proving cross-tenant isolation and privilege boundaries.
- An incident-response process with customer notification contacts and deadlines.

## Verification scenarios

- A worker from company A cannot select or mutate any profile, shift, site or consent from company B.
- A worker cannot invoke `/api/export`, `/api/live` or `/api/gdpr` for another worker.
- An admin from company A cannot export or delete a worker from company B.
- Changing `company_id`, `user_id`, `site_id` or punch-start fields in a direct API request fails or is normalized safely.
- Exported CSV values beginning with `=`, `+`, `-` or `@` do not execute as spreadsheet formulas.
- A deletion request without the explicit `DELETE` confirmation is rejected.
