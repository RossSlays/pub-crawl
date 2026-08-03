-- Pub Crawl Schema

create table if not exists crawl (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Thames Pub Crawl',
  subtitle text,  -- eyebrow label shown above the crawl name, e.g. "Jack's 30th Birthday"
  date date not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'completed')),
  join_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  walking_speed_kmh numeric not null default 4.5,
  start_time time,
  created_at timestamptz not null default now()
);

create table if not exists pubs (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  name text not null,
  address text,
  lat numeric,
  lng numeric,
  order_index integer not null,
  planned_dwell_minutes integer not null default 45,
  status text not null default 'upcoming' check (status in ('upcoming', 'current', 'visited')),
  planned_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  actual_departure_at timestamptz,
  walking_minutes_to_next integer,  -- fixed walk time from this pub to the next
  created_at timestamptz not null default now()
);

create table if not exists live_location (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  updated_at timestamptz not null default now()
);

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  pub_id uuid not null references pubs(id) on delete cascade,
  participant_token text not null,
  score numeric not null check (score >= 0.5 and score <= 5 and (score * 2) = floor(score * 2)),
  comment text,
  created_at timestamptz not null default now(),
  unique(pub_id, participant_token)
);

-- Maps a participant_token cookie to a display name, so drinks/ratings can be
-- attributed to a name across devices (e.g. for the drinks leaderboard).
-- Email is used as a soft, unverified de-dup key: rejoining with the same
-- email (even from a different browser/device/incognito window) reuses the
-- same token instead of minting a new, disconnected identity.
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  token text not null unique,
  name text not null default 'Anonymous',
  email text,
  created_at timestamptz not null default now(),
  unique(crawl_id, email)
);

create table if not exists drinks (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  pub_id uuid not null references pubs(id) on delete cascade,
  participant_token text not null,
  beers numeric not null default 0,
  wine numeric not null default 0,
  cocktails integer not null default 0,
  shots integer not null default 0,
  soft_drinks numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(pub_id, participant_token)
);

-- RLS
alter table crawl enable row level security;
alter table pubs enable row level security;
alter table live_location enable row level security;
alter table ratings enable row level security;
alter table participants enable row level security;
alter table drinks enable row level security;

-- Public read access
create policy "public read crawl" on crawl for select using (true);
create policy "public read pubs" on pubs for select using (true);
create policy "public read location" on live_location for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read drinks" on drinks for select using (true);
create policy "public read ratings" on ratings for select using (true);

create table if not exists leaders (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  name text not null,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists leader_locations (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  leader_id uuid not null references leaders(id) on delete cascade,
  leader_name text not null,
  lat numeric not null,
  lng numeric not null,
  updated_at timestamptz not null default now(),
  unique(crawl_id, leader_id)
);

alter table leaders enable row level security;
alter table leader_locations enable row level security;

create policy "public read leaders" on leaders for select using (true);
create policy "public read leader_locations" on leader_locations for select using (true);

-- Service role (API routes) handles all writes via service key, bypasses RLS

-- Realtime
-- Broadcasts (admin → all participants)
create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references crawl(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table broadcasts enable row level security;
create policy "public read broadcasts" on broadcasts for select using (true);

alter publication supabase_realtime add table pubs;
alter publication supabase_realtime add table live_location;
alter publication supabase_realtime add table ratings;
alter publication supabase_realtime add table leader_locations;
alter publication supabase_realtime add table broadcasts;
alter publication supabase_realtime add table drinks;
