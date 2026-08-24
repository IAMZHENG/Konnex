-- ผลงานที่ผ่านมา — the track record, written by the seller.
--
-- ผลงานสะสม used to be generated: it listed the RFQs this account had been
-- marked as winning. Konnex no longer picks winners, so that list can never
-- fill again, and the section it fed went dark.
--
-- Generating it was the wrong idea anyway. What a buyer wants to know is what
-- this supplier has actually done — for whom, of what, when — and most of that
-- happened before Konnex existed or outside it entirely. The platform cannot
-- know any of it. The seller can, so the seller writes it.
--
-- The honest consequence, and it should stay visible in the UI: this is a
-- claim, not a record. Unlike a won quote it is not evidence of anything. It
-- sits next to reviews and การยืนยันตัวตน, which are the parts a buyer can
-- actually lean on.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.


create table if not exists portfolio (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  title       text not null,             -- ขายอะไร / ทำอะไร
  buyer_name  text,                      -- ขายให้ใคร — free text, and optional:
                                         -- a customer name is often confidential
  detail      text,
  year        int,                       -- พ.ศ. or ค.ศ., whatever they type; not
                                         -- a date, because "2565" is the honest
                                         -- precision for work from years back
  image_url   text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists portfolio_profile_idx on portfolio (profile_id, sort, created_at desc);

alter table portfolio enable row level security;

-- A portfolio exists to be read by buyers deciding whether to ask for a quote.
drop policy if exists "portfolio is publicly readable" on portfolio;
create policy "portfolio is publicly readable" on portfolio for select using (true);

-- Yours to write, and only yours. `for all` covers insert/update/delete; the
-- with check half is what stops a row being created under someone else's id.
drop policy if exists "profiles manage their own portfolio" on portfolio;
create policy "profiles manage their own portfolio" on portfolio for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
