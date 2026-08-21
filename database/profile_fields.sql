-- The rest of the profile, so it is the same profile everyone sees.
--
-- Everything on แก้ไขโปรไฟล์ except the avatar lived in this browser's
-- localStorage, which means the profile you filled in was visible to exactly
-- one person: you. Anyone opening your company page got the row from
-- `profiles`, which had almost none of it.
--
-- These are the fields the edit page already collects and the table had
-- nowhere to put.
--
-- `industry` is separate from `business_type` on purpose: business_type is set
-- at signup and is 'person' or 'company', which the whole app branches on.
-- The profile page's ประเภทธุรกิจ is a different thing entirely (ผู้ผลิต /
-- ผู้จัดจำหน่าย / ผู้รับเหมา …) and would have collided with it.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

alter table profiles
  add column if not exists tagline    text,
  add column if not exists industry   text,
  add column if not exists capital    text,
  add column if not exists email      text,
  add column if not exists website    text,
  add column if not exists hours      text,
  add column if not exists address    text,
  add column if not exists occupation text,
  add column if not exists experience text,
  add column if not exists skills     text[] not null default '{}',
  add column if not exists areas      text[] not null default '{}',
  -- [{ "name": "ISO 9001:2015", "desc": "Quality Management" }, …]
  add column if not exists certs      jsonb  not null default '[]'::jsonb;

-- The existing policies already cover these: profiles are publicly readable,
-- and only the owner may update their own row. Nothing to add.
