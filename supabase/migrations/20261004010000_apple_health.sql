-- Family Health: Apple Health (iPhone and Apple Watch) data
-- Daily summaries per person, plus workouts. Same privacy rule as everything else:
-- only the signed-in account that owns the family member can read or write these rows.

create table public.health_daily (
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  day        date not null,
  metric     text not null check (metric in (
               'steps','distance_km','active_kcal','exercise_min','flights',
               'resting_hr','avg_hr','max_hr','hrv_ms','spo2_pct','resp_rate','vo2max',
               'sleep_hr','weight_kg','bmi','bp_sys','bp_dia','glucose_mgdl','temp_c')),
  value      numeric not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, day, metric)
);
create index on public.health_daily(member_id, metric, day desc);

create table public.workouts (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  source_uuid text not null,                 -- HealthKit sample id, so re-syncing never duplicates
  started_at  timestamptz not null,
  activity    text not null,
  minutes     numeric(7,1) not null,
  kcal        numeric(8,1),
  km          numeric(8,2),
  created_at  timestamptz not null default now(),
  unique (member_id, source_uuid)
);
create index on public.workouts(member_id, started_at desc);

-- Which family member this account's Apple Health is linked to, per device, and when it last synced.
create table public.health_links (
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  device_name  text not null,
  last_sync_at timestamptz,
  primary key (member_id, device_name)
);

alter table public.health_daily enable row level security;
alter table public.workouts     enable row level security;
alter table public.health_links enable row level security;

do $$
declare t text;
begin
  foreach t in array array['health_daily','workouts','health_links'] loop
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
