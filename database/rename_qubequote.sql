-- ============================================================================
-- เปลี่ยนชื่อ Konnex → QubeQuote — ส่วนที่อยู่ในฐานข้อมูล
-- ============================================================================
-- Renaming the app in index.html does not reach the database. One string lives
-- inside a trigger function that Postgres compiled when the function was
-- created: the stand-in shown for an account that has not filled in a company
-- name. Until the function is replaced, every new connection notification keeps
-- saying "ผู้ใช้ Konnex", whatever the page is called.
--
-- kx_notify_connection() exists in two files — connections.sql created it and
-- portfolio_v2.sql replaced it with a version that also records actor_id. This
-- is the second one, body for body, with only the name changed; running an
-- older shape would silently drop actor_id and break the notification's link
-- back to whoever it is about.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create or replace function kx_notify_connection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if tg_op = 'INSERT' then
    select coalesce(company_name, 'ผู้ใช้ QubeQuote') into who
      from profiles where id = new.requester_id;
    insert into notifications (profile_id, kind, body, actor_id)
    values (new.addressee_id, 'connect_request', who || ' ขอเชื่อมต่อกับคุณ', new.requester_id);

  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    select coalesce(company_name, 'ผู้ใช้ QubeQuote') into who
      from profiles where id = new.addressee_id;
    insert into notifications (profile_id, kind, body, actor_id)
    values (new.requester_id, 'connect_accepted', who || ' ตอบรับการเชื่อมต่อแล้ว', new.addressee_id);
  end if;
  return new;
end;
$$;

-- Notifications already sent still carry the old name in their text. This is a
-- stand-in the trigger wrote, not anything a person typed, so rewriting it is
-- correcting our own label rather than editing someone's words.
update notifications
   set body = replace(body, 'ผู้ใช้ Konnex', 'ผู้ใช้ QubeQuote')
 where body like '%ผู้ใช้ Konnex%';


-- ============================================================================
-- Check it took
-- ============================================================================
-- the function no longer contains the old name, and still writes actor_id:
--   select prosrc like '%QubeQuote%' as renamed,
--          prosrc like '%actor_id%'  as keeps_actor
--     from pg_proc where proname = 'kx_notify_connection';
-- and nothing is left in the table:
--   select count(*) from notifications where body like '%Konnex%';   -- 0
