-- profiles.wins_count — how many jobs this account has actually won.
--
-- The compare-offers list wants to say "งานสำเร็จ N ชิ้น" beside each bidder,
-- and there was no honest way to know: `quotes` is visible only to the bidder
-- and the post's owner, so counting a stranger's wins from the client always
-- came back 0. Same shape of problem, and same fix, as posts.request_count /
-- posts.quote_count in post_counters.sql — a public counter column kept by a
-- trigger, with the rows behind it still private.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


alter table profiles add column if not exists wins_count int not null default 0;


-- SECURITY DEFINER: the row being updated is the *bidder's* profile, and the
-- person whose action triggers this is usually the post's owner marking a
-- winner. The profiles policy would refuse that write.
--
-- Recomputed from the rows rather than incremented, so it cannot drift out of
-- step with reality however the quote got there.
create or replace function kx_bump_wins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[] := '{}';
begin
  -- OLD is unassigned on insert and NEW on delete, so each is read only where
  -- it exists rather than referenced unconditionally
  if tg_op <> 'INSERT' then ids := ids || old.bidder_id; end if;
  if tg_op <> 'DELETE' then ids := ids || new.bidder_id; end if;

  update profiles p
     set wins_count = (
       select count(*) from quotes q
        where q.bidder_id = p.id and q.status = 'won'
     )
   where p.id = any(ids);
  return null;
end;
$$;

drop trigger if exists trg_quotes_wins on quotes;
create trigger trg_quotes_wins
  after insert or update or delete on quotes
  for each row execute function kx_bump_wins();


-- bring existing profiles in line; also makes this file safe to re-run
update profiles p set wins_count = (
  select count(*) from quotes q where q.bidder_id = p.id and q.status = 'won'
);
