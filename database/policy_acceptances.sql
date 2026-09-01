-- ============================================================================
-- policy_acceptances — บันทึกว่าใครกดยอมรับเอกสารฉบับไหน เมื่อไหร่
-- ============================================================================
-- The signup form had a tick-box and nothing behind it: ticking it changed a
-- boolean in the browser for as long as the page was open and was then thrown
-- away. Nothing anywhere recorded that a person had agreed to anything, so the
-- one question this box exists to answer — "which version did this account
-- accept, and when?" — had no answer at all.
--
-- One row per (account, document, version). The unique index is what makes a
-- repeat signal harmless: accepting twice is not two facts.
--
-- Deliberately append-only. There is a policy for select and one for insert and
-- **none for update or delete**, so with RLS on, Postgres refuses both for
-- everyone holding the anon key — the account holder included. A consent record
-- that its own subject can quietly rewrite is not evidence of anything. Rows do
-- still go when the profile goes, through the cascade, because keeping a
-- consent record for an account that has exercised its right to be deleted
-- would be the opposite of what the record is for.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists policy_acceptances (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  document    text not null check (document in ('terms', 'privacy')),
  version     text not null,
  accepted_at timestamptz not null default now()
);

create unique index if not exists policy_acceptances_once
  on policy_acceptances (profile_id, document, version);

-- reading "what has this account accepted" is the common query
create index if not exists policy_acceptances_profile_idx
  on policy_acceptances (profile_id, accepted_at desc);

alter table policy_acceptances enable row level security;

drop policy if exists "read own acceptances" on policy_acceptances;
create policy "read own acceptances" on policy_acceptances
  for select using (profile_id = auth.uid() or kx_is_admin());

drop policy if exists "record own acceptance" on policy_acceptances;
create policy "record own acceptance" on policy_acceptances
  for insert with check (profile_id = auth.uid());

-- No update or delete policy on purpose. See the header.


-- ============================================================================
-- Check it took
-- ============================================================================
--   select * from policy_acceptances limit 5;
-- signed in as yourself, this must succeed:
--   insert into policy_acceptances (profile_id, document, version)
--   values (auth.uid(), 'terms', '1.0');
-- and running it a second time must change nothing (unique index), while
--   delete from policy_acceptances where profile_id = auth.uid();
-- must delete 0 rows, because no delete policy exists.
