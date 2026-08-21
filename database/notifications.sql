-- แจ้งเตือน — created by the database, not by the browser.
--
-- A notification is always *for someone else*: you bid, the post's owner gets
-- told. The policy on `notifications` is `profile_id = auth.uid()` both ways,
-- so a client cannot write one for another person — correctly, or anyone could
-- forge notifications for anyone. Loosening it to make the app able to write
-- them would be the wrong trade.
--
-- So they are raised by triggers on the events themselves. That also means a
-- notification cannot be missed by a client that crashed, went offline, or
-- simply wasn't the one that caused the event.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- Deliberately NOT covered: chat messages. The messages page already carries
-- its own unread count per conversation, and one notification per message
-- would bury everything else here.


-- ---------------------------------------------------------------------------
-- helper
-- ---------------------------------------------------------------------------
create or replace function kx_notify(p_profile uuid, p_kind text, p_body text, p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- never notify someone about their own action, and never write a row with no
  -- recipient (the post or profile may have been deleted)
  if p_profile is null or p_profile = auth.uid() then
    return;
  end if;
  insert into notifications (profile_id, kind, body, link_post_id)
  values (p_profile, p_kind, p_body, p_post);
end;
$$;


-- ---------------------------------------------------------------------------
-- someone bid on your RFQ
-- ---------------------------------------------------------------------------
create or replace function kx_notify_new_quote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title text; v_who text;
begin
  select p.owner_id, p.title into v_owner, v_title from posts p where p.id = new.post_id;
  select company_name into v_who from profiles where id = new.bidder_id;
  perform kx_notify(v_owner, 'new_quote',
    coalesce(v_who, 'ผู้ให้บริการ') || ' เสนอราคาสำหรับ "' || coalesce(v_title, 'ประกาศของคุณ') || '"',
    new.post_id);
  return null;
end; $$;

drop trigger if exists trg_notify_new_quote on quotes;
create trigger trg_notify_new_quote after insert on quotes
  for each row execute function kx_notify_new_quote();


-- ---------------------------------------------------------------------------
-- your bid won or lost
-- ---------------------------------------------------------------------------
create or replace function kx_notify_quote_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.status is distinct from old.status and new.status in ('won','lost') then
    select p.title into v_title from posts p where p.id = new.post_id;
    perform kx_notify(new.bidder_id,
      case when new.status = 'won' then 'quote_won' else 'quote_lost' end,
      case when new.status = 'won'
           then 'ยินดีด้วย! คุณได้รับเลือกสำหรับงาน "' || coalesce(v_title,'ประกาศ') || '"'
           else 'งาน "' || coalesce(v_title,'ประกาศ') || '" เลือกผู้ให้บริการรายอื่นแล้ว' end,
      new.post_id);
  end if;
  return null;
end; $$;

drop trigger if exists trg_notify_quote_result on quotes;
create trigger trg_notify_quote_result after update on quotes
  for each row execute function kx_notify_quote_result();


-- ---------------------------------------------------------------------------
-- someone asked you for a quote (Offer)
-- ---------------------------------------------------------------------------
create or replace function kx_notify_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title text; v_who text;
begin
  select p.owner_id, p.title into v_owner, v_title from posts p where p.id = new.post_id;
  select company_name into v_who from profiles where id = new.requester_id;
  perform kx_notify(v_owner, 'new_request',
    coalesce(v_who, 'ผู้ซื้อ') || ' ขอใบเสนอราคาสำหรับ "' || coalesce(v_title, 'ประกาศของคุณ') || '"',
    new.post_id);
  return null;
end; $$;

drop trigger if exists trg_notify_new_request on quote_requests;
create trigger trg_notify_new_request after insert on quote_requests
  for each row execute function kx_notify_new_request();


-- ---------------------------------------------------------------------------
-- the seller answered your request with a price
-- ---------------------------------------------------------------------------
create or replace function kx_notify_request_answered()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text; v_who text;
begin
  if new.status = 'received' and old.status is distinct from 'received' then
    select p.title, pr.company_name into v_title, v_who
    from posts p left join profiles pr on pr.id = p.owner_id
    where p.id = new.post_id;
    perform kx_notify(new.requester_id, 'request_answered',
      coalesce(v_who, 'ผู้ขาย') || ' ส่งใบเสนอราคาสำหรับ "' || coalesce(v_title, 'ประกาศ') || '" แล้ว',
      new.post_id);
  end if;
  return null;
end; $$;

drop trigger if exists trg_notify_request_answered on quote_requests;
create trigger trg_notify_request_answered after update on quote_requests
  for each row execute function kx_notify_request_answered();


-- ---------------------------------------------------------------------------
-- a question on your post, and its answer
-- ---------------------------------------------------------------------------
create or replace function kx_notify_new_question()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title text;
begin
  select p.owner_id, p.title into v_owner, v_title from posts p where p.id = new.post_id;
  perform kx_notify(v_owner, 'new_question',
    'มีคำถามใหม่เกี่ยวกับ "' || coalesce(v_title, 'ประกาศของคุณ') || '"', new.post_id);
  return null;
end; $$;

drop trigger if exists trg_notify_new_question on post_questions;
create trigger trg_notify_new_question after insert on post_questions
  for each row execute function kx_notify_new_question();

create or replace function kx_notify_question_answered()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.answer is not null and old.answer is null then
    select p.title into v_title from posts p where p.id = new.post_id;
    perform kx_notify(new.asker_id, 'question_answered',
      'เจ้าของประกาศตอบคำถามของคุณเกี่ยวกับ "' || coalesce(v_title, 'ประกาศ') || '" แล้ว',
      new.post_id);
  end if;
  return null;
end; $$;

drop trigger if exists trg_notify_question_answered on post_questions;
create trigger trg_notify_question_answered after update on post_questions
  for each row execute function kx_notify_question_answered();
