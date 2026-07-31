-- LeaderHub 3.0 migration
alter table public.contacts drop constraint if exists contacts_status_check;

update public.contacts set status =
  case status
    when 'Nový kontakt' then 'Nový zájemce'
    when 'Domluvit ukázku' then 'Domluvená ukázka'
    when 'Po ukázce' then 'Čeká na vyjádření'
    when 'Objednáno' then 'Klient'
    when 'Zákazník' then 'Klient'
    when 'Neaktivní' then 'Nezájem'
    else coalesce(status,'Nový zájemce')
  end;

alter table public.contacts
  add constraint contacts_status_check
  check (status in ('Nový zájemce','Domluvená ukázka','Čeká na vyjádření','Klient','Nezájem'));

alter table public.contacts add column if not exists contact_type text default 'Zájemce';
alter table public.contacts add column if not exists source text;
alter table public.contacts add column if not exists street text;
alter table public.contacts add column if not exists city text;
alter table public.contacts add column if not exists postal_code text;
alter table public.contacts add column if not exists contract_number text;
alter table public.contacts add column if not exists purchase_date date;
alter table public.contacts add column if not exists package_name text;
alter table public.contacts add column if not exists accessories jsonb default '[]'::jsonb;
alter table public.contacts add column if not exists accessory_interest jsonb default '[]'::jsonb;
alter table public.contacts add column if not exists favorite boolean default false;
alter table public.contacts add column if not exists next_step text;

alter table public.contacts drop constraint if exists contacts_contact_type_check;
alter table public.contacts add constraint contacts_contact_type_check check (contact_type in ('Zájemce','Klient'));

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  full_name text not null,
  phone text,
  email text,
  sales_count integer not null default 0,
  recruits_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('Roční','Měsíční','Týdenní','Denní')),
  title text not null,
  start_date date,
  end_date date,
  target_sales integer not null default 0,
  current_sales integer not null default 0,
  target_recruits integer not null default 0,
  current_recruits integer not null default 0,
  reward text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.competitions enable row level security;

drop policy if exists "team_members_own_rows" on public.team_members;
create policy "team_members_own_rows" on public.team_members
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "competitions_own_rows" on public.competitions;
create policy "competitions_own_rows" on public.competitions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
