-- The last of the parts that only pretended: account deletion, identity
-- verification, saved searches, and the settings switches.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. Preferences — the switches in ตั้งค่า
-- ============================================================================
-- Eleven toggles across การแจ้งเตือน / ความปลอดภัย / ความเป็นส่วนตัว, plus
-- ภาษาและภูมิภาค, all of which flipped a CSS class and were forgotten on
-- reload. One jsonb column rather than fourteen boolean ones: they are read and
-- written as a set, nothing joins on them, and adding a switch later should not
-- need a migration.
alter table profiles add column if not exists prefs jsonb not null default '{}'::jsonb;


-- ============================================================================
-- 2. การยืนยันตัวตน
-- ============================================================================
-- The modal collected documents, said "รออนุมัติ", and dropped them. A request
-- is a row now, with the files in Storage, so it survives a reload and an
-- administrator has something to approve. profiles.is_verified stays the single
-- source of truth for the badge — this table is the paperwork behind it.
create table if not exists verification_requests (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        text not null check (kind in ('person','company')),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  note        text,
  files       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists verification_requests_profile_idx
  on verification_requests (profile_id, created_at desc);

alter table verification_requests enable row level security;

-- you see and file your own; only an administrator (service role, which
-- bypasses RLS) decides one, so there is deliberately no update policy here
drop policy if exists "own verification requests" on verification_requests;
create policy "own verification requests" on verification_requests for select
  using (profile_id = auth.uid());

drop policy if exists "file your own verification" on verification_requests;
create policy "file your own verification" on verification_requests for insert
  with check (profile_id = auth.uid());

-- withdrawing a request you have not had answered yet is yours to do
drop policy if exists "withdraw your own pending verification" on verification_requests;
create policy "withdraw your own pending verification" on verification_requests for delete
  using (profile_id = auth.uid() and status = 'pending');


-- ============================================================================
-- 3. บันทึกการค้นหา
-- ============================================================================
-- "🔔 บันทึกการค้นหา + แจ้งเตือนงานใหม่" showed a confirmation bar and kept
-- nothing, so there was neither a saved search nor an alert.
create table if not exists saved_searches (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  label       text not null,
  keyword     text,
  province    text,
  kind        text,
  notify      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists saved_searches_profile_idx
  on saved_searches (profile_id, created_at desc);

alter table saved_searches enable row level security;

drop policy if exists "own saved searches" on saved_searches;
create policy "own saved searches" on saved_searches for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());


-- ============================================================================
-- 4. ลบบัญชีถาวร
-- ============================================================================
-- The button asked for confirmation twice and then navigated to the login page.
-- Nothing was deleted, and the person had every reason to believe otherwise —
-- which is the worst way for this particular control to be wrong.
--
-- Deleting the auth user is what actually ends an account, and that is not
-- something the anon key can do. SECURITY DEFINER lets this one function do it,
-- and only ever to the caller's own row: the id comes from auth.uid(), never
-- from an argument, so there is no account but your own to point it at.
--
-- profiles.id references auth.users(id) on delete cascade, and everything else
-- hangs off profiles the same way, so removing the user removes the posts,
-- quotes, messages, files and history with it.
create or replace function kx_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function kx_delete_my_account() from public, anon;
grant execute on function kx_delete_my_account() to authenticated;
