-- Hobita off-chain layer.
--
-- The chain is the source of truth for money and circle rules. Supabase holds
-- names, profile data, and a human-readable activity feed derived from chain
-- state. Writes go through server routes using the service role key; the
-- browser only reads (and subscribes to Realtime on activity).

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet text unique not null,
  display_name text,
  avatar_url text,
  preferred_currency text not null default 'USD',
  voice_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.circles (
  address text primary key,
  name text,
  description text,
  creator_wallet text not null,
  token_mint text,
  contribution bigint not null default 0,
  period_seconds bigint not null default 0,
  max_members int not null default 0,
  status text not null default 'open',
  current_round int not null default 0,
  invite_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_address text not null references public.circles(address) on delete cascade,
  wallet text not null,
  slot int not null,
  collateral bigint not null default 0,
  collateral_remaining bigint not null default 0,
  paid_rounds int not null default 0,
  covered_rounds int not null default 0,
  received_payout boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (circle_address, wallet)
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  circle_address text not null references public.circles(address) on delete cascade,
  wallet text not null default '',
  kind text not null,
  round int not null default 0,
  amount bigint,
  message text not null,
  created_at timestamptz not null default now(),
  unique (circle_address, kind, wallet, round)
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  wallet text not null,
  circle_address text,
  type text not null,
  message text not null,
  audio_url text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists activity_circle_created_idx
  on public.activity (circle_address, created_at desc);
create index if not exists notifications_wallet_created_idx
  on public.notifications (wallet, created_at desc);

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "public read profiles" on public.profiles;
create policy "public read profiles" on public.profiles for select using (true);

drop policy if exists "public read circles" on public.circles;
create policy "public read circles" on public.circles for select using (true);

drop policy if exists "public read members" on public.circle_members;
create policy "public read members" on public.circle_members for select using (true);

drop policy if exists "public read activity" on public.activity;
create policy "public read activity" on public.activity for select using (true);

drop policy if exists "public read notifications" on public.notifications;
create policy "public read notifications" on public.notifications for select using (true);

-- The service role bypasses RLS. No insert/update/delete policies are defined,
-- so the anon key cannot write.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.activity;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
