-- ถาม-ตอบ on a post (คำถามเกี่ยวกับงานนี้).
--
-- The Q&A block on the RFQ and Offer pages was hand-written demo content with
-- no table behind it, and the ถาม button only appended a <div> to the page —
-- the question was gone on reload and the post's owner never saw it. This is
-- the table that makes it real.
--
-- One row is one question plus, optionally, the owner's answer. That matches
-- what the page shows (a question with a single reply underneath it) and
-- keeps "has this been answered yet" a property of the question itself.
--
-- The page deliberately shows askers as "ผู้ให้บริการ (ไม่ระบุชื่อ)" — a
-- competitor should not learn who else is looking at the job — so asker_id is
-- stored for authorship but never displayed.
--
-- Run this once in the Supabase SQL editor (same place schema.sql was run).

create table if not exists post_questions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  asker_id    uuid not null references profiles(id) on delete cascade,
  body        text not null,
  answer      text,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists post_questions_post_idx on post_questions (post_id, created_at);

alter table post_questions enable row level security;

-- Readable by anyone who can see the post, plus always by whoever asked.
drop policy if exists "questions follow their post" on post_questions;
create policy "questions follow their post" on post_questions for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_id
        and (p.status = 'open' or p.owner_id = auth.uid())
    )
    or asker_id = auth.uid()
  );

-- Anyone signed in may ask, as themselves, on a post that is still open.
drop policy if exists "signed in users ask questions" on post_questions;
create policy "signed in users ask questions" on post_questions for insert
  with check (
    asker_id = auth.uid()
    and exists (select 1 from posts p where p.id = post_id and p.status = 'open')
  );

-- Only the post's owner may answer. Without the WITH CHECK an UPDATE policy
-- reuses USING as its check, which is fine here but stated explicitly so the
-- intent does not depend on that default.
drop policy if exists "post owners answer questions" on post_questions;
create policy "post owners answer questions" on post_questions for update
  using (
    exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid())
  );
