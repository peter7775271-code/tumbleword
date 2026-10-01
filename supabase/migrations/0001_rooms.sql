-- Tumbleword room persistence.
-- Only the server (service-role key) touches these tables; RLS is on with no policies,
-- so the public anon key cannot read or write them. Realtime Broadcast/Presence need no tables.

create table if not exists public.rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_updated_at_idx on public.rooms (updated_at);

create table if not exists public.submissions (
  room_code text not null references public.rooms (code) on delete cascade,
  round integer not null,
  player_id text not null,
  word text not null,
  submitted_at timestamptz not null default now(),
  primary key (room_code, round, player_id, word)
);

create index if not exists submissions_round_idx on public.submissions (room_code, round);

alter table public.rooms enable row level security;
alter table public.submissions enable row level security;
