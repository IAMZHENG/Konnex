-- Quote (ใบเสนอราคา) rules, enforced in the database.
--
-- Supersedes database/quotes_owner_guard.sql — that file only covered the
-- owner rule. Running this one is enough; it drops and recreates the same
-- policy names, so it is safe to run whether or not the earlier file was run.
--
-- The UI checks all of these too, but only as UX. The anon key is public, so
-- anyone can POST straight at the REST endpoint — these policies are what
-- actually holds.
--
-- Run this once in the Supabase SQL editor (same place schema.sql was run).


-- INSERT: you may only bid as yourself, never on your own post, and only
-- while the post is still open and its deadline has not passed.
drop policy if exists "bidders create their own quotes" on quotes;

create policy "bidders create their own quotes" on quotes for insert
  with check (
    bidder_id = auth.uid()
    and exists (
      select 1 from posts p
      where p.id = post_id
        and p.owner_id <> auth.uid()
        and p.status = 'open'
        and (p.deadline is null or p.deadline > now())
    )
  );


-- UPDATE: only the post's owner decides won/lost.
--
-- The original policy also allowed `bidder_id = auth.uid()`, and an UPDATE
-- policy with no WITH CHECK reuses its USING expression as the check — so a
-- bidder could update their own row and set status = 'won' themselves. Only
-- the owner can touch a quote now; nothing in the app lets a bidder edit a
-- sent quote, so no working flow depends on the old permission.
drop policy if exists "post owners update quote status" on quotes;
drop policy if exists "post owners decide quote status" on quotes;

create policy "post owners decide quote status" on quotes for update
  using (
    exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid())
  );
