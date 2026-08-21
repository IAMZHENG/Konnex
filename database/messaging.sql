-- Messaging (ข้อความ) — makes the tables from schema.sql actually usable.
--
-- The three tables existed but nothing could use them:
--   * no INSERT policy on `conversations`          -> a chat could never be created
--   * no INSERT policy on `conversation_participants` -> nobody could be added to one
--   * participants SELECT was `profile_id = auth.uid()`, so you could only ever see
--     your OWN membership row — never who you were talking to
--
-- Run this once in the Supabase SQL editor (same place schema.sql was run).


-- Tracks how far each person has read, so the list can show unread state.
alter table conversation_participants
  add column if not exists last_read_at timestamptz;


-- A policy on conversation_participants that queries conversation_participants
-- recurses. SECURITY DEFINER runs the lookup with the function owner's rights,
-- which skips RLS inside it and breaks the cycle.
create or replace function kx_is_participant(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = cid and profile_id = auth.uid()
  );
$$;


-- Starting a chat has to create the conversation and both membership rows
-- together, so it is one function rather than three inserts guarded by three
-- policies. Doing it this way also means `conversations` and
-- `conversation_participants` need no INSERT policy at all — nothing may write
-- to them except through here.
--
-- Returns the existing conversation when these two already have one for this
-- post, so clicking "ส่งข้อความ" twice continues the thread instead of starting
-- a second one next to it.
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
  where c.post_id is not distinct from p_post_id
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into conversations (post_id) values (p_post_id) returning id into cid;
  insert into conversation_participants (conversation_id, profile_id)
    values (cid, me), (cid, other_id);
  return cid;
end;
$$;

grant execute on function kx_start_conversation(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

drop policy if exists "participants read their conversations" on conversations;
create policy "participants read their conversations" on conversations for select
  using (kx_is_participant(id));

-- Was `profile_id = auth.uid()`, which hid the other person. Now: everyone in
-- a conversation can see everyone in that conversation.
drop policy if exists "participants see their own membership rows" on conversation_participants;
drop policy if exists "participants see who is in their conversations" on conversation_participants;
create policy "participants see who is in their conversations" on conversation_participants for select
  using (kx_is_participant(conversation_id));

-- Only your own row, and only to move your own read marker.
drop policy if exists "participants update their own read marker" on conversation_participants;
create policy "participants update their own read marker" on conversation_participants for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "participants read messages in their conversations" on messages;
create policy "participants read messages in their conversations" on messages for select
  using (kx_is_participant(conversation_id));

drop policy if exists "participants send messages" on messages;
create policy "participants send messages" on messages for insert
  with check (sender_id = auth.uid() and kx_is_participant(conversation_id));
