-- ============================================================================
-- ต่ออายุประกาศ = ดันขึ้นบนฟีด
-- ============================================================================
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The feed is ordered by posts.created_at, which never changes. So a buyer who
-- came back to a listing that had run out of time, pushed the deadline out and
-- said "I still want this" got nothing for it: the listing left the หมดเขต
-- group at the bottom of the feed and settled back into its original place,
-- which for a month-old post is the bottom of the feed anyway. The one signal
-- we have that a listing is still wanted was being thrown away.
--
-- posts.bumped_at is the sort key now: the posting time for every listing that
-- has never been renewed, and the moment of renewal for one that has. The card
-- still shows "โพสต์เมื่อ 27 วันที่แล้ว" from created_at, because that is when
-- it was posted, with a ต่ออายุแล้ว chip to say why it is near the top.
--
-- Only the trigger ever writes the column. A client that sends its own
-- bumped_at is ignored — otherwise anyone could put their listing on top of
-- the feed with a one-line update.

alter table posts add column if not exists bumped_at timestamptz;

-- every listing that already exists was last active when it was posted
update posts set bumped_at = created_at where bumped_at is null;


create or replace function kx_posts_bump()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- a new listing is active as of its posting time, whatever was sent
    new.bumped_at := coalesce(new.created_at, now());
    return new;
  end if;

  -- the column is the trigger's to write, not the client's
  new.bumped_at := old.bumped_at;

  /* A renewal is a deadline moved further out and landing in the future.
     That covers both ways it happens: an expired listing given a new date,
     and a live one extended before it ran out. Shortening a deadline, or
     setting one that is already past, is not a renewal and does not bump.

     To rate-limit this later — one bump per listing per 7 days, say — add
         and coalesce(old.bumped_at, old.created_at) < now() - interval '7 days'
     to the condition below. Left off while the platform is small: at this
     size a listing being renewed is news, not noise. */
  if new.deadline is distinct from old.deadline
     and new.deadline is not null
     and new.deadline > now()
     and (old.deadline is null or new.deadline > old.deadline)
  then
    new.bumped_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists trg_posts_bump on posts;
create trigger trg_posts_bump before insert or update on posts
  for each row execute function kx_posts_bump();

-- the feed reads (status, kind) ordered by bumped_at desc, one page at a time
create index if not exists posts_bumped_idx on posts (status, bumped_at desc);


-- ============================================================================
-- Check it took
-- ============================================================================
--   select title, created_at::date, bumped_at::date, deadline::date
--     from posts order by bumped_at desc limit 10;
-- every row should have a bumped_at, equal to created_at until it is renewed.
--
-- A renewal, end to end (replace the id):
--   update posts set deadline = now() + interval '14 days' where id = '...';
--   select created_at, bumped_at from posts where id = '...';   -- bumped_at = now()
