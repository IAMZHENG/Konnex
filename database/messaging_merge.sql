-- One conversation per person, not per post.
--
-- messaging.sql keyed a conversation to (both people + the post), so talking to
-- the same supplier about two machines produced two threads. The decision was
-- to merge: one thread per person, the way LINE works.
--
-- The topic doesn't disappear, it moves down a level. `messages.post_id`
-- records which announcement each message was sent from, and the chat draws a
-- "เกี่ยวกับ: …" divider whenever that changes — so a message like
-- "ลดได้อีก 5%" still has something saying which machine it was about.
--
-- Safe to run more than once.
--
-- Run this in the Supabase SQL editor, after messaging.sql.


-- ---------------------------------------------------------------------------
-- 1. topic moves from the conversation onto each message
-- ---------------------------------------------------------------------------
alter table messages
  add column if not exists post_id uuid references posts(id) on delete set null;

-- existing messages inherit the topic of the conversation they were sent in
update messages m
set post_id = c.post_id
from conversations c
where m.conversation_id = c.id
  and m.post_id is null
  and c.post_id is not null;


-- ---------------------------------------------------------------------------
-- 2. merge conversations that have the same set of people
--
-- The oldest one wins so the thread keeps its original start date. Members are
-- compared as a sorted array, which makes this work for any size of
-- conversation, not just pairs.
-- ---------------------------------------------------------------------------
with member_sets as (
  select c.id as conv_id,
         c.created_at,
         (select array_agg(cp.profile_id order by cp.profile_id)
          from conversation_participants cp
          where cp.conversation_id = c.id) as members
  from conversations c
),
keepers as (
  select members, (array_agg(conv_id order by created_at))[1] as keep_id
  from member_sets
  where members is not null
  group by members
)
update messages m
set conversation_id = k.keep_id
from member_sets ms
join keepers k on k.members = ms.members
where m.conversation_id = ms.conv_id
  and ms.conv_id <> k.keep_id;

-- the now-empty duplicates go; their participant rows cascade
with member_sets as (
  select c.id as conv_id,
         c.created_at,
         (select array_agg(cp.profile_id order by cp.profile_id)
          from conversation_participants cp
          where cp.conversation_id = c.id) as members
  from conversations c
),
keepers as (
  select members, (array_agg(conv_id order by created_at))[1] as keep_id
  from member_sets
  where members is not null
  group by members
)
delete from conversations c
using member_sets ms
join keepers k on k.members = ms.members
where c.id = ms.conv_id
  and ms.conv_id <> k.keep_id;

-- a merged thread is not about one post any more; the topic lives on the
-- messages now, and leaving this set would just be a stale second answer
update conversations set post_id = null where post_id is not null;


-- ---------------------------------------------------------------------------
-- 3. starting a chat no longer keys on the post
--
-- Same signature — the client still passes the post it started from — but the
-- post is only used to tag the messages that follow, never to pick or create a
-- separate thread.
-- ---------------------------------------------------------------------------
create or replace function kx_start_conversation(other_id uuid, p_post_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  me  uuid := auth.uid();
begin
  if me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if other_id = me then
    raise exception 'ไม่สามารถส่งข้อความหาตัวเองได้';
  end if;
  if not exists (select 1 from profiles where id = other_id) then
    raise exception 'ไม่พบผู้ใช้ปลายทาง';
  end if;

  select c.id into cid
  from conversations c
  join conversation_participants a on a.conversation_id = c.id and a.profile_id = me
  join conversation_participants b on b.conversation_id = c.id and b.profile_id = other_id
  order by c.created_at
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into conversations default values returning id into cid;
  insert into conversation_participants (conversation_id, profile_id)
    values (cid, me), (cid, other_id);
  return cid;
end;
$$;

grant execute on function kx_start_conversation(uuid, uuid) to authenticated;
