-- Allow a managed account to be erased even when it appears in the immutable
-- shift edit history. The edit record remains for audit purposes, while the
-- erased editor identifier is anonymized by the foreign key.
alter table public.shift_edits
  alter column edited_by drop not null;

alter table public.shift_edits
  drop constraint if exists shift_edits_edited_by_fkey;

alter table public.shift_edits
  add constraint shift_edits_edited_by_fkey
  foreign key (edited_by)
  references public.profiles(id)
  on delete set null;
