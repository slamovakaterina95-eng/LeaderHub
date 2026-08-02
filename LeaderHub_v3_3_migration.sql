-- LeaderHub 3.3 – soutěže a nároky na odměny
alter table public.competitions add column if not exists milestones jsonb not null default '[]'::jsonb;

create table if not exists public.competition_entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid(),
 competition_id uuid not null references public.competitions(id) on delete cascade,
 member_id uuid not null references public.team_members(id) on delete cascade,
 sales_count integer not null default 0,
 recruits_count integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (competition_id, member_id)
);

alter table public.competition_entries enable row level security;
drop policy if exists "competition_entries_own_rows" on public.competition_entries;
create policy "competition_entries_own_rows" on public.competition_entries
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
