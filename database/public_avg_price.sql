-- ============================================================================
-- ราคาเฉลี่ย — the average offer on a listing, for everyone
-- ============================================================================
-- The page shows "มีผู้เสนอราคาเข้ามา N ราย · ราคาเฉลี่ย X" to every visitor.
-- The individual prices cannot come from `quotes` for anyone but the bidder and
-- the post owner (schema.sql), so the average has to be computed where the rows
-- are — here.
--
-- Understand what this publishes before changing anything around it. On a
-- listing with two offers, a bidder who knows their own price can recover the
-- other one exactly: other = avg * 2 - mine. With three it is a range, with ten
-- it is noise. This is a deliberate product decision, made knowingly: the
-- average is what tells a supplier whether they are in the right region at all,
-- and that was judged worth more than what it gives away on a thin listing.
--
-- If that trade ever needs narrowing, the honest lever is a floor on the number
-- of offers — return null below, say, three — rather than hiding it from some
-- viewers and not others, which only obscures who can already work it out.
--
-- Run once in the Supabase SQL editor.

create or replace function kx_post_avg_price(pid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(avg(price))
    from quotes
   where post_id = pid
     and price is not null;
$$;

revoke all on function kx_post_avg_price(uuid) from public;
grant execute on function kx_post_avg_price(uuid) to anon, authenticated;


-- ============================================================================
-- Check it took
-- ============================================================================
--   select kx_post_avg_price('<a post id with quotes>');   -- a number
--   select avg(price) from quotes where post_id = '<same>'; -- null when signed
--                                                           -- out, which is the
--                                                           -- point of the above
