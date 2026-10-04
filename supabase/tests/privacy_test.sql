-- Privacy test for the family / sharing / chat rules.
-- Run against a database with the migrations applied (see README). Every check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','alice@x.test','{"display_name":"Alice"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob@x.test','{"display_name":"Bob"}'),
 ('cccccccc-0000-0000-0000-000000000003','carol@x.test','{"display_name":"Carol (outsider)"}'),
 ('dddddddd-0000-0000-0000-000000000004','dan@x.test','{"display_name":"Dan (teen)"}');
insert into storage.buckets values ('family-files','family-files',false) on conflict do nothing;

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); perform set_config('role', 'authenticated', false); end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', what; end if; raise notice 'ok  %', what; end $$;
create temp table ids(k text primary key, v text);
grant all on ids to authenticated;
set client_min_messages = notice;

-- Alice creates the family and a profile for her son (no phone yet)
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ids select 'fam', public.create_family('Sharma family', 'Alice')::text;
insert into ids select 'alice_m', id::text from members where user_id = auth.uid();
insert into members (family_id, first_name, relationship) select v::uuid, 'Dan', 'Son' from ids where k='fam';
insert into ids select 'dan_m', id::text from members where first_name = 'Dan';
insert into records (member_id, kind, title, occurred_on) select v::uuid, 'diagnosis', 'Type 2 diabetes', '2023-04-11' from ids where k='alice_m';
insert into records (member_id, kind, title, occurred_on) select v::uuid, 'vaccination', 'MMR dose 2', '2015-06-01' from ids where k='dan_m';
insert into ids select 'code_bob', public.create_invite((select v::uuid from ids where k='fam'));
insert into ids select 'code_dan', public.create_invite((select v::uuid from ids where k='fam'), (select v::uuid from ids where k='dan_m'));
select pg_temp.check((select count(*) from members) = 2, 'Alice sees her own profile and her son''s');

-- Bob joins with the invite code
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.join_family((select v from ids where k='code_bob'), 'Bob');
insert into ids select 'bob_m', id::text from members where user_id = auth.uid();
select pg_temp.check((select count(*) from members) = 1, 'Bob sees only his own profile, not Alice''s or the son''s');
select pg_temp.check((select count(*) from records) = 0, 'Bob cannot see any records yet');
select pg_temp.check((select count(*) from profiles) = 2, 'Bob sees family logins (names) for chat');
do $$ begin
  begin perform public.join_family((select v from ids where k='code_bob'), 'Again'); raise exception 'reuse allowed';
  exception when others then if sqlerrm = 'reuse allowed' then raise exception 'FAILED: invite code reused'; end if; end;
  raise notice 'ok  an invite code works only once';
end $$;

-- Alice shares her records with Bob, view only
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into member_access (member_id, user_id, level) select v::uuid, 'bbbbbbbb-0000-0000-0000-000000000002', 'view' from ids where k='alice_m';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from records) = 1, 'Bob now sees Alice''s records');
do $$ begin
  begin
    insert into records (member_id, kind, title) select v::uuid, 'visit', 'Bob edit' from ids where k='alice_m';
    raise exception 'insert allowed';
  exception when others then if sqlerrm = 'insert allowed' then raise exception 'FAILED: view-only could add a record'; end if; end;
  raise notice 'ok  view-only Bob cannot add records';
end $$;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) select 'family-files', v || '/x.jpg' from ids where k='alice_m';
    raise exception 'upload allowed';
  exception when others then if sqlerrm = 'upload allowed' then raise exception 'FAILED: view-only could upload'; end if; end;
  raise notice 'ok  view-only Bob cannot upload files to Alice''s profile';
end $$;
do $$ begin
  begin update members set user_id = auth.uid() where id = (select v::uuid from ids where k='alice_m'); raise exception 'took over';
  exception when others then if sqlerrm = 'took over' then raise exception 'FAILED: profile takeover'; end if; end;
  raise notice 'ok  nobody can take over a profile''s login link';
end $$;
do $$ begin
  begin insert into family_users values ((select v::uuid from ids where k='fam'), auth.uid(), 'owner'); raise exception 'promoted';
  exception when others then if sqlerrm = 'promoted' then raise exception 'FAILED: self-promotion'; end if; end;
  raise notice 'ok  Bob cannot make himself owner';
end $$;
do $$ begin
  begin perform public.create_invite((select v::uuid from ids where k='fam')); raise exception 'invited';
  exception when others then if sqlerrm = 'invited' then raise exception 'FAILED: non-admin invited'; end if; end;
  raise notice 'ok  a plain member cannot create invites';
end $$;

-- Upgrade Bob to edit
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update member_access set level = 'edit' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into records (member_id, kind, title) select v::uuid, 'visit', 'Added by Bob' from ids where k='alice_m';
select pg_temp.check((select count(*) from records) = 2, 'with edit access Bob can add to Alice''s records');
do $$ begin
  begin insert into member_access (member_id, user_id, level) select v::uuid, 'dddddddd-0000-0000-0000-000000000004', 'view' from ids where k='alice_m'; raise exception 'reshared';
  exception when others then if sqlerrm = 'reshared' then raise exception 'FAILED: editor re-shared'; end if; end;
  raise notice 'ok  only Alice decides who sees Alice''s records';
end $$;

-- Outsider Carol
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from members) = 0 and (select count(*) from records) = 0 and (select count(*) from profiles) = 1, 'outsider Carol sees nothing');
do $$ begin
  begin perform public.get_or_create_direct('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'chatted';
  exception when others then if sqlerrm = 'chatted' then raise exception 'FAILED: outsider chat'; end if; end;
  raise notice 'ok  outsider cannot start a chat with the family';
end $$;

-- Chat
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into ids select 'dm', public.get_or_create_direct('aaaaaaaa-0000-0000-0000-000000000001')::text;
insert into messages (conversation_id, body) select v::uuid, 'Hi Alice' from ids where k='dm';
insert into messages (conversation_id, body) select id, 'Hello family' from conversations where kind='family';
select pg_temp.check(public.get_or_create_direct('aaaaaaaa-0000-0000-0000-000000000001')::text = (select v from ids where k='dm'), 'opening the same chat twice reuses it');
select public.start_call((select v::uuid from ids where k='dm'), 'video');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from messages) = 3, 'Alice sees the private chat, the family message and the call');
select pg_temp.check((select count(*) from calls where status = 'ringing') = 1, 'Alice sees the incoming call');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from messages) = 0, 'outsider cannot read any messages');

-- Dan (the son) gets a phone and claims his profile
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select public.join_family((select v from ids where k='code_dan'), 'Dan');
select pg_temp.check((select user_id::text from members where id = (select v::uuid from ids where k='dan_m')) = 'dddddddd-0000-0000-0000-000000000004', 'Dan''s existing profile is now his own');
select pg_temp.check((select count(*) from records) = 1, 'Dan sees his own vaccination history');
select pg_temp.check(public.member_role((select v::uuid from ids where k='dan_m')) = 'manage', 'Dan now decides who sees his records');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(public.member_role((select v::uuid from ids where k='dan_m')) = 'edit', 'Alice keeps edit access to her son''s records');

-- Alice removes Bob from the family
select public.remove_from_family((select v::uuid from ids where k='fam'), 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from records where member_id = (select v::uuid from ids where k='alice_m')) = 0, 'removed Bob loses access to Alice''s records');
select pg_temp.check((select count(*) from messages m join conversations c on c.id = m.conversation_id where c.kind = 'family') = 0, 'removed Bob is out of the family chat');
select pg_temp.check((select count(*) from members where user_id = auth.uid()) = 1, 'Bob keeps his own profile');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'Alice no longer sees Bob''s profile');
do $$ begin
  begin perform public.remove_from_family((select v::uuid from ids where k='fam'), 'aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'owner removed';
  exception when others then if sqlerrm = 'owner removed' then raise exception 'FAILED'; end if; end;
  raise notice 'ok  the family owner cannot be removed';
end $$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.my_conversations()) = 2, 'Alice''s chat list has the family group and her chat with Bob');
select pg_temp.check((select unread from public.my_conversations() where kind='direct') = 2, 'unread count shows Bob''s 2 new messages');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from public.my_conversations()) = 0, 'outsider''s chat list is empty');


-- ---------- medicine reminders ----------
-- (state here: Alice's profile not shared with Bob any more; Dan manages his own profile, Alice can edit it)
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into medication_schedules (member_id, name, strength, dose_qty, dose_unit, pill_color, times)
  select v::uuid, 'Metformin', '500 mg', 1, 'tablet', 'white', '{08:00,20:00}' from ids where k='alice_m';
insert into ids select 'alice_med', id::text from medication_schedules where name = 'Metformin';
insert into medication_doses (member_id, schedule_id, scheduled_for, status)
  select (select v::uuid from ids where k='alice_m'), (select v::uuid from ids where k='alice_med'), '2026-10-04 08:00-04', 'taken';
insert into medication_schedules (member_id, name, dose_qty, dose_unit, form, times, frequency, days_of_week)
  select v::uuid, 'Vitamin D drops', 5, 'drops', 'drops', '{09:00}', 'days', '{1,4}' from ids where k='dan_m';
select pg_temp.check((select count(*) from medication_schedules) = 2, 'Alice sees her medicine and her son''s (she can edit his)');
do $$ begin
  begin
    insert into medication_doses (member_id, schedule_id, scheduled_for, status)
      select (select v::uuid from ids where k='alice_m'), (select v::uuid from ids where k='alice_med'), '2026-10-04 08:00-04', 'missed';
    raise exception 'duplicate';
  exception when unique_violation then null; when others then if sqlerrm = 'duplicate' then raise exception 'FAILED: two answers for one reminder'; end if; end;
  raise notice 'ok  one Taken/Missed answer per reminder time';
end $$;
do $$ begin
  begin
    insert into medication_doses (member_id, schedule_id, status)
      select (select v::uuid from ids where k='dan_m'), (select v::uuid from ids where k='alice_med'), 'taken';
    raise exception 'mismatch';
  exception when others then if sqlerrm = 'mismatch' then raise exception 'FAILED: dose filed under wrong person'; end if; end;
  raise notice 'ok  a dose can''t be filed under the wrong person';
end $$;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select pg_temp.check((select count(*) from medication_schedules) = 1, 'Dan sees only his own medicine');
insert into medication_doses (member_id, schedule_id, status)
  select (select v::uuid from ids where k='dan_m'), id, 'taken' from medication_schedules;
select pg_temp.check((select count(*) from medication_doses) = 1, 'Dan logs his own dose');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from medication_schedules) = 0 and (select count(*) from medication_doses) = 0, 'outsider sees no medicines or doses');
\echo ALL CHECKS PASSED
