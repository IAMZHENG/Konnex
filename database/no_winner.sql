-- QubeQuote does not pick winners.
--
-- This reverses rfq_outcome.sql and the win/lose model it was built on. The
-- decision behind it: QubeQuote collects comparable quotes so a buyer can take
-- them into their own purchasing process. It is not an auction, so there is no
-- winner to declare, no loser to label, and nothing for the platform to record
-- about a decision it never sees.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- ORDER MATTERS HERE. An earlier version of this file dropped kx_did_business
-- before replacing the review policy that calls it. Postgres refuses to drop a
-- function an active policy depends on, and the SQL editor runs the file as one
-- transaction — so that single error rolled the whole thing back and left the
-- database exactly as it was, with no sign anything had failed except that
-- nothing had changed. The replacement goes in first now, and only then is the
-- old one dropped.


-- ---------------------------------------------------------------------------
-- 1. Reviews first, because the policy is what pins the old function in place.
--
-- The insert policy required a quote with status 'won' between the two parties.
-- Nothing can ever be 'won' again, so left alone it would silently kill every
-- review on the platform — no error, no empty state, just a button that always
-- says "เขียนรีวิวได้เมื่อทำงานร่วมกันจบแล้ว" and never opens.
--
-- What is still true and checkable is that the two of you dealt with each other
-- on a specific listing: one of you owns it, the other quoted on it. That is a
-- narrower claim than "we did business" — it does not prove a purchase — but it
-- is a real interaction, it cannot be faked without actually quoting, and the
-- unique index on (post_id, reviewer_id, reviewee_id) still holds it to one
-- review each per listing.
-- ---------------------------------------------------------------------------
create or replace function kx_dealt_with(a uuid, b uuid, pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p
     where p.id = pid
       and (
         (p.owner_id = a and exists (select 1 from quotes q
                                      where q.post_id = p.id and q.bidder_id = b))
         or
         (p.owner_id = b and exists (select 1 from quotes q
                                      where q.post_id = p.id and q.bidder_id = a))
       )
  );
$$;

grant execute on function kx_dealt_with(uuid, uuid, uuid) to anon, authenticated;

drop policy if exists "reviewers write their own reviews" on reviews;
create policy "reviewers write their own reviews" on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and reviewee_id <> auth.uid()
    and kx_dealt_with(auth.uid(), reviewee_id, post_id)
  );


-- ---------------------------------------------------------------------------
-- 2. Now the outcome machinery can go — nothing depends on it any more.
--
-- The columns are dropped rather than left in place unused: a column nobody
-- writes is a trap for whoever reads this schema next, and `outcome` sitting
-- beside `status` would read as though it still meant something.
-- ---------------------------------------------------------------------------
drop function if exists kx_set_outcome(uuid, text, uuid, text);
drop function if exists kx_did_business(uuid, uuid, uuid);
drop index if exists posts_outcome_idx;
alter table posts drop column if exists outcome;
alter table posts drop column if exists outcome_at;
alter table posts drop column if exists outcome_note;
alter table posts drop column if exists outcome_supplier_id;


-- ---------------------------------------------------------------------------
-- 3. quotes.status: a quote has no verdict any more.
--
-- Existing rows are settled back to 'pending', which is now the only value it
-- ever holds. 'won' and 'lost' would otherwise sit in the database as claims
-- about competitions that are no longer run. The column stays because the
-- embeds select it; the check is narrowed so nothing can start writing verdicts
-- again by accident.
-- ---------------------------------------------------------------------------
update quotes set status = 'pending' where status <> 'pending';

alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in ('pending'));


-- ---------------------------------------------------------------------------
-- 4. wins_count and its trigger.
--
-- "งานสำเร็จ" counted quotes marked 'won'. Nothing is marked 'won' any more, so
-- the number can only ever be zero and the trigger has nothing to fire on. Both
-- go, and the counter is zeroed so no profile keeps displaying a total it can
-- no longer earn or lose. The column itself stays: the client reads it, and
-- removing it would need a coordinated deploy for no benefit.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_quotes_wins on quotes;
drop function if exists kx_bump_wins();
drop function if exists kx_wins_of(uuid);
update profiles set wins_count = 0 where wins_count <> 0;
