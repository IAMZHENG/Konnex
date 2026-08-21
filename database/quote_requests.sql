-- ขอใบเสนอราคา — a buyer asking the seller of an Offer for a price.
--
-- This is the mirror of `quotes`, not the same thing. On an RFQ a supplier
-- sends a price to the buyer, and `quotes.price` is NOT NULL because a bid
-- without a price is meaningless. Here the buyer sends a *requirement* and has
-- no price at all — the price is what they are waiting for. Squeezing that
-- into `quotes` would mean a nullable price on the bidding table and two
-- meanings for one row, so it gets its own.
--
-- Run this once in the Supabase SQL editor (same place schema.sql was run).

create table if not exists quote_requests (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  requester_id  uuid not null references profiles(id) on delete cascade,
  quantity      text not null,
  budget        numeric,
  needed_by     date,
  detail        text not null,
  -- filled in by the seller when they answer
  quoted_price  numeric,
  seller_note   text,
  answered_at   timestamptz,
  status        text not null default 'waiting'
                  check (status in ('waiting','received','declined')),
  created_at    timestamptz not null default now()
);

create index if not exists quote_requests_post_idx      on quote_requests (post_id, created_at desc);
create index if not exists quote_requests_requester_idx on quote_requests (requester_id, created_at desc);

create table if not exists quote_request_files (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references quote_requests(id) on delete cascade,
  file_name  text not null,
  file_url   text not null,
  file_kind  text not null default 'doc',
  file_size  bigint
);

alter table quote_requests      enable row level security;
alter table quote_request_files enable row level security;


-- Visible to the two people it concerns and nobody else: whoever asked, and
-- the owner of the post they asked about. A quote request names what a company
-- is buying and what they will pay for it, which is not public the way a
-- question on a listing is.
drop policy if exists "requests visible to requester and seller" on quote_requests;
create policy "requests visible to requester and seller" on quote_requests for select
  using (
    requester_id = auth.uid()
    or exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid())
  );

-- Ask as yourself, on someone else's post, while it is still open.
drop policy if exists "buyers create their own requests" on quote_requests;
create policy "buyers create their own requests" on quote_requests for insert
  with check (
    requester_id = auth.uid()
    and exists (
      select 1 from posts p
      where p.id = post_id
        and p.owner_id <> auth.uid()
        and p.status = 'open'
    )
  );

-- Only the seller answers.
drop policy if exists "sellers answer requests" on quote_requests;
create policy "sellers answer requests" on quote_requests for update
  using (exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid()));


drop policy if exists "request files follow the request" on quote_request_files;
create policy "request files follow the request" on quote_request_files for select
  using (exists (
    select 1 from quote_requests r
    where r.id = request_id
      and (r.requester_id = auth.uid()
        or exists (select 1 from posts p where p.id = r.post_id and p.owner_id = auth.uid()))
  ));

drop policy if exists "requesters attach their own files" on quote_request_files;
create policy "requesters attach their own files" on quote_request_files for insert
  with check (exists (
    select 1 from quote_requests r
    where r.id = request_id and r.requester_id = auth.uid()
  ));
