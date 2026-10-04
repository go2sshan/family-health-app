-- Family Health: initial schema
-- Every row belongs to the signed-in account (owner = auth.uid()).
-- Row-level security makes each account's family data invisible to everyone else.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- family members ----------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name    text not null,
  middle_name   text,
  last_name     text,
  relationship  text,                       -- Self, Spouse, Son, Daughter, ...
  date_of_birth date,
  sex           text,
  blood_group   text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  language      text,
  primary_doctor text,
  communicate   text,                       -- how to communicate if the person can't explain
  care_needs    text,                       -- disability, devices, caregiver needs
  photo_path    text,                       -- storage path in the family-files bucket
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.members(owner);
create trigger members_updated before update on public.members
  for each row execute function public.set_updated_at();

-- Child tables carry owner too, so policies stay simple and fast.
create table public.allergies (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  kind       text not null check (kind in ('medicine','food','other')),
  name       text not null,
  reaction   text,
  severity   text check (severity in ('mild','moderate','severe')),
  created_at timestamptz not null default now()
);

create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  measured_on date not null,
  height_cm   numeric(5,1) check (height_cm between 20 and 260),
  weight_kg   numeric(5,1) check (weight_kg between 0.5 and 400),
  created_at  timestamptz not null default now(),
  check (height_cm is not null or weight_kg is not null)
);

create table public.eye_prescriptions (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  rx_date    date not null,
  r_sph numeric(4,2), r_cyl numeric(4,2), r_axis smallint check (r_axis between 0 and 180),
  l_sph numeric(4,2), l_cyl numeric(4,2), l_axis smallint check (l_axis between 0 and 180),
  add_power numeric(4,2),
  note       text,
  created_at timestamptz not null default now()
);

create table public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  name         text not null,
  relationship text,
  phone        text not null,
  created_at   timestamptz not null default now()
);

-- One row per history entry, from any country, scan, manual entry or import.
create table public.records (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        text not null check (kind in ('visit','diagnosis','lab','medicine','vaccination','procedure','document','allergy')),
  occurred_on date,
  title       text not null,
  provider    text,                 -- doctor or hospital
  country     text,
  value       numeric,              -- lab result
  unit        text,
  ongoing     boolean,              -- diagnosis / medicine still active
  notes       text,
  source      text not null default 'manual' check (source in ('manual','scan','import')),
  confidence  text check (confidence in ('high','medium','low')),
  fhir        jsonb,                -- original FHIR resource when imported
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.records(member_id, occurred_on desc);
create trigger records_updated before update on public.records
  for each row execute function public.set_updated_at();

create table public.record_files (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  record_id    uuid not null references public.records(id) on delete cascade,
  storage_path text not null,
  mime_type    text,
  file_name    text,
  created_at   timestamptz not null default now()
);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  record_id      uuid references public.records(id) on delete set null,
  paid_on        date not null,
  description    text not null,
  kind           text not null default 'other' check (kind in ('visit','medicine','lab','procedure','vaccination','other')),
  doctor         text,
  illness        text,
  amount_paid    numeric(12,2) not null check (amount_paid >= 0),
  insurance_paid numeric(12,2) check (insurance_paid >= 0),
  billed         numeric(12,2) check (billed >= 0),
  currency       char(3) not null default 'USD',
  note           text,
  estimated      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on public.payments(member_id, paid_on desc);

-- ---------- row-level security ----------
alter table public.members            enable row level security;
alter table public.allergies          enable row level security;
alter table public.measurements       enable row level security;
alter table public.eye_prescriptions  enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.records            enable row level security;
alter table public.record_files       enable row level security;
alter table public.payments           enable row level security;

create policy "own members" on public.members
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Child rows: must be yours AND point at one of your own family members.
do $$
declare t text;
begin
  foreach t in array array['allergies','measurements','eye_prescriptions','emergency_contacts','records','record_files','payments'] loop
    execute format($f$
      create policy "own %1$s" on public.%1$I
        for all
        using (owner = auth.uid())
        with check (
          owner = auth.uid()
          and exists (select 1 from public.members m where m.id = member_id and m.owner = auth.uid())
        )$f$, t);
  end loop;
end $$;

-- ---------- private file storage (scans, receipts, profile photos) ----------
-- Files live at  <user id>/<member id>/<file>  and only that user can touch them.
insert into storage.buckets (id, name, public)
values ('family-files', 'family-files', false)
on conflict (id) do nothing;

create policy "own files read" on storage.objects for select
  using (bucket_id = 'family-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id = 'family-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update
  using (bucket_id = 'family-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id = 'family-files' and (storage.foldername(name))[1] = auth.uid()::text);
