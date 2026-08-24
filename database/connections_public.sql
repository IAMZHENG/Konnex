-- Make a *connection* public, while a *request* stays private.
--
-- connections.sql shipped one read policy: only the two people in a row could
-- see it. That is right for a request — one you have not answered yet, or one
-- that was quietly withdrawn, is nobody else's business — but it also hid the
-- finished connection, so nobody could see who anyone is connected with. The
-- count worked only because kx_connection_count is SECURITY DEFINER and returns
-- a number rather than rows.
--
-- The split is on status, which is exactly the line between the two:
--   accepted  — both people agreed to it. Public.
--   pending   — one person asked and the other has not answered. The two of them.
--
-- Run this once in the Supabase SQL editor, after connections.sql. Safe to re-run.


drop policy if exists "both sides read the connection" on connections;
drop policy if exists "accepted connections are public" on connections;

create policy "accepted connections are public" on connections for select
  using (
    status = 'accepted'
    or requester_id = auth.uid()
    or addressee_id = auth.uid()
  );

-- Nothing else changes. Writing is still the same three rules from
-- connections.sql: you send requests only as yourself and only as pending, only
-- the addressee may accept, and either side may withdraw.
