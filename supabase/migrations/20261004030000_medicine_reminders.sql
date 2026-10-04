-- Family Health: medicine reminders and dose log.
-- Each person can have medicine schedules (daily at set times, on chosen days, or as needed).
-- Every "Taken" / "Missed" tap is saved in medication_doses so adherence can be reviewed later.
-- Same sharing rules as records: people who can view a profile see its schedule and log;
-- people who can edit it (and the person themselves) can add schedules and mark doses.

-- A color for each person's reminder panel.
alter table public.members add column color text not null default 'teal'
  check (color in ('teal','indigo','rose','amber','green','violet','orange','sky'));
grant update (color) on public.members to authenticated;

create table public.medication_schedules (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid references auth.users(id) on delete set null default auth.uid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  record_id    uuid references public.records(id) on delete set null,   -- the medicine in the history, if linked
  name         text not null check (length(name) between 1 and 120),
  strength     text,                                                     -- "500 mg", "5 mg/5 ml"
  form         text not null default 'tablet' check (form in ('tablet','capsule','syrup','drops','inhaler','injection','cream','other')),
  dose_qty     numeric(6,2) not null default 1 check (dose_qty > 0),
  dose_unit    text not null default 'tablet',                           -- tablet, capsule, ml, drops, puffs, units
  pill_color   text,                                                     -- "white", "yellow", ...
  instructions text,                                                     -- "after food", "before bed"
  frequency    text not null default 'daily' check (frequency in ('daily','days','as_needed')),
  days_of_week smallint[],                                               -- 1 = Sunday ... 7 = Saturday, for 'days'
  times        text[] not null default '{}',                             -- "08:00", "20:30"
  start_date   date not null default current_date,
  end_date     date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (frequency = 'as_needed' or cardinality(times) between 1 and 8),
  check (frequency <> 'days' or cardinality(days_of_week) between 1 and 7),
  check (end_date is null or end_date >= start_date)
);
create index on public.medication_schedules(member_id) where active;
create trigger medication_schedules_updated before update on public.medication_schedules
  for each row execute function public.set_updated_at();

create table public.medication_doses (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid references auth.users(id) on delete set null default auth.uid(),   -- who tapped
  member_id     uuid not null references public.members(id) on delete cascade,
  schedule_id   uuid not null references public.medication_schedules(id) on delete cascade,
  scheduled_for timestamptz,          -- the reminder time this answers; null for "as needed" doses
  status        text not null check (status in ('taken','missed','skipped')),
  logged_at     timestamptz not null default now(),
  note          text
);
-- one answer per scheduled reminder (changing your mind updates it)
create unique index medication_doses_one_per_slot on public.medication_doses(schedule_id, scheduled_for) where scheduled_for is not null;
create index on public.medication_doses(member_id, logged_at desc);

alter table public.medication_schedules enable row level security;
alter table public.medication_doses     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['medication_schedules','medication_doses'] loop
    execute format('create policy "view %1$s" on public.%1$I for select using (public.can_view_member(member_id))', t);
    execute format('create policy "add %1$s" on public.%1$I for insert with check (public.can_edit_member(member_id))', t);
    execute format('create policy "change %1$s" on public.%1$I for update using (public.can_edit_member(member_id)) with check (public.can_edit_member(member_id))', t);
    execute format('create policy "remove %1$s" on public.%1$I for delete using (public.can_edit_member(member_id))', t);
  end loop;
end $$;

-- A dose must belong to the same person as its schedule.
create or replace function public.check_dose_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from medication_schedules s where s.id = new.schedule_id and s.member_id = new.member_id) then
    raise exception 'Dose does not match its medicine schedule';
  end if;
  return new;
end $$;
create trigger medication_doses_member before insert or update on public.medication_doses
  for each row execute function public.check_dose_member();

alter publication supabase_realtime add table public.medication_doses;
