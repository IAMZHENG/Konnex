-- Public counters on posts, so the same number appears on every page.
--
-- The counts were being derived by embedding the rows and taking .length, and
-- both of those tables are deliberately private: `quote_requests` is visible
-- only to the requester and the seller, `quotes` only to the bidder and the
-- post owner. So the embed returned nothing for anyone else, and the feed
-- showed every RFQ as "0 ข้อเสนอ" and every Offer as "0 ผู้ขอใบเสนอราคา" to
-- everybody except the people already involved.
--
-- Counting can't be fixed by loosening those policies without also exposing
-- who asked and what they offered. A counter column can be public on its own:
-- it says how much interest there is without saying anything about whom.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

alter table posts
  add column if not exists request_count int not null default 0,
  add column if not exists quote_count   int not null default 0;


-- SECURITY DEFINER matters here: the row being counted belongs to a buyer or a
-- bidder, but the post being updated belongs to the seller, and the posts
-- policy only lets an owner write their own. Without it, a buyer's request
-- would be refused when the trigger tried to bump the seller's counter.
create or replace function kx_bump_post_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'quote_requests' then
    if tg_op = 'INSERT' then
      update posts set request_count = request_count + 1 where id = new.post_id;
    elsif tg_op = 'DELETE' then
      update posts set request_count = greatest(0, request_count - 1) where id = old.post_id;
    end if;
  else
    if tg_op = 'INSERT' then
      update posts set quote_count = quote_count + 1 where id = new.post_id;
    elsif tg_op = 'DELETE' then
      update posts set quote_count = greatest(0, quote_count - 1) where id = old.post_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_quote_requests_count on quote_requests;
create trigger trg_quote_requests_count
  after insert or delete on quote_requests
  for each row execute function kx_bump_post_counts();

drop trigger if exists trg_quotes_count on quotes;
create trigger trg_quotes_count
  after insert or delete on quotes
  for each row execute function kx_bump_post_counts();


-- bring existing posts up to date; also makes this file safe to re-run
update posts p set
  request_count = coalesce((select count(*) from quote_requests r where r.post_id = p.id), 0),
  quote_count   = coalesce((select count(*) from quotes q        where q.post_id = p.id), 0);
