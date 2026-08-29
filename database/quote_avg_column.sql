-- ============================================================================
-- posts.quote_avg — the average offer, kept beside the count
-- ============================================================================
-- The feed card shows ราคาเฉลี่ย, and it was computing it from the embedded
-- `quotes(price)`. That embed is behind the select policy on quotes, so it
-- carries the viewer's own offer and nothing else: a bidder scrolling the feed
-- saw their own price on the card, labelled as the average of everyone's.
--
-- kx_post_avg_price() (public_avg_price.sql) already answers this correctly for
-- one post, but the feed draws sixty cards and one round trip each is not a
-- trade worth making. So the average lives on the row, maintained the same way
-- quote_count is (post_counters.sql) — a trigger that recomputes it whenever a
-- quote arrives, changes or leaves.
--
-- UPDATE matters here in a way it does not for the count: editing a quote's
-- price moves the average without changing how many there are.
--
-- What this publishes is the same thing public_avg_price.sql publishes, and the
-- note there explains it: with two offers, a bidder can recover the other price
-- from the average and their own. That was a deliberate call.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table posts add column if not exists quote_avg numeric;

create or replace function kx_bump_quote_avg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  update posts
     set quote_avg = (select round(avg(price)) from quotes
                       where post_id = pid and price is not null)
   where id = pid;
  return null;
end;
$$;

drop trigger if exists trg_quotes_avg on quotes;
create trigger trg_quotes_avg
  after insert or update of price or delete on quotes
  for each row execute function kx_bump_quote_avg();

-- backfill what is already there
update posts p
   set quote_avg = (select round(avg(q.price)) from quotes q
                     where q.post_id = p.id and q.price is not null);


-- ============================================================================
-- Check it took
-- ============================================================================
--   select id, quote_count, quote_avg from posts where quote_count > 0;
-- and signed out, the column must still be readable while the prices are not:
--   select quote_avg from posts where id = '<a post with quotes>';   -- a number
--   select price from quotes where post_id = '<that post>';          -- no rows
