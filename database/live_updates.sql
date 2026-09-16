-- ============================================================================
-- แจ้งเตือนสด: นับที่ยังไม่ได้อ่านในคำขอเดียว และแจ้งเตือนเมื่อมีข้อความใหม่
-- ============================================================================
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The app used to learn about new notifications exactly once, at sign-in, and
-- about new messages only while ข้อความ was open. Everything that arrived
-- after that sat unseen until the person happened to refresh — which is what
-- "ต้องกดรีเฟรชหลายรอบ" was. The page now asks every twenty seconds while it is
-- on screen; this is what it asks.
--
-- 1. kx_unread_counts() — one cheap round trip: how many notifications are
--    unread, and how many messages have arrived in my conversations since I
--    last read each of them. Both counted under the caller's own id, so the
--    function is safe to expose to every signed-in account.
--
-- 2. A notification for a new message. There was none: chat had no trigger,
--    so a message was invisible from every page but ข้อความ. One notification
--    per conversation while it stays unread — a second message before the
--    first was seen does not add a second bell — and it is marked read when
--    the conversation is opened (the app does that).

create or replace function kx_unread_counts()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'notifications', (
      select count(*) from notifications
       where profile_id = auth.uid() and not is_read
    ),
    'messages', (
      select count(*)
        from messages m
        join conversation_participants cp
          on cp.conversation_id = m.conversation_id
         and cp.profile_id = auth.uid()
       where m.sender_id <> auth.uid()
         and m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
    )
  );
$$;

revoke all on function kx_unread_counts() from public;
grant execute on function kx_unread_counts() to authenticated;


create or replace function kx_notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_who  text;
  v_post uuid;
  r      record;
begin
  select company_name into v_who from profiles where id = new.sender_id;
  select post_id into v_post from conversations where id = new.conversation_id;
  for r in
    select cp.profile_id
      from conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.profile_id <> new.sender_id
  loop
    -- one bell per conversation until it is read; actor_id + link_post_id
    -- identify the conversation the way kx_start_conversation finds it
    if exists (
      select 1 from notifications n
       where n.profile_id = r.profile_id
         and n.kind = 'new_message'
         and n.actor_id = new.sender_id
         and n.link_post_id is not distinct from v_post
         and not n.is_read
    ) then
      continue;
    end if;
    insert into notifications (profile_id, kind, body, link_post_id, actor_id)
    values (r.profile_id, 'new_message',
            coalesce(v_who, 'ผู้ใช้ QubeQuote') || ' ส่งข้อความถึงคุณ',
            v_post, new.sender_id);
  end loop;
  return null;
end; $$;

drop trigger if exists trg_notify_new_message on messages;
create trigger trg_notify_new_message after insert on messages
  for each row execute function kx_notify_new_message();


-- ============================================================================
-- Check it took
-- ============================================================================
--   select kx_unread_counts();                       -- {"notifications":0,"messages":0} for a fresh account
--   select tgname from pg_trigger where tgname = 'trg_notify_new_message';
