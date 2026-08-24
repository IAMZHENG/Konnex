-- An RFQ does not have to have a winner.
--
-- The app was built as though every RFQ ends by choosing someone. Real
-- purchasing does not work that way: a buyer often opens an RFQ to gather
-- comparable quotes, then takes them into their own procurement process — a
-- PO raised in their ERP, a committee, a frame agreement already in place — or
-- decides not to buy at all. Forcing a winner makes the record say something
-- that did not happen.
--
-- Closing already worked without picking anyone. What was missing was any way
-- to say so, which left two things wrong:
--   * every quote on that RFQ stayed 'pending' forever, so the seller's list
--     said "รอตอบ" about a decision that had already been made and passed them by
--   * nothing recorded what actually happened, so the platform could not tell a
--     deal it created from one it did not
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


-- ---------------------------------------------------------------------------
-- What happened, recorded on the post. All of it optional — a buyer who says
-- nothing leaves outcome null, and that is a legitimate end state, not an
-- unfinished one.
--
--   awarded    ordered through Konnex from one of the quotes
--   external   the quotes were used, the purchase was made outside Konnex
--   undecided  parked on purpose, may come back to it
--   cancelled  not buying after all
--   null       did not say
-- ---------------------------------------------------------------------------
alter table posts add column if not exists outcome text
  check (outcome in ('awarded', 'external', 'undecided', 'cancelled'));
alter table posts add column if not exists outcome_at timestamptz;
alter table posts add column if not exists outcome_note text;

-- Who the buyer actually bought from, when they are willing to say. Set for
-- 'awarded', and offered for 'external' as well — buying outside Konnex from a
-- supplier found on Konnex is still that supplier's work, and pretending
-- otherwise is what makes 'external' a black hole.
alter table posts add column if not exists outcome_supplier_id uuid
  references profiles(id) on delete set null;

create index if not exists posts_outcome_idx on posts (owner_id, outcome);


-- ---------------------------------------------------------------------------
-- 'closed' on a quote: the RFQ ended and nobody was awarded.
--
-- Distinct from the two that already existed, because they are three different
-- facts and a seller reading their own list deserves the right one:
--   pending  still waiting on the buyer
--   won      chosen
--   lost     someone else was chosen
--   closed   nobody was chosen
-- Calling the fourth one 'lost' would be a false statement about a competition
-- that never concluded.
-- ---------------------------------------------------------------------------
alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in ('pending', 'won', 'lost', 'closed'));


-- ---------------------------------------------------------------------------
-- Recording an outcome, in one place.
--
-- SECURITY DEFINER because settling the quotes means writing rows that belong
-- to the bidders, which the quotes policies rightly refuse to the post owner
-- directly. The guard is the first statement: the caller must own the post, so
-- this can only ever settle your own RFQ.
-- ---------------------------------------------------------------------------
create or replace function kx_set_outcome(
  pid uuid,
  new_outcome text,
  supplier uuid default null,
  note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select owner_id into owner from posts where id = pid;
  if owner is null or owner <> auth.uid() then
    raise exception 'not your post';
  end if;
  if new_outcome is not null
     and new_outcome not in ('awarded', 'external', 'undecided', 'cancelled') then
    raise exception 'unknown outcome %', new_outcome;
  end if;

  -- an award has to name someone, and that someone has to have quoted
  if new_outcome = 'awarded' then
    if supplier is null then
      raise exception 'awarded needs a supplier';
    end if;
    if not exists (select 1 from quotes q where q.post_id = pid and q.bidder_id = supplier) then
      raise exception 'that supplier did not quote on this post';
    end if;
  end if;

  update posts
     set outcome = new_outcome,
         outcome_supplier_id = case when new_outcome in ('awarded', 'external') then supplier else null end,
         outcome_note = note,
         outcome_at = case when new_outcome is null then null else now() end,
         status = case when new_outcome is null or new_outcome = 'undecided'
                       then status else 'closed' end
   where id = pid;

  -- Settle the quotes to match. 'undecided' and a cleared outcome leave them
  -- alone: nothing has been decided, so nothing should be said.
  if new_outcome = 'awarded' then
    update quotes set status = 'won'  where post_id = pid and bidder_id = supplier;
    update quotes set status = 'lost' where post_id = pid and bidder_id <> supplier;
  elsif new_outcome in ('external', 'cancelled') then
    update quotes set status = 'closed' where post_id = pid;
  end if;
end;
$$;

grant execute on function kx_set_outcome(uuid, text, uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Reviews have to follow.
--
-- The insert policy required a quote with status 'won' between the two parties.
-- With most RFQs now legitimately ending without an award, that would leave
-- almost nobody able to review anybody — the trust system would quietly go
-- dark. A purchase recorded as 'external' with a named supplier is the same
-- claim as an award: this buyer bought from this seller. It earns the same
-- right to be reviewed, in both directions.
-- ---------------------------------------------------------------------------
create or replace function kx_did_business(a uuid, b uuid, pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p
     where p.id = pid
       and (
         -- a owns the post and b was awarded it, or was named as the supplier
         (p.owner_id = a and (
            exists (select 1 from quotes q
                     where q.post_id = p.id and q.bidder_id = b and q.status = 'won')
            or (p.outcome in ('awarded', 'external') and p.outcome_supplier_id = b)))
         -- or the other way round
         or (p.owner_id = b and (
            exists (select 1 from quotes q
                     where q.post_id = p.id and q.bidder_id = a and q.status = 'won')
            or (p.outcome in ('awarded', 'external') and p.outcome_supplier_id = a)))
       )
  );
$$;

grant execute on function kx_did_business(uuid, uuid, uuid) to anon, authenticated;

drop policy if exists "reviewers write their own reviews" on reviews;
create policy "reviewers write their own reviews" on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and reviewee_id <> auth.uid()
    and kx_did_business(auth.uid(), reviewee_id, post_id)
  );


-- ---------------------------------------------------------------------------
-- wins_count follows the same widening: a purchase the buyer says they made
-- from you is your work whether the order went through Konnex or through their
-- own PO. Both are the buyer's word — the same trust level either way, so
-- treating them differently would be arbitrary.
-- ---------------------------------------------------------------------------
create or replace function kx_wins_of(pid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from quotes q where q.bidder_id = pid and q.status = 'won')
    + (select count(*) from posts p
        where p.outcome = 'external' and p.outcome_supplier_id = pid)
  )::int;
$$;

grant execute on function kx_wins_of(uuid) to anon, authenticated;

-- and bring the stored counter in line with it
update profiles p set wins_count = kx_wins_of(p.id);
