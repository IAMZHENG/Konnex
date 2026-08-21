-- Keep profiles.rating_avg / rating_count true, and say who may review whom.
--
-- The columns existed and nothing ever wrote them, so every profile read 0
-- reviews while the page displayed a hardcoded 4.8 out of 128. A review also
-- has to be earned: `reviews` had an insert policy saying only that you write
-- as yourself, which would let anyone rate anyone, repeatedly, over a post
-- they had nothing to do with.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


-- One review per person per deal. Without this, a bad review can be drowned
-- by the same reviewer leaving ten good ones.
create unique index if not exists reviews_one_per_deal
  on reviews (post_id, reviewer_id, reviewee_id);


-- You may review someone only on a post where the two of you actually did
-- business: either you own the post and they won it, or they own it and you
-- won it. And never yourself.
drop policy if exists "reviewers write their own reviews" on reviews;
create policy "reviewers write their own reviews" on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and reviewee_id <> auth.uid()
    and (
      exists (
        select 1 from posts p
        join quotes q on q.post_id = p.id and q.status = 'won'
        where p.id = post_id and p.owner_id = auth.uid() and q.bidder_id = reviewee_id
      )
      or exists (
        select 1 from posts p
        join quotes q on q.post_id = p.id and q.status = 'won'
        where p.id = post_id and p.owner_id = reviewee_id and q.bidder_id = auth.uid()
      )
    )
  );

-- Editing or deleting your own review is fine; rewriting someone else's is not.
drop policy if exists "reviewers manage their own reviews" on reviews;
create policy "reviewers manage their own reviews" on reviews for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
drop policy if exists "reviewers delete their own reviews" on reviews;
create policy "reviewers delete their own reviews" on reviews for delete
  using (reviewer_id = auth.uid());


-- The aggregate is recomputed from the rows rather than nudged, so it cannot
-- drift. SECURITY DEFINER because the reviewer is updating the *reviewee's*
-- profile row, which the profiles policy would otherwise refuse.
create or replace function kx_sync_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update profiles p set
    rating_count = (select count(*) from reviews r where r.reviewee_id = target),
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 1) from reviews r where r.reviewee_id = target), 0)
  where p.id = target;
  return null;
end;
$$;

drop trigger if exists trg_reviews_rating on reviews;
create trigger trg_reviews_rating
  after insert or update or delete on reviews
  for each row execute function kx_sync_rating();

-- bring existing profiles in line; also makes this file safe to re-run
update profiles p set
  rating_count = coalesce((select count(*) from reviews r where r.reviewee_id = p.id), 0),
  rating_avg   = coalesce((select round(avg(r.rating)::numeric, 1) from reviews r where r.reviewee_id = p.id), 0);
