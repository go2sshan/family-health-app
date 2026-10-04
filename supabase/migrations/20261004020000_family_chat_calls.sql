-- Family Health: families, accounts, invites, per-person sharing, chat and calls.
--
-- Model
--   * Every person who uses the app has their own login (auth.users) and a row in `profiles`.
--   * Logins belong to a `family` through `family_users` (role owner / admin / member).
--   * Health profiles (`members`) belong to a family. A profile can be linked to the login of the
--     person it describes (`members.user_id`); children or elders without a phone have no login.
--   * Who can see a profile's records:
--       - the person themselves (members.user_id)
--       - for profiles with no login: whoever created it and the family admins
--       - anyone that person shared with in `member_access` ('view' or 'edit')
--     Nobody else, including other family members, sees records unless they are shared.
--   * Chat: one family group conversation per family plus private one-to-one conversations.

create extension if not exists pg_net with schema extensions;

-- ---------- accounts ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone        text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
-- accounts that existed before this migration
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users on conflict (id) do nothing;

-- ---------- families ----------
create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.family_users (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index on public.family_users(user_id);

create table public.family_invites (
  code       text primary key,
  family_id  uuid not null references public.families(id) on delete cascade,
  member_id  uuid,                       -- optional: the profile this invite is for
  role       text not null default 'member' check (role in ('admin','member')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz
);

-- ---------- health profiles now belong to a family ----------
alter table public.members add column family_id uuid references public.families(id) on delete set null;
alter table public.members add column user_id   uuid references auth.users(id) on delete set null;
create unique index members_one_profile_per_login on public.members(user_id) where user_id is not null;
create index on public.members(family_id);
alter table public.family_invites add constraint family_invites_member_fk
  foreign key (member_id) references public.members(id) on delete cascade;

create table public.member_access (
  member_id  uuid not null references public.members(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  level      text not null check (level in ('view','edit')),
  granted_by uuid references auth.users(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (member_id, user_id)
);
create index on public.member_access(user_id);

-- Rows written by someone who later deletes their login stay with the family.
do $$
declare t text;
begin
  foreach t in array array['members','allergies','measurements','eye_prescriptions','emergency_contacts',
                           'records','record_files','payments','health_daily','workouts','health_links'] loop
    execute format('alter table public.%1$I drop constraint if exists %1$s_owner_fkey', t);
    execute format('alter table public.%1$I alter column owner drop not null', t);
    execute format('alter table public.%1$I add constraint %1$s_owner_fkey foreign key (owner) references auth.users(id) on delete set null', t);
  end loop;
end $$;

-- Existing data: give each account that already has profiles its own family.
do $$
declare r record; fid uuid;
begin
  for r in select distinct owner from public.members where family_id is null and owner is not null loop
    insert into public.families (name, created_by) values ('My family', r.owner) returning id into fid;
    insert into public.family_users (family_id, user_id, role) values (fid, r.owner, 'owner');
    update public.members set family_id = fid where owner = r.owner and family_id is null;
  end loop;
end $$;

-- ---------- access checks (security definer so policies don't recurse) ----------
create or replace function public.try_uuid(t text) returns uuid
language sql immutable as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end
$$;

create or replace function public.is_family_user(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_users where family_id = fid and user_id = auth.uid())
$$;

create or replace function public.is_family_admin(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_users where family_id = fid and user_id = auth.uid() and role in ('owner','admin'))
$$;

-- 'manage' (decides sharing), 'edit', 'view', or null (no access)
create or replace function public.member_role(mid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when m.user_id = auth.uid() then 'manage'
    when m.user_id is null and (m.owner = auth.uid() or public.is_family_admin(m.family_id)) then 'manage'
    when a.level = 'edit' then 'edit'
    when a.level = 'view' then 'view'
  end
  from members m
  left join member_access a on a.member_id = m.id and a.user_id = auth.uid()
  where m.id = mid
$$;

create or replace function public.can_view_member(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.member_role(mid) is not null $$;
create or replace function public.can_edit_member(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.member_role(mid) in ('manage','edit') $$;
create or replace function public.can_manage_member(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.member_role(mid) = 'manage' $$;

create or replace function public.shares_family(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_users a join family_users b on a.family_id = b.family_id
                 where a.user_id = auth.uid() and b.user_id = other)
$$;

-- ---------- policies: accounts and families ----------
alter table public.profiles       enable row level security;
alter table public.families       enable row level security;
alter table public.family_users   enable row level security;
alter table public.family_invites enable row level security;
alter table public.member_access  enable row level security;

create policy "see self and family" on public.profiles for select using (id = auth.uid() or public.shares_family(id));
create policy "edit self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "see my families" on public.families for select using (public.is_family_user(id));
create policy "admins rename" on public.families for update using (public.is_family_admin(id)) with check (public.is_family_admin(id));

create policy "see my family's logins" on public.family_users for select using (public.is_family_user(family_id));
create policy "admins see invites" on public.family_invites for select using (public.is_family_admin(family_id));

create policy "see sharing" on public.member_access for select
  using (user_id = auth.uid() or public.can_manage_member(member_id));
create policy "manager shares" on public.member_access for insert
  with check (public.can_manage_member(member_id) and public.shares_family(user_id) and user_id <> auth.uid());
create policy "manager changes sharing" on public.member_access for update
  using (public.can_manage_member(member_id)) with check (public.can_manage_member(member_id));
create policy "manager or person removes sharing" on public.member_access for delete
  using (public.can_manage_member(member_id) or user_id = auth.uid());

-- ---------- policies: health profiles and everything under them ----------
drop policy if exists "own members" on public.members;
create policy "view shared profiles" on public.members for select using (public.can_view_member(id));
create policy "add profiles to my family" on public.members for insert
  with check (owner = auth.uid() and family_id is not null and public.is_family_user(family_id) and user_id is null);
create policy "edit shared profiles" on public.members for update
  using (public.can_edit_member(id)) with check (public.can_edit_member(id));
create policy "manager deletes profile" on public.members for delete
  using (public.can_manage_member(id) and (user_id is null or user_id = auth.uid()));

-- Only the server moves a profile between families or links it to a login.
revoke update on public.members from authenticated, anon;
grant update (first_name, middle_name, last_name, relationship, date_of_birth, sex, blood_group, language,
              primary_doctor, communicate, care_needs, photo_path, sort_order) on public.members to authenticated;

do $$
declare t text;
begin
  foreach t in array array['allergies','measurements','eye_prescriptions','emergency_contacts',
                           'records','record_files','payments','health_daily','workouts','health_links'] loop
    execute format('drop policy if exists "own %1$s" on public.%1$I', t);
    execute format('create policy "view %1$s" on public.%1$I for select using (public.can_view_member(member_id))', t);
    execute format('create policy "add %1$s" on public.%1$I for insert with check (public.can_edit_member(member_id))', t);
    execute format('create policy "change %1$s" on public.%1$I for update using (public.can_edit_member(member_id)) with check (public.can_edit_member(member_id))', t);
    execute format('create policy "remove %1$s" on public.%1$I for delete using (public.can_edit_member(member_id))', t);
  end loop;
end $$;

-- ---------- chat ----------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  kind            text not null check (kind in ('family','direct')),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on public.conversation_participants(user_id);

create table public.calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  started_by      uuid references auth.users(id) on delete set null default auth.uid(),
  kind            text not null check (kind in ('audio','video')),
  status          text not null default 'ringing' check (status in ('ringing','active','ended','missed','declined')),
  started_at      timestamptz not null default now(),
  answered_at     timestamptz,
  ended_at        timestamptz
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null default auth.uid(),
  kind            text not null default 'text' check (kind in ('text','image','record','call','system')),
  body            text check (length(body) <= 4000),
  image_path      text,
  record_ref      jsonb,          -- {member_id, record_id, title, kind, date}: a snapshot the sender chose to share
  call_id         uuid references public.calls(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on public.messages(conversation_id, created_at desc);

create or replace function public.is_participant(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_participants where conversation_id = cid and user_id = auth.uid())
$$;

alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.calls                     enable row level security;

create policy "my conversations" on public.conversations for select using (public.is_participant(id));
create policy "participants of my conversations" on public.conversation_participants for select using (public.is_participant(conversation_id));
create policy "mark my own read" on public.conversation_participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read messages" on public.messages for select using (public.is_participant(conversation_id));
create policy "send messages" on public.messages for insert
  with check (sender_id = auth.uid() and public.is_participant(conversation_id) and kind in ('text','image','record'));
create policy "delete my messages" on public.messages for delete using (sender_id = auth.uid());
create policy "see calls" on public.calls for select using (public.is_participant(conversation_id));
create policy "answer or end calls" on public.calls for update
  using (public.is_participant(conversation_id)) with check (public.is_participant(conversation_id));

create or replace function public.bump_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_bump after insert on public.messages for each row execute function public.bump_conversation();

-- families that existed before chat get their group conversation
insert into public.conversations (family_id, kind)
select f.id, 'family' from public.families f
where not exists (select 1 from public.conversations c where c.family_id = f.id and c.kind = 'family');
insert into public.conversation_participants (conversation_id, user_id)
select c.id, fu.user_id from public.conversations c join public.family_users fu on fu.family_id = c.family_id
where c.kind = 'family' on conflict do nothing;

-- ---------- push notifications ----------
create table public.push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  token      text not null,
  platform   text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy "my push tokens" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Server-only settings (no client policies): where to send notification webhooks.
create table public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;

create or replace function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  select value into url from app_config where key = 'notify_url';
  select value into secret from app_config where key = 'notify_secret';
  if url is null or secret is null then return new; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret)
  );
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function public.notify_new_message();

-- ---------- server actions (RPC) ----------
create or replace function public.create_family(family_name text, my_first_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid; cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into families (name, created_by) values (family_name, auth.uid()) returning id into fid;
  insert into family_users (family_id, user_id, role) values (fid, auth.uid(), 'owner');
  insert into conversations (family_id, kind) values (fid, 'family') returning id into cid;
  insert into conversation_participants (conversation_id, user_id) values (cid, auth.uid());
  -- the creator's own health profile
  if my_first_name is not null and not exists (select 1 from members where user_id = auth.uid()) then
    insert into members (owner, family_id, user_id, first_name, relationship)
    values (auth.uid(), fid, auth.uid(), my_first_name, 'Self');
  end if;
  update members set family_id = fid where user_id = auth.uid() and family_id is null;
  return fid;
end $$;

create or replace function public.create_invite(fid uuid, for_member uuid default null, as_role text default 'member')
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_family_admin(fid) then raise exception 'Only family admins can invite people'; end if;
  if for_member is not null and not exists (select 1 from members where id = for_member and family_id = fid and user_id is null) then
    raise exception 'That profile already has its own login';
  end if;
  loop
    c := upper(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=0O1Il', ''), 1, 6));
    exit when length(c) = 6 and not exists (select 1 from family_invites where code = c);
  end loop;
  insert into family_invites (code, family_id, member_id, role) values (c, fid, for_member, coalesce(as_role, 'member'));
  return c;
end $$;

create or replace function public.join_family(invite_code text, my_first_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv family_invites; cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from family_invites where code = upper(trim(invite_code)) for update;
  if inv.code is null or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'This invite code is not valid. Ask for a new one.';
  end if;
  insert into family_users (family_id, user_id, role) values (inv.family_id, auth.uid(), inv.role)
    on conflict (family_id, user_id) do nothing;
  select id into cid from conversations where family_id = inv.family_id and kind = 'family' limit 1;
  insert into conversation_participants (conversation_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  if inv.member_id is not null and not exists (select 1 from members where user_id = auth.uid()) then
    -- the invite was made for an existing profile: it becomes this person's own profile.
    -- Whoever created it (often a parent) keeps edit access until this person changes that.
    update members set user_id = auth.uid() where id = inv.member_id and user_id is null;
    insert into member_access (member_id, user_id, level, granted_by)
      select m.id, m.owner, 'edit', auth.uid() from members m
      where m.id = inv.member_id and m.owner is not null and m.owner <> auth.uid()
      on conflict (member_id, user_id) do nothing;
  elsif not exists (select 1 from members where user_id = auth.uid()) then
    insert into members (owner, family_id, user_id, first_name, relationship)
    values (auth.uid(), inv.family_id, auth.uid(), coalesce(nullif(trim(my_first_name), ''), 'Me'), 'Family member');
  else
    update members set family_id = inv.family_id where user_id = auth.uid() and family_id is null;
  end if;
  update family_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.family_id;
end $$;

-- Remove someone from the family (admins), or leave it yourself.
create or replace function public.remove_from_family(fid uuid, who uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if who <> auth.uid() and not public.is_family_admin(fid) then raise exception 'Only family admins can remove people'; end if;
  if exists (select 1 from family_users where family_id = fid and user_id = who and role = 'owner') then
    raise exception 'The family owner can''t be removed';
  end if;
  delete from family_users where family_id = fid and user_id = who;
  -- they lose access to profiles in this family that were shared with them
  delete from member_access a using members m where a.member_id = m.id and m.family_id = fid and a.user_id = who;
  -- their own profile leaves with them, and nobody here keeps access to it
  delete from member_access a using members m where a.member_id = m.id and m.user_id = who;
  update members set family_id = null where user_id = who and family_id = fid;
  delete from conversation_participants p using conversations c
    where p.conversation_id = c.id and c.family_id = fid and p.user_id = who;
end $$;

create or replace function public.set_family_role(fid uuid, who uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from family_users where family_id = fid and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the family owner can change admins';
  end if;
  if new_role not in ('admin','member') then raise exception 'Unknown role'; end if;
  update family_users set role = new_role where family_id = fid and user_id = who and role <> 'owner';
end $$;

create or replace function public.get_or_create_direct(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; fid uuid;
begin
  if other = auth.uid() then raise exception 'Pick someone else'; end if;
  select a.family_id into fid from family_users a join family_users b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = other limit 1;
  if fid is null then raise exception 'You can only chat with people in your family'; end if;
  select c.id into cid from conversations c
    where c.kind = 'direct' and c.family_id = fid
      and exists (select 1 from conversation_participants where conversation_id = c.id and user_id = auth.uid())
      and exists (select 1 from conversation_participants where conversation_id = c.id and user_id = other)
    limit 1;
  if cid is null then
    insert into conversations (family_id, kind) values (fid, 'direct') returning id into cid;
    insert into conversation_participants (conversation_id, user_id) values (cid, auth.uid()), (cid, other);
  end if;
  return cid;
end $$;

create or replace function public.start_call(cid uuid, call_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare call_id uuid;
begin
  if not public.is_participant(cid) then raise exception 'Not in this conversation'; end if;
  insert into calls (conversation_id, started_by, kind) values (cid, auth.uid(), call_kind) returning id into call_id;
  insert into messages (conversation_id, sender_id, kind, body, call_id)
    values (cid, auth.uid(), 'call', case call_kind when 'video' then 'Video call' else 'Voice call' end, call_id);
  return call_id;
end $$;

grant execute on function public.create_family(text, text), public.create_invite(uuid, uuid, text),
  public.join_family(text, text), public.remove_from_family(uuid, uuid), public.set_family_role(uuid, uuid, text),
  public.get_or_create_direct(uuid), public.start_call(uuid, text), public.member_role(uuid) to authenticated;

-- ---------- files: scans, photos and chat pictures ----------
-- Paths:  <member id>/<file>  for a person's records and photo
--         chat/<conversation id>/<file>  for pictures sent in chat
drop policy if exists "own files read"   on storage.objects;
drop policy if exists "own files write"  on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;

create policy "family files read" on storage.objects for select using (
  bucket_id = 'family-files' and (
    ((storage.foldername(name))[1] = 'chat' and public.is_participant(public.try_uuid((storage.foldername(name))[2])))
    or public.can_view_member(public.try_uuid((storage.foldername(name))[1]))));
create policy "family files write" on storage.objects for insert with check (
  bucket_id = 'family-files' and (
    ((storage.foldername(name))[1] = 'chat' and public.is_participant(public.try_uuid((storage.foldername(name))[2])))
    or public.can_edit_member(public.try_uuid((storage.foldername(name))[1]))));
create policy "family files delete" on storage.objects for delete using (
  bucket_id = 'family-files' and (
    (owner_id = auth.uid()::text)
    or public.can_edit_member(public.try_uuid((storage.foldername(name))[1]))));

-- ---------- live updates ----------
alter publication supabase_realtime add table public.messages, public.calls, public.conversation_participants;

-- ---------- chat list for the signed-in person ----------
create or replace function public.my_conversations()
returns table (id uuid, kind text, family_name text, other_user uuid, other_name text,
               last_body text, last_kind text, last_at timestamptz, last_sender uuid, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, f.name, o.user_id, op.display_name,
         lm.body, lm.kind, coalesce(lm.created_at, c.created_at), lm.sender_id,
         (select count(*)::int from messages m
           where m.conversation_id = c.id and m.created_at > me.last_read_at and m.sender_id is distinct from auth.uid())
  from conversations c
  join conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
  join families f on f.id = c.family_id
  left join lateral (select p.user_id from conversation_participants p
                     where p.conversation_id = c.id and p.user_id <> auth.uid() and c.kind = 'direct' limit 1) o on true
  left join profiles op on op.id = o.user_id
  left join lateral (select m.body, m.kind, m.created_at, m.sender_id from messages m
                     where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
  order by coalesce(lm.created_at, c.created_at) desc
$$;
grant execute on function public.my_conversations() to authenticated;
