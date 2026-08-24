-- Connect — the "เพิ่มเพื่อน" relationship between two accounts.
--
-- One row per pair, holding the request and the answer to it. A pair is stored
-- once, not twice: whoever asked is requester_id, whoever was asked is
-- addressee_id, and both directions read the same row. That is what makes
-- "are we connected" a single lookup and makes a duplicate request impossible.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


create table if not exists connections (
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  constraint connections_not_self check (requester_id <> addressee_id)
);

-- Both directions of a pair are the same relationship, so A→B and B→A must not
-- both exist. The primary key alone would allow that, since the two rows differ.
create unique index if not exists connections_one_per_pair
  on connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists connections_addressee_idx
  on connections (addressee_id, status);

alter table connections enable row level security;

-- A connection is between two people and is nobody else's business.
drop policy if exists "both sides read the connection" on connections;
create policy "both sides read the connection" on connections for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- You send requests as yourself, and only ever as pending — the row cannot be
-- born accepted, or asking would be the same as being accepted.
drop policy if exists "you send your own requests" on connections;
create policy "you send your own requests" on connections for insert
  with check (requester_id = auth.uid() and status = 'pending');

-- Only the person who was asked can answer. The requester accepting their own
-- request is exactly what this stops.
drop policy if exists "the addressee answers" on connections;
create policy "the addressee answers" on connections for update
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid() and status = 'accepted');

-- Either side may withdraw: the requester cancelling, the addressee declining,
-- or either one disconnecting later. All three are the same delete.
drop policy if exists "either side withdraws" on connections;
create policy "either side withdraws" on connections for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Telling the other person.
--
-- SECURITY DEFINER because the row being written belongs to the *other* party:
-- a notification for them, which the notifications policies would refuse to let
-- the actor insert. The function only ever writes a notification addressed to
-- the counterparty of the row that fired it, so it cannot be used to write
-- anywhere else.
-- ---------------------------------------------------------------------------
create or replace function kx_notify_connection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if tg_op = 'INSERT' then
    select coalesce(company_name, 'ผู้ใช้ Konnex') into who
      from profiles where id = new.requester_id;
    insert into notifications (profile_id, kind, body)
    values (new.addressee_id, 'connect_request', who || ' ขอเชื่อมต่อกับคุณ');

  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    select coalesce(company_name, 'ผู้ใช้ Konnex') into who
      from profiles where id = new.addressee_id;
    insert into notifications (profile_id, kind, body)
    values (new.requester_id, 'connect_accepted', who || ' ตอบรับการเชื่อมต่อแล้ว');
  end if;
  return new;
end;
$$;

drop trigger if exists connections_notify on connections;
create trigger connections_notify
  after insert or update on connections
  for each row execute function kx_notify_connection();


-- ---------------------------------------------------------------------------
-- How many accepted connections an account has.
--
-- SECURITY DEFINER for the same reason the policies above are narrow: the rows
-- being counted are private to the two people in them, so a count taken under
-- the caller's own permissions would only ever count their own. This returns a
-- number and never a row, so nothing private leaks through it.
-- ---------------------------------------------------------------------------
create or replace function kx_connection_count(pid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from connections
   where status = 'accepted' and (requester_id = pid or addressee_id = pid);
$$;

grant execute on function kx_connection_count(uuid) to anon, authenticated;
