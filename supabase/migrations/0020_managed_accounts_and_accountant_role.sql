-- Managed company accounts and a read-only accountant role.
-- Workers can no longer attach themselves to a company with a join code.

alter type public.user_role add value if not exists 'accountant';

-- Keep the historical function for existing database dependencies, but make it
-- unreachable from browser sessions. New worker/accountant accounts are created
-- only by the trusted admin API with the service role.
revoke execute on function public.register_worker(text, text, text)
  from public, anon, authenticated;

-- Accountants deliberately receive no direct RLS access to company tables.
-- Server routes/pages verify role + company and return only the report/directory
-- projection they need. Their own profile remains readable through profiles_read.
