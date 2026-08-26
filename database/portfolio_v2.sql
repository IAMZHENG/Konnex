-- ผลงานที่ผ่านมา, second pass — and a notification that knows who it is about.
--
-- Run this once in the Supabase SQL editor, after portfolio.sql and
-- connections.sql. Safe to re-run.
--
-- Ordering note (see no_winner.sql for why this matters): every new column is
-- added and backfilled *before* the old one is dropped, so a half-applied run
-- cannot lose data. The SQL editor runs the file as one transaction — if any
-- statement fails the whole thing rolls back and nothing here takes effect.


-- ---------------------------------------------------------------------------
-- 1. A piece of work can have several photos.
--
-- One machine installed on site is a wide shot, a close-up of the spindle and a
-- picture of the finished part — the seller had to pick one. `images` holds them
-- in order; `image_url` held exactly one and goes once its contents are safely
-- inside the array.
-- ---------------------------------------------------------------------------
alter table portfolio add column if not exists images text[] not null default '{}';

update portfolio
   set images = array[image_url]
 where image_url is not null
   and image_url <> ''
   and cardinality(images) = 0;

alter table portfolio drop column if exists image_url;


-- ---------------------------------------------------------------------------
-- 2. ขายให้ใคร and ปี come off the form.
--
-- Both were optional and both asked the seller to publish something about a
-- customer. The title plus the detail carry the entry on their own, and a
-- shorter form is one people actually finish. Dropped rather than left unwritten
-- so the schema stops describing fields nothing fills.
-- ---------------------------------------------------------------------------
alter table portfolio drop column if exists buyer_name;
alter table portfolio drop column if exists year;


-- ---------------------------------------------------------------------------
-- 3. notifications.actor_id — who the notification is *about*.
--
-- `profile_id` is who receives it. Nothing recorded who caused it, so a
-- "ตอบรับการเชื่อมต่อแล้ว" notification could name the person in its body text
-- and still have no way to open their profile — clicking it fell through to the
-- feed. The connect trigger fills it in below; other kinds may start setting it
-- later, and the client only uses it when it is there.
-- ---------------------------------------------------------------------------
alter table notifications add column if not exists actor_id uuid
  references profiles(id) on delete set null;


-- SECURITY DEFINER for the same reason as before: the row being written belongs
-- to the other party, which the notifications policies would refuse the actor.
create or replace function kx_notify_connection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if tg_op = 'INSERT' then
    select coalesce(company_name, 'ผู้ใช้ Konnex') into who
      from profiles where id = new.requester_id;
    insert into notifications (profile_id, kind, body, actor_id)
    values (new.addressee_id, 'connect_request', who || ' ขอเชื่อมต่อกับคุณ', new.requester_id);

  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    select coalesce(company_name, 'ผู้ใช้ Konnex') into who
      from profiles where id = new.addressee_id;
    insert into notifications (profile_id, kind, body, actor_id)
    values (new.requester_id, 'connect_accepted', who || ' ตอบรับการเชื่อมต่อแล้ว', new.addressee_id);
  end if;
  return new;
end;
$$;

-- Backfill what is already sitting in the table. The body text names the other
-- person, and a connection row holds the pair, so the actor is recoverable:
-- for a request you received, it is whoever asked; for an acceptance you were
-- told about, it is whoever accepted.
update notifications n
   set actor_id = c.requester_id
  from connections c
 where n.actor_id is null
   and n.kind = 'connect_request'
   and c.addressee_id = n.profile_id;

update notifications n
   set actor_id = c.addressee_id
  from connections c
 where n.actor_id is null
   and n.kind = 'connect_accepted'
   and c.requester_id = n.profile_id;
