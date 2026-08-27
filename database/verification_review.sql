-- ============================================================================
-- ตรวจสอบและอนุมัติการยืนยันตัวตน — the approval half
-- ============================================================================
-- settings_and_account.sql built the half where a person files a request:
-- verification_requests holds the documents, and the policies there let you
-- read, file and withdraw your own. It left the deciding to "an administrator
-- (service role, which bypasses RLS)" — but the app only ever holds the anon
-- key, so there was no administrator and nothing could set profiles.is_verified.
-- Every request filed has been sitting there unanswerable, while the profile
-- card told its owner that verifying would earn a buyer's trust.
--
-- This file adds the missing half:
--   1. an administrator that exists inside the database, not just in principle
--   2. a private bucket for the documents — see the note in section 2, this is
--      the part to read even if you skip the rest
--   3. one function to decide a request, one to undo a decision
--
-- Run once in the Supabase SQL editor, same as the others.


-- ============================================================================
-- 1. Who is an administrator
-- ============================================================================
alter table profiles add column if not exists is_admin boolean not null default false;

-- Policies below need to ask "is the caller an admin", and asking that means
-- reading profiles — which is itself behind RLS. security definer reads past
-- that, so a policy on profiles can call this without recursing into itself.
create or replace function kx_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

revoke all on function kx_is_admin() from public;
grant execute on function kx_is_admin() to authenticated;

-- Make yourself the first administrator. Edit the address, then run.
-- Nothing else in this file grants admin, on purpose: it is a deliberate act,
-- done by hand, on a row you can see.
update profiles p
   set is_admin = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('xeeb0262@gmail.com');


-- ============================================================================
-- 2. The documents belong in a private bucket
-- ============================================================================
-- submitVerify() uploaded to `attachments`, and storage_policies.sql grants
--     create policy "anyone can view attachments" ... to public
-- so a photograph of someone's national ID card was readable by anyone with
-- the URL, signed out, forever. That is the one thing this feature must not do.
-- These documents go to their own bucket with no public read at all; the only
-- ways in are "it is your own folder" and "you are an administrator", and even
-- then the app has to mint a short-lived signed URL to show the file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verify-docs', 'verify-docs', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- kxUploadFile() writes to `<user id>/<file>`, so the first path segment is
-- the owner — the same shape the other buckets use.
drop policy if exists "upload your own verification documents" on storage.objects;
create policy "upload your own verification documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'verify-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "read your own verification documents" on storage.objects;
create policy "read your own verification documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'verify-docs'
  and ((storage.foldername(name))[1] = auth.uid()::text or kx_is_admin())
);

-- withdrawing a request should be able to take its files with it
drop policy if exists "delete your own verification documents" on storage.objects;
create policy "delete your own verification documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'verify-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- ============================================================================
-- 3. An administrator can see the queue
-- ============================================================================
-- The existing "own verification requests" policy stays exactly as it is; this
-- is a second select policy, and Postgres ORs them. So a normal account still
-- sees only its own row, and an admin sees the queue.
drop policy if exists "admins read all verification requests" on verification_requests;
create policy "admins read all verification requests"
on verification_requests for select
using (kx_is_admin());


-- ============================================================================
-- 4. Deciding a request
-- ============================================================================
-- security definer because it writes two rows the caller does not own — the
-- request, and the applicant's profile. The admin check is the first statement
-- for that reason: past this line the function is writing as the table owner.
create or replace function kx_decide_verification(
  req_id     uuid,
  approve    boolean,
  admin_note text default null
)
returns verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r verification_requests;
  who text;
begin
  if not kx_is_admin() then
    raise exception 'ต้องเป็นผู้ดูแลระบบจึงจะตัดสินคำขอได้' using errcode = '42501';
  end if;

  -- `and status = 'pending'` is what makes this safe to press twice: the second
  -- press matches no row and is told so, rather than silently re-deciding.
  update verification_requests
     set status     = case when approve then 'approved' else 'rejected' end,
         note       = coalesce(nullif(btrim(admin_note), ''), note),
         decided_at = now()
   where id = req_id
     and status = 'pending'
  returning * into r;

  if r.id is null then
    raise exception 'ไม่พบคำขอนี้ หรือถูกตัดสินไปแล้ว' using errcode = 'P0002';
  end if;

  -- A rejection leaves is_verified alone rather than setting it false: the
  -- applicant may already be verified from an earlier round, and one bad
  -- document should not quietly strip a badge they still hold. Taking one away
  -- is kx_revoke_verification below, which says what it does.
  if approve then
    update profiles set is_verified = true where id = r.profile_id;
  end if;

  select coalesce(nullif(btrim(company_name), ''), 'บัญชีของคุณ')
    into who from profiles where id = r.profile_id;

  perform kx_notify(
    r.profile_id,
    case when approve then 'verify_approved' else 'verify_rejected' end,
    case when approve
      then 'ยืนยันตัวตนของ ' || who || ' ผ่านการตรวจสอบแล้ว'
      else 'การยืนยันตัวตนไม่ผ่าน' ||
           coalesce(': ' || nullif(btrim(admin_note), ''), ' กรุณาส่งเอกสารใหม่อีกครั้ง')
    end,
    null
  );

  return r;
end;
$$;

revoke all on function kx_decide_verification(uuid, boolean, text) from public;
grant execute on function kx_decide_verification(uuid, boolean, text) to authenticated;


-- ============================================================================
-- 5. Undoing one
-- ============================================================================
-- An approval given by mistake has to be retractable, or the only safe way to
-- press อนุมัติ is never to press it.
create or replace function kx_revoke_verification(target uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not kx_is_admin() then
    raise exception 'ต้องเป็นผู้ดูแลระบบจึงจะถอนการยืนยันได้' using errcode = '42501';
  end if;

  update profiles set is_verified = false where id = target;

  perform kx_notify(
    target,
    'verify_rejected',
    'การยืนยันตัวตนถูกถอน' || coalesce(': ' || nullif(btrim(reason), ''), ''),
    null
  );
end;
$$;

revoke all on function kx_revoke_verification(uuid, text) from public;
grant execute on function kx_revoke_verification(uuid, text) to authenticated;


-- ============================================================================
-- Check it took
-- ============================================================================
-- select id, company_name, is_admin, is_verified from profiles where is_admin;
-- select id, public from storage.buckets where id = 'verify-docs';   -- public must be false
