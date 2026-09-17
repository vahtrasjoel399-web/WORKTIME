-- ============================================================================
-- 0014_private_employee_storage.sql — private employee files
-- ----------------------------------------------------------------------------
-- One private bucket stores profile photos, CVs and future employee documents.
-- Object paths are tenant-scoped and predictable:
--   company/{companyId}/employees/{employeeId}/photos/{safeFilename}
--   company/{companyId}/employees/{employeeId}/documents/{safeFilename}
-- File access is authorized by Storage RLS, never by a public bucket URL.
-- ============================================================================

-- 10 MiB is sufficient for profile images and normal CV/supporting documents.
-- SVG and executable/archive formats are intentionally excluded.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'employee-files',
  'employee-files',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ── path validation shared by metadata guards and Storage policies ──
create or replace function public.is_valid_employee_file_path(
  object_name text,
  expected_company uuid default null,
  expected_employee uuid default null,
  expected_area text default null
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    object_name is not null
    and array_length(string_to_array(object_name, '/'), 1) = 6
    and split_part(object_name, '/', 1) = 'company'
    and split_part(object_name, '/', 2)
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(object_name, '/', 3) = 'employees'
    and split_part(object_name, '/', 4)
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(object_name, '/', 5) in ('photos', 'documents')
    and split_part(object_name, '/', 6) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
    and position('..' in split_part(object_name, '/', 6)) = 0
    and (
      (split_part(object_name, '/', 5) = 'photos'
       and split_part(object_name, '/', 6) ~* '\.(jpe?g|png|webp)$')
      or
      (split_part(object_name, '/', 5) = 'documents'
       and split_part(object_name, '/', 6) ~* '\.(pdf|docx?|jpe?g|png|webp)$')
    )
    and (expected_company is null
         or split_part(object_name, '/', 2) = expected_company::text)
    and (expected_employee is null
         or split_part(object_name, '/', 4) = expected_employee::text)
    and (expected_area is null
         or split_part(object_name, '/', 5) = expected_area)
$$;

revoke all on function public.is_valid_employee_file_path(text, uuid, uuid, text)
  from public, anon;
grant execute on function public.is_valid_employee_file_path(text, uuid, uuid, text)
  to authenticated, service_role;

-- ── metadata path integrity ──
alter table public.employee_documents
  drop constraint if exists employee_documents_filename_length_check;
alter table public.employee_documents
  add constraint employee_documents_filename_length_check
  check (char_length(filename) <= 255);

-- Document metadata must point to the same tenant and employee encoded in its
-- private Storage object name. The original display filename may be Unicode;
-- storage_path always uses a generated/sanitized ASCII filename.
create or replace function public.guard_employee_document_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_company uuid;
begin
  select company_id into employee_company
    from public.profiles
   where id = new.employee_id;

  if employee_company is null then
    raise exception 'Employee has no profile';
  end if;
  if new.company_id is distinct from employee_company then
    raise exception 'Document company must match employee company';
  end if;
  if new.uploaded_by is not null and not exists (
    select 1 from public.profiles
     where id = new.uploaded_by and company_id = employee_company
  ) then
    raise exception 'Document uploader belongs to another company';
  end if;
  if not public.is_valid_employee_file_path(
    new.storage_path,
    new.company_id,
    new.employee_id,
    'documents'
  ) then
    raise exception 'Invalid employee document storage path';
  end if;
  return new;
end
$$;

-- Profile photos use the same private hierarchy but a photos-only extension.
create or replace function public.guard_profile_tenant_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'A profile company cannot be changed';
  end if;

  if new.default_site_id is not null and not exists (
    select 1
      from public.sites s
     where s.id = new.default_site_id
       and s.company_id = new.company_id
  ) then
    raise exception 'Profile site belongs to another company';
  end if;

  if new.profile_photo_path is not null
     and not public.is_valid_employee_file_path(
       new.profile_photo_path,
       new.company_id,
       new.id,
       'photos'
     ) then
    raise exception 'Invalid employee profile photo storage path';
  end if;

  return new;
end
$$;

revoke all on function public.guard_employee_document_tenant()
  from public, anon, authenticated;
revoke all on function public.guard_profile_tenant_fields()
  from public, anon, authenticated;

-- ── Storage RLS ──
-- Policy expressions repeat path validation deliberately: malformed or legacy
-- objects in this bucket remain inaccessible to client roles.
drop policy if exists employee_files_admin_select on storage.objects;
create policy employee_files_admin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-files'
    and public.is_admin()
    and public.is_valid_employee_file_path(name)
    and split_part(name, '/', 2) = public.current_company_id()::text
    and exists (
      select 1
        from public.profiles p
       where p.id::text = split_part(name, '/', 4)
         and p.company_id = public.current_company_id()
    )
  );

drop policy if exists employee_files_admin_insert on storage.objects;
create policy employee_files_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'employee-files'
    and public.is_admin()
    and public.is_valid_employee_file_path(name)
    and split_part(name, '/', 2) = public.current_company_id()::text
    and exists (
      select 1
        from public.profiles p
       where p.id::text = split_part(name, '/', 4)
         and p.company_id = public.current_company_id()
    )
  );

drop policy if exists employee_files_admin_update on storage.objects;
create policy employee_files_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'employee-files'
    and public.is_admin()
    and public.is_valid_employee_file_path(name)
    and split_part(name, '/', 2) = public.current_company_id()::text
  )
  with check (
    bucket_id = 'employee-files'
    and public.is_admin()
    and public.is_valid_employee_file_path(name)
    and split_part(name, '/', 2) = public.current_company_id()::text
    and exists (
      select 1
        from public.profiles p
       where p.id::text = split_part(name, '/', 4)
         and p.company_id = public.current_company_id()
    )
  );

drop policy if exists employee_files_admin_delete on storage.objects;
create policy employee_files_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'employee-files'
    and public.is_admin()
    and public.is_valid_employee_file_path(name)
    and split_part(name, '/', 2) = public.current_company_id()::text
  );

-- Workers may display only their own profile photo. There is deliberately no
-- worker policy for documents, uploads, replacements or deletion.
drop policy if exists employee_files_worker_photo_select on storage.objects;
create policy employee_files_worker_photo_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-files'
    and public.is_valid_employee_file_path(
      name,
      public.current_company_id(),
      auth.uid(),
      'photos'
    )
  );
