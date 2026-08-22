-- A post stays readable to the people who took part in it after it closes.
--
-- The select policy was `status = 'open' or owner_id = auth.uid()`, so the
-- moment an owner picked a winner — which closes the post — everyone who had
-- quoted on it lost sight of it. Three things broke at once:
--
--   * ใบเสนอราคา showed the winning bid as "ประกาศนี้ถูกปิดแล้ว" with a
--     placeholder picture, because the embedded post came back null.
--   * The winner could not review the buyer: kxReviewableDeals looks for the
--     other party's posts, and the one they had just done business over was
--     invisible.
--   * Even if it had been offered, the insert would have been refused —
--     the reviews policy checks `posts` under the reviewer's own RLS.
--
-- Being involved in a post is not the same as the post being public. This adds
-- exactly that case and nothing else: someone who sent a quote or a quote
-- request keeps their own view of what they took part in.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


-- SECURITY DEFINER for two reasons. The obvious one: a policy on `posts` that
-- queried `quotes` would run that subquery under the caller's RLS, and the
-- quotes policy itself queries `posts` — Postgres would refuse the recursion.
-- The other: it must be able to see the row to answer the question at all.
create or replace function kx_involved_in_post(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from quotes q where q.post_id = pid and q.bidder_id = auth.uid())
      or exists (select 1 from quote_requests r where r.post_id = pid and r.requester_id = auth.uid());
$$;

-- anon as well as authenticated: the policy below is evaluated for every reader
-- of `posts`, so a signed-out visitor who could not execute it would get an
-- error instead of the public feed. For them auth.uid() is null and it simply
-- returns false.
grant execute on function kx_involved_in_post(uuid) to anon, authenticated;


drop policy if exists "open posts are public" on posts;
create policy "open posts are public" on posts for select
  using (
    status = 'open'
    or owner_id = auth.uid()
    or kx_involved_in_post(id)
  );

-- the pictures and files follow the post, so they need the same three cases
drop policy if exists "images follow their post" on post_images;
create policy "images follow their post" on post_images for select
  using (exists (
    select 1 from posts p
     where p.id = post_id
       and (p.status = 'open' or p.owner_id = auth.uid() or kx_involved_in_post(p.id))
  ));

drop policy if exists "attachments follow their post" on post_attachments;
create policy "attachments follow their post" on post_attachments for select
  using (exists (
    select 1 from posts p
     where p.id = post_id
       and (p.status = 'open' or p.owner_id = auth.uid() or kx_involved_in_post(p.id))
  ));
