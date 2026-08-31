-- ============================================================================
-- 0011_fix_consent_trigger.sql — repair location-notice acknowledgement insert
-- ----------------------------------------------------------------------------
-- The consents table is intentionally scoped through user_id -> profiles.
-- Migration 0009 incorrectly installed a trigger that assigned NEW.company_id,
-- but consents has no company_id column. Every insert therefore failed.
-- The foreign key and RLS policies already validate ownership, so the trigger
-- is unnecessary and must be removed.
-- ============================================================================

drop trigger if exists trg_set_consent_company on public.consents;
drop function if exists public.set_consent_company();
