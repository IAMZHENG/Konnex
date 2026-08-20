-- Stop a post's owner from bidding on their own post.
--
-- The original policy only checked that you were inserting a quote as
-- yourself (bidder_id = auth.uid()) — which a post's owner also satisfies,
-- so nothing stopped someone bidding on their own RFQ and skewing the
-- average price shown to everyone else.
--
-- The UI hides the เสนอราคา button for owners too, but that's only UX: the
-- anon key is public, so anyone can POST straight at the REST endpoint. This
-- policy is the part that actually enforces it.
--
-- Run this once in the Supabase SQL editor (same place schema.sql was run).

drop policy if exists "bidders create their own quotes" on quotes;

create policy "bidders create their own quotes" on quotes for insert
  with check (
    bidder_id = auth.uid()
    and not exists (
      select 1 from posts p
      where p.id = post_id
        and p.owner_id = auth.uid()
    )
  );
