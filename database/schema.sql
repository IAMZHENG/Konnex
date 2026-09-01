-- ============================================================================
-- QubeQuote — database schema (Postgres, written for Supabase)
-- ============================================================================
-- What this covers: the marketplace loop the prototype already has UI for —
-- companies/profiles, RFQ posts (ต้องการซื้อ), Offer posts (ประกาศขาย), quotes/bids,
-- messages, notifications, saved items, reviews, services, ผลงานสะสม, and the
-- interest-tracking events the feed ranking algorithm reads (kx.interest today
-- lives in localStorage — this table is where it moves to).
--
-- What this does NOT cover yet: payments, file storage buckets (use Supabase
-- Storage separately — see SETUP.md), and anything the prototype itself never
-- built (see README.md "Known wrinkles").
--
-- Run this once, top to bottom, in the Supabase SQL Editor on a fresh project.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, extending Supabase's own
-- auth.users. Supabase Auth handles email/password and OAuth; this table is
-- everything the app itself needs to know about the person.
-- ---------------------------------------------------------------------------
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  company_name    text not null,
  contact_name    text,
  phone           text,
  province        text,
  business_type   text,
  founded_year    int,
  employees       text,
  tax_id          text,
  is_verified     boolean not null default false,
  avatar_url      text,
  cover_url       text,
  about           text,
  rating_avg      numeric(2,1) not null default 0,
  rating_count    int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories — the six hardcoded FEED_CATS become a real table so new ones
-- don't need a code change.
-- ---------------------------------------------------------------------------
create table categories (
  id    text primary key,   -- 'mfg' | 'const' | 'logi' | 'it' | 'design' | 'other'
  label text not null
);
insert into categories (id, label) values
  ('mfg','งานผลิต & เครื่องจักร'),
  ('const','ก่อสร้าง & รับเหมา'),
  ('logi','ขนส่ง & โลจิสติกส์'),
  ('it','ไอที & ซอฟต์แวร์'),
  ('design','ออกแบบ & สื่อสาร'),
  ('other','บริการอื่นๆ');

-- ---------------------------------------------------------------------------
-- posts — RFQ (ต้องการซื้อ) and Offer (ประกาศขาย) share one table with a
-- `kind` column, because the feed already renders them as one list of cards.
-- ---------------------------------------------------------------------------
create table posts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  kind            text not null check (kind in ('rfq','offer')),
  title           text not null,
  description     text not null,
  category_id     text not null references categories(id),
  province        text not null,
  price_low       numeric,          -- RFQ: budget min. Offer: not used.
  price_high      numeric,          -- RFQ: budget max. Offer: the listed price.
  bid_type        text check (bid_type in ('sealed','open')),  -- RFQ only
  status          text not null default 'open'
                    check (status in ('open','paused','closed')),
  deadline        timestamptz,      -- RFQ: วันสิ้นสุดการรับข้อเสนอ
  view_count      int not null default 0,
  created_at      timestamptz not null default now()
);
create index posts_feed_idx on posts (status, created_at desc);
create index posts_owner_idx on posts (owner_id);
create index posts_category_idx on posts (category_id, province);

create table post_images (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid not null references posts(id) on delete cascade,
  url      text not null,
  sort     int not null default 0
);
create index post_images_post_idx on post_images (post_id, sort);

create table post_attachments (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references posts(id) on delete cascade,
  file_name text not null,
  file_url  text not null,
  file_kind text not null default 'doc' check (file_kind in ('pdf','doc','xls','dwg')),
  file_size bigint
);

-- ---------------------------------------------------------------------------
-- quotes — a bid on an RFQ, or a price request on an Offer. Same shape either
-- way: someone responding to someone else's post with a number.
-- ---------------------------------------------------------------------------
create table quotes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  bidder_id   uuid not null references profiles(id) on delete cascade,
  price       numeric not null,
  note        text,
  status      text not null default 'pending'
                check (status in ('pending','won','lost')),
  created_at  timestamptz not null default now(),
  unique (post_id, bidder_id)   -- one active quote per bidder per post
);
create index quotes_post_idx on quotes (post_id);
create index quotes_bidder_idx on quotes (bidder_id);

create table quote_attachments (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references quotes(id) on delete cascade,
  file_name text not null,
  file_url  text not null,
  file_kind text not null default 'doc',
  file_size bigint
);

-- ---------------------------------------------------------------------------
-- messaging
-- ---------------------------------------------------------------------------
create table conversations (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references posts(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,
  body            text,
  file_name       text,
  file_url        text,
  file_size       bigint,
  created_at      timestamptz not null default now()
);
create index messages_conv_idx on messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- notifications, saved items, browsing history
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        text not null,        -- 'new_quote' | 'message' | 'status_change' ...
  body        text not null,
  link_post_id uuid references posts(id) on delete set null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_profile_idx on notifications (profile_id, is_read, created_at desc);

create table saved_posts (
  profile_id  uuid not null references profiles(id) on delete cascade,
  post_id     uuid not null references posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, post_id)
);

create table view_history (
  profile_id  uuid not null references profiles(id) on delete cascade,
  post_id     uuid not null references posts(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  primary key (profile_id, post_id)
);

-- ---------------------------------------------------------------------------
-- reviews, ผลงานสะสม, services (บริการของฉัน)
-- ---------------------------------------------------------------------------
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  reviewer_id   uuid not null references profiles(id) on delete cascade,
  reviewee_id   uuid not null references profiles(id) on delete cascade,
  rating        int not null check (rating between 1 and 5),
  body          text,
  created_at    timestamptz not null default now()
);

create table services (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  title       text not null,
  description text,
  image_url   text,
  sort        int not null default 0
);

-- ---------------------------------------------------------------------------
-- interest_events — what the feed ranking algorithm learns from. Mirrors the
-- kx.interest logic already shipped client-side: view=1, save=3, message=5,
-- quote=8, search=2, decayed with a 21-day half-life at read time.
-- ---------------------------------------------------------------------------
create table interest_events (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  category_id text not null references categories(id),
  action      text not null check (action in ('view','save','message','quote','search')),
  weight      numeric not null,
  created_at  timestamptz not null default now()
);
create index interest_events_profile_idx on interest_events (profile_id, created_at desc);

-- ============================================================================
-- Row Level Security — every table above is locked down by default the
-- moment RLS is enabled. These policies say: read what's public, write only
-- your own rows.
-- ============================================================================
alter table profiles              enable row level security;
alter table posts                 enable row level security;
alter table post_images           enable row level security;
alter table post_attachments      enable row level security;
alter table quotes                enable row level security;
alter table quote_attachments     enable row level security;
alter table conversations         enable row level security;
alter table conversation_participants enable row level security;
alter table messages              enable row level security;
alter table notifications         enable row level security;
alter table saved_posts           enable row level security;
alter table view_history          enable row level security;
alter table reviews               enable row level security;
alter table services              enable row level security;
alter table interest_events       enable row level security;

-- profiles: anyone can read (it's a public company directory); only the
-- owner can edit their own row.
create policy "profiles are publicly readable" on profiles for select using (true);
create policy "users edit their own profile"   on profiles for update using (auth.uid() = id);
create policy "users insert their own profile" on profiles for insert with check (auth.uid() = id);

-- posts: open ones are public; a post's owner can also see and edit their own
-- closed/paused ones.
create policy "open posts are public" on posts for select
  using (status = 'open' or owner_id = auth.uid());
create policy "owners manage their own posts" on posts for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "images follow their post" on post_images for select
  using (exists (select 1 from posts p where p.id = post_id and (p.status = 'open' or p.owner_id = auth.uid())));
create policy "owners manage their post images" on post_images for insert
  with check (exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid()));
create policy "owners delete their post images" on post_images for delete
  using (exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid()));

create policy "attachments follow their post" on post_attachments for select
  using (exists (select 1 from posts p where p.id = post_id and (p.status = 'open' or p.owner_id = auth.uid())));
create policy "owners manage their post attachments" on post_attachments for insert
  with check (exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid()));

-- quotes: visible to the bidder and to the post's owner — nobody else, which
-- is the sealed-bid rule the RFQ page already promises.
create policy "quotes visible to bidder and post owner" on quotes for select
  using (bidder_id = auth.uid()
      or exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid()));
create policy "bidders create their own quotes" on quotes for insert
  with check (bidder_id = auth.uid());
create policy "post owners update quote status" on quotes for update
  using (exists (select 1 from posts p where p.id = post_id and p.owner_id = auth.uid())
      or bidder_id = auth.uid());

create policy "quote attachments follow the quote" on quote_attachments for select
  using (exists (select 1 from quotes q
                 where q.id = quote_id
                   and (q.bidder_id = auth.uid()
                     or exists (select 1 from posts p where p.id = q.post_id and p.owner_id = auth.uid()))));
create policy "bidders attach files to their own quote" on quote_attachments for insert
  with check (exists (select 1 from quotes q where q.id = quote_id and q.bidder_id = auth.uid()));

-- messaging: only participants in a conversation can read or write it
create policy "participants read their conversations" on conversations for select
  using (exists (select 1 from conversation_participants cp
                 where cp.conversation_id = id and cp.profile_id = auth.uid()));
create policy "participants see their own membership rows" on conversation_participants for select
  using (profile_id = auth.uid());
create policy "participants read messages in their conversations" on messages for select
  using (exists (select 1 from conversation_participants cp
                 where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()));
create policy "participants send messages" on messages for insert
  with check (sender_id = auth.uid()
    and exists (select 1 from conversation_participants cp
                where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()));

-- notifications, saved items, history, interest: strictly your own
create policy "own notifications only" on notifications for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "own saved posts only" on saved_posts for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "own view history only" on view_history for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "own interest events only" on interest_events for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- reviews: publicly readable (it's social proof), only the reviewer can write
create policy "reviews are publicly readable" on reviews for select using (true);
create policy "reviewers write their own reviews" on reviews for insert
  with check (reviewer_id = auth.uid());

-- services: publicly readable, only the owning profile can manage them
create policy "services are publicly readable" on services for select using (true);
create policy "profiles manage their own services" on services for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- categories: reference data, world-readable, nobody writes it from the app
alter table categories enable row level security;
create policy "categories are publicly readable" on categories for select using (true);
