-- ============================================================================
-- ใครมาเสนอราคาบ้าง — the bidder list, without the bids
-- ============================================================================
-- The select policy on `quotes` (schema.sql) hands a row to its bidder and to
-- the post owner and to nobody else. That is right for the price, but it also
-- means a third party gets no rows at all — so a listing whose card says
-- "มีผู้เสนอราคาเข้ามา 2 ราย" opened onto an empty comparison section. The count
-- comes from posts.quote_count, which a trigger maintains, so the number was
-- real and the list beneath it was empty. That reads as a broken page.
--
-- RLS is row-level: it cannot hand over half a row. So the identity half comes
-- through a function instead — security definer, reading past the policy, and
-- returning only the columns that are safe for anyone to see.
--
-- What this deliberately does NOT return:
--   * price      — the whole point of the policy above
--   * note       — free text, and the place a bidder is most likely to write a
--                  number ("ลด 5% จากที่คุยไว้"). Returning it would leak the
--                  price in prose while the column beside it stayed private.
--   * anything from quote_attachments — the quotation file itself
--
-- Run once in the Supabase SQL editor.

create or replace function kx_post_bidders(pid uuid)
returns table (
  quote_id     uuid,
  bidder_id    uuid,
  created_at   timestamptz,
  company_name text,
  avatar_url   text,
  province     text,
  is_verified  boolean,
  rating_avg   numeric,
  rating_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.bidder_id, q.created_at,
         p.company_name, p.avatar_url, p.province,
         p.is_verified, p.rating_avg, p.rating_count
    from quotes q
    join profiles p on p.id = q.bidder_id
   where q.post_id = pid
   order by q.created_at;      -- the order they arrived, which is how the page lists them
$$;

revoke all on function kx_post_bidders(uuid) from public;
grant execute on function kx_post_bidders(uuid) to anon, authenticated;


-- ============================================================================
-- Check it took
-- ============================================================================
-- Signed out, or as any account that is neither the bidder nor the post owner,
-- this must return the bidders with no price column in sight:
--   select * from kx_post_bidders('<a post id with quotes>');
-- and this must still return nothing:
--   select * from quotes where post_id = '<that same post>';
