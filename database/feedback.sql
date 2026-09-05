-- feedback — แจ้งปัญหา / เสนอแนะ จากผู้ใช้
--
-- ทำไมเก็บเป็นตาราง ไม่ใช่ mailto:
--
-- ปุ่มที่เปิดโปรแกรมเมลของเครื่องได้ผลก็ต่อเมื่อเครื่องนั้นตั้งโปรแกรมเมลไว้
-- ซึ่งเดสก์ท็อปจำนวนมากไม่ได้ตั้ง กดแล้วไม่มีอะไรเกิดขึ้นเลย และเราจะไม่มีวัน
-- รู้ว่ามีคนพยายามแจ้งแล้วแจ้งไม่ได้ ตารางเก็บทุกฉบับที่ถูกส่ง และค้นย้อนหลังได้
--
-- เป็นตารางเขียนอย่างเดียวเหมือน policy_acceptances — มีนโยบาย select กับ insert
-- และตั้งใจไม่มี update กับ delete ภายใต้ RLS ของ Postgres การไม่ประกาศนโยบาย
-- แปลว่าปฏิเสธ คำติชมที่ถูกแก้ทีหลังได้ก็ไม่ใช่บันทึกของสิ่งที่คนนั้นพูด
--
-- รันครั้งเดียวใน Supabase SQL editor รันซ้ำได้

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  -- 'problem' = แจ้งปัญหา, 'idea' = ข้อเสนอแนะ
  kind        text not null check (kind in ('problem','idea')),
  body        text not null,
  -- หน้าที่กดส่งมา ช่วยให้ตามรอยปัญหาได้โดยไม่ต้องถามกลับ
  page        text,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_recent_idx on feedback (created_at desc);
create index if not exists feedback_profile_idx on feedback (profile_id, created_at desc);

alter table feedback enable row level security;

-- เจ้าตัวเห็นของตัวเอง แอดมินเห็นทั้งหมด
drop policy if exists "read own feedback" on feedback;
create policy "read own feedback" on feedback
  for select using (profile_id = auth.uid() or kx_is_admin());

-- เขียนได้เฉพาะในนามตัวเอง
drop policy if exists "write own feedback" on feedback;
create policy "write own feedback" on feedback
  for insert with check (profile_id = auth.uid());

-- ไม่มีนโยบาย update และ delete โดยตั้งใจ

-- อ่านคำติชมทั้งหมด (ต้องเป็นแอดมิน หรือรันจาก SQL editor ซึ่งข้าม RLS):
--
--   select f.created_at, f.kind, f.page, f.body,
--          coalesce(p.company_name, '(ไม่ได้กรอกชื่อ)') as ผู้ส่ง
--     from feedback f join profiles p on p.id = f.profile_id
--    order by f.created_at desc;
