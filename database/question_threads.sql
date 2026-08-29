-- ============================================================================
-- ถามต่อจากคำตอบได้ — follow-ups on a question
-- ============================================================================
-- post_questions (questions.sql) held one question and one answer per row, and
-- the page rendered no input at all once `answer` was filled. A conversation
-- ended at the first reply: to ask anything further you had to start a fresh
-- question at the bottom of the page, with nothing tying it to the answer it
-- was about.
--
-- A follow-up is just another question that knows which one it follows, so the
-- table points at itself. A thread is a row with parent_id null plus every row
-- pointing at it, oldest first.
--
-- Why not a separate replies table: every policy on post_questions — who may
-- read a question, who may write one, who may answer — applies unchanged to a
-- follow-up, because a follow-up *is* a question. A second table would need all
-- three written again and kept in step.
--
-- The `answer` column stays exactly as it was. Answers already written are
-- still answers; the page shows one as the first message in its thread.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table post_questions
  add column if not exists parent_id uuid references post_questions(id) on delete cascade;

-- reading a thread means fetching its children in order
create index if not exists post_questions_parent_idx
  on post_questions (parent_id, created_at);

-- A follow-up must hang off a question on the same post. Without this a row
-- could point at a question belonging to some other listing, and the thread
-- would render under both.
create or replace function kx_question_same_post()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if not exists (
      select 1 from post_questions q
       where q.id = new.parent_id
         and q.post_id = new.post_id
         and q.parent_id is null          -- one level: replies hang off the question
    ) then
      raise exception 'คำถามต่อเนื่องต้องอยู่ใต้คำถามของประกาศเดียวกัน'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_question_same_post on post_questions;
create trigger trg_question_same_post
  before insert or update of parent_id, post_id on post_questions
  for each row execute function kx_question_same_post();


-- ============================================================================
-- Check it took
-- ============================================================================
--   select id, parent_id from post_questions limit 5;          -- column exists
-- and a follow-up pointing at another post's question must be refused:
--   insert into post_questions (post_id, asker_id, body, parent_id)
--   values ('<post A>', auth.uid(), 'x', '<a question on post B>');   -- 23514
