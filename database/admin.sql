-- หน้าผู้ดูแลระบบ — ปิด/ลบประกาศ ระงับบัญชี และสถิติ
--
-- หลักการเดียวที่ทั้งไฟล์นี้ยึด: ปุ่มในหน้าเว็บไม่ใช่การควบคุม
--
-- คีย์ที่หน้าเว็บใช้เป็นคีย์สาธารณะ ใครเปิดดูโค้ดก็เห็น และเรียก API ตรงได้
-- โดยไม่ผ่านหน้าจอของเราเลย การซ่อนปุ่มจึงเป็นแค่การจัดหน้า สิ่งที่บังคับจริงคือ
-- นโยบาย RLS กับฟังก์ชันในไฟล์นี้ ถ้าไม่รันไฟล์นี้ ปุ่มระงับบัญชีก็เป็นเพียง
-- เครื่องประดับ
--
-- อำนาจของแอดมินให้ผ่าน "ฟังก์ชันแคบๆ" ไม่ใช่ "นโยบายกว้างๆ" โดยตั้งใจ
-- ถ้าเปิด policy ให้แอดมิน update ตาราง profiles ได้ทั้งตาราง แอดมินก็แก้ชื่อ
-- บริษัทคนอื่นได้ด้วย ทั้งที่เราต้องการแค่ให้กดระงับบัญชีได้ ฟังก์ชันด้านล่าง
-- แต่ละตัวทำได้อย่างเดียวจริงๆ ตามชื่อของมัน
--
-- ต้องรัน database/verification_review.sql มาก่อน (ไฟล์นั้นสร้าง is_admin และ
-- kx_is_admin) รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor รันซ้ำได้

-- ---------------------------------------------------------------------------
-- 1. บัญชีที่ถูกระงับ
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists suspended_at timestamptz;

-- ระงับแล้วยังเข้ามาดูได้ แต่เขียนอะไรใหม่ไม่ได้ ตั้งใจให้เป็นแบบนี้ — คนที่ถูก
-- ระงับควรเห็นสิ่งที่ตัวเองเคยทำไว้และหาทางติดต่อกลับได้ ไม่ใช่เจอประตูปิดเงียบ
create or replace function kx_is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select suspended_at is not null from profiles where id = auth.uid()), false);
$$;

revoke all on function kx_is_suspended() from public;
grant execute on function kx_is_suspended() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. ปิดทางเขียนของบัญชีที่ถูกระงับ
-- ---------------------------------------------------------------------------

-- posts: เดิมเป็น policy เดียว `for all` ซึ่งครอบ select ด้วย แยกออกเป็นคำสั่ง
-- ละ policy เพื่อไม่ให้การระงับไปปิดการ "มองเห็น" ประกาศของตัวเองไปด้วย
drop policy if exists "owners manage their own posts" on posts;

drop policy if exists "owners create their own posts" on posts;
create policy "owners create their own posts" on posts for insert
  with check (owner_id = auth.uid() and not kx_is_suspended());

drop policy if exists "owners edit their own posts" on posts;
create policy "owners edit their own posts" on posts for update
  using (owner_id = auth.uid() and not kx_is_suspended())
  with check (owner_id = auth.uid());

-- ลบยังทำได้แม้ถูกระงับ การเอาของตัวเองออกไม่ใช่การสร้างภาระให้ใคร
drop policy if exists "owners delete their own posts" on posts;
create policy "owners delete their own posts" on posts for delete
  using (owner_id = auth.uid());

drop policy if exists "bidders create their own quotes" on quotes;
create policy "bidders create their own quotes" on quotes for insert
  with check (
    bidder_id = auth.uid()
    and not kx_is_suspended()
    and exists (
      select 1 from posts p
      where p.id = post_id
        and p.owner_id <> auth.uid()
        and p.status = 'open'
        and (p.deadline is null or p.deadline > now())
    )
  );

drop policy if exists "buyers create their own requests" on quote_requests;
create policy "buyers create their own requests" on quote_requests for insert
  with check (
    requester_id = auth.uid()
    and not kx_is_suspended()
    and exists (
      select 1 from posts p
      where p.id = post_id
        and p.owner_id <> auth.uid()
        and p.status = 'open'
    )
  );

drop policy if exists "participants send messages" on messages;
create policy "participants send messages" on messages for insert
  with check (
    sender_id = auth.uid()
    and not kx_is_suspended()
    and kx_is_participant(conversation_id)
  );

drop policy if exists "signed in users ask questions" on post_questions;
create policy "signed in users ask questions" on post_questions for insert
  with check (
    asker_id = auth.uid()
    and not kx_is_suspended()
    and exists (select 1 from posts p where p.id = post_id and p.status = 'open')
  );

-- แจ้งปัญหายังส่งได้ตอนถูกระงับ โดยตั้งใจ — ถ้าถูกระงับผิดคน นั่นคือช่องทาง
-- เดียวที่เขาเหลืออยู่

-- ---------------------------------------------------------------------------
-- 3. แอดมินเห็นประกาศที่ไม่ได้เปิดอยู่ด้วย
-- ---------------------------------------------------------------------------
drop policy if exists "open posts are public" on posts;
create policy "open posts are public" on posts for select
  using (
    status = 'open'
    or owner_id = auth.uid()
    or kx_involved_in_post(id)
    or kx_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 4. อำนาจของแอดมิน — ฟังก์ชันแคบๆ อย่างละอย่าง
-- ---------------------------------------------------------------------------

-- ปิดหรือเปิดประกาศ แก้เนื้อหาไม่ได้
create or replace function kx_admin_set_post_status(p_post uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not kx_is_admin() then
    raise exception 'ต้องเป็นผู้ดูแลระบบ' using errcode = '42501';
  end if;
  if p_status not in ('open','paused','closed') then
    raise exception 'สถานะไม่ถูกต้อง' using errcode = '22023';
  end if;
  update posts set status = p_status where id = p_post;
end;
$$;

-- ลบประกาศถาวร ทุกอย่างที่ผูกกับมันจะ cascade ตามไป
create or replace function kx_admin_delete_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not kx_is_admin() then
    raise exception 'ต้องเป็นผู้ดูแลระบบ' using errcode = '42501';
  end if;
  delete from posts where id = p_post;
end;
$$;

-- ระงับหรือปลดระงับบัญชี แตะได้คอลัมน์เดียวคือ suspended_at
create or replace function kx_admin_set_suspended(p_profile uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not kx_is_admin() then
    raise exception 'ต้องเป็นผู้ดูแลระบบ' using errcode = '42501';
  end if;
  -- แอดมินระงับตัวเองไม่ได้ กันไม่ให้เผลอล็อกตัวเองออกจากเครื่องมือเดียวที่
  -- ใช้ปลดระงับได้
  if p_profile = auth.uid() then
    raise exception 'ระงับบัญชีตัวเองไม่ได้' using errcode = '22023';
  end if;
  update profiles
     set suspended_at = case when p_on then now() else null end
   where id = p_profile;
end;
$$;

-- สถิติหน้าแอดมิน นับอย่างเดียว ไม่คืนแถวของใคร
create or replace function kx_admin_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v json;
begin
  if not kx_is_admin() then
    raise exception 'ต้องเป็นผู้ดูแลระบบ' using errcode = '42501';
  end if;
  select json_build_object(
    'profiles',        (select count(*) from profiles),
    'profiles_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'suspended',       (select count(*) from profiles where suspended_at is not null),
    'posts',           (select count(*) from posts),
    'posts_open',      (select count(*) from posts where status = 'open'),
    'posts_7d',        (select count(*) from posts where created_at > now() - interval '7 days'),
    'quotes',          (select count(*) from quotes),
    'quotes_7d',       (select count(*) from quotes where created_at > now() - interval '7 days'),
    'feedback_total',  (select count(*) from feedback),
    'feedback_7d',     (select count(*) from feedback where created_at > now() - interval '7 days')
  ) into v;
  return v;
end;
$$;

revoke all on function kx_admin_set_post_status(uuid, text) from public;
revoke all on function kx_admin_delete_post(uuid)           from public;
revoke all on function kx_admin_set_suspended(uuid, boolean) from public;
revoke all on function kx_admin_stats()                      from public;
grant execute on function kx_admin_set_post_status(uuid, text)  to authenticated;
grant execute on function kx_admin_delete_post(uuid)            to authenticated;
grant execute on function kx_admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function kx_admin_stats()                      to authenticated;

-- ตรวจว่าสำเร็จ:
--
--   select suspended_at from profiles limit 1;        -- คอลัมน์มีแล้ว
--   select kx_admin_stats();                          -- ได้ json ถ้าคุณเป็นแอดมิน
--
-- ตั้งตัวเองเป็นแอดมิน (ถ้ายังไม่ได้ทำตอนรัน verification_review.sql):
--
--   update profiles p set is_admin = true
--     from auth.users u where u.id = p.id and u.email = 'อีเมลของคุณ';
