
-- Social discovery and learner-created public/private groups.
alter table public.studyspace_group_members drop constraint if exists studyspace_group_members_membership_source_check;
alter table public.studyspace_group_members add constraint studyspace_group_members_membership_source_check
check (membership_source = any (array['class_auto','request','invite','admin','auto_match','owner']::text[]));

create or replace function public.create_studyspace_custom_group(p_name text,p_description text default '',p_discoverable boolean default false)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=(select auth.uid()); v_group_id uuid;
begin
 if v_user is null or not public.is_active_studyspace_learner() then raise exception 'An active student account is required'; end if;
 if not public.studyspace_group_peer_eligible(v_user) then raise exception 'Guardian approval is required before creating student group chats'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Group names must contain 2 to 100 characters'; end if;
 if char_length(coalesce(p_description,''))>500 then raise exception 'Group descriptions are limited to 500 characters'; end if;
 insert into public.studyspace_groups(group_type,name,description,created_by,school_name,education_level,grade,timetable_entry_id,discoverable,is_active)
 values('custom',btrim(p_name),btrim(coalesce(p_description,'')),v_user,'','','',null,coalesce(p_discoverable,false),true) returning id into v_group_id;
 insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
 values(v_group_id,v_user,'active','owner',now());
 return v_group_id;
end $$;
revoke all on function public.create_studyspace_custom_group(text,text,boolean) from public,anon;
grant execute on function public.create_studyspace_custom_group(text,text,boolean) to authenticated;

create or replace function public.set_studyspace_group_visibility(p_group_id uuid,p_discoverable boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group public.studyspace_groups%rowtype; v_user uuid:=(select auth.uid());
begin
 if v_user is null then raise exception 'Sign in is required'; end if;
 select * into v_group from public.studyspace_groups where id=p_group_id and is_active for update;
 if not found then raise exception 'This group is not available'; end if;
 if public.is_studyspace_admin() then
  update public.studyspace_groups set discoverable=coalesce(p_discoverable,false),updated_at=now() where id=p_group_id; return;
 end if;
 if not public.is_active_studyspace_learner() or not public.studyspace_group_peer_eligible(v_user) then raise exception 'An eligible active student account is required'; end if;
 if v_group.group_type<>'custom' or v_group.created_by<>v_user or not public.is_studyspace_group_member(p_group_id,v_user) then
  raise exception 'Only the creator of a custom group can change its visibility';
 end if;
 update public.studyspace_groups set discoverable=coalesce(p_discoverable,false),updated_at=now() where id=p_group_id;
end $$;
revoke all on function public.set_studyspace_group_visibility(uuid,boolean) from public,anon;
grant execute on function public.set_studyspace_group_visibility(uuid,boolean) to authenticated;

create or replace function public.respond_studyspace_group_join_request(p_group_id uuid,p_learner_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group public.studyspace_groups%rowtype; v_learner public.profiles%rowtype;
begin
 select * into v_group from public.studyspace_groups where id=p_group_id and is_active for update;
 if not found then raise exception 'This group is not active'; end if;
 if not public.is_studyspace_admin() and not (v_group.group_type='custom' and v_group.created_by=(select auth.uid())
    and public.is_studyspace_group_member(p_group_id,(select auth.uid()))) then
  raise exception 'Only the group owner or a Monitor administrator can manage join requests';
 end if;
 if p_learner_id is null or p_learner_id=(select auth.uid()) then raise exception 'Choose a valid learner'; end if;
 select * into v_learner from public.profiles where id=p_learner_id and role='learner' and account_status='active';
 if not found then raise exception 'This learner account is not active'; end if;
 if p_accept then
  if not public.studyspace_group_peer_eligible(p_learner_id) then raise exception 'Guardian approval is required before this learner can join a group chat'; end if;
  if v_group.group_type='school' and lower(btrim(v_group.school_name))<>lower(btrim(v_learner.institution)) then raise exception 'This learner does not belong to the school assigned to this group'; end if;
  if v_group.group_type='level' and (lower(btrim(v_group.education_level))<>lower(btrim(v_learner.education_level))
     or (v_group.grade<>'' and lower(btrim(v_group.grade))<>lower(btrim(v_learner.grade)))) then
   raise exception 'This learner does not match the study level or grade assigned to this group';
  end if;
 end if;
 update public.studyspace_group_members set membership_status=case when p_accept then 'active' else 'declined' end,
  membership_source=case when p_accept then 'owner' else membership_source end,
  joined_at=case when p_accept then coalesce(joined_at,now()) else null end,updated_at=now()
 where group_id=p_group_id and learner_id=p_learner_id and membership_status='pending';
 if not found then raise exception 'This join request is no longer pending'; end if;
end $$;
revoke all on function public.respond_studyspace_group_join_request(uuid,uuid,boolean) from public,anon;
grant execute on function public.respond_studyspace_group_join_request(uuid,uuid,boolean) to authenticated;

create or replace function public.can_view_studyspace_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.is_studyspace_admin()
 or exists(select 1 from public.studyspace_groups g where g.id=p_group_id and g.is_active
   and (public.is_studyspace_group_member(g.id,(select auth.uid()))
    or exists(select 1 from public.studyspace_group_invites i where i.group_id=g.id and i.invitee_id=(select auth.uid()) and i.status='pending')))
 or exists(select 1 from public.studyspace_groups g join public.profiles me on me.id=(select auth.uid())
   where g.id=p_group_id and g.is_active and g.discoverable and me.role='learner' and me.account_status='active'
   and (g.group_type='custom'
    or (g.group_type='school' and lower(btrim(g.school_name))=lower(btrim(me.institution)))
    or (g.group_type='level' and lower(btrim(g.education_level))=lower(btrim(me.education_level))
     and (g.grade='' or lower(btrim(g.grade))=lower(btrim(me.grade))))));
$$;
revoke all on function public.can_view_studyspace_group(uuid) from public,anon;
grant execute on function public.can_view_studyspace_group(uuid) to authenticated;

-- Directory lookup accepts Student ID or name. It never returns DOB, sex, contact data, avatar path or raw Student ID.
drop function if exists public.search_studyspace_learners(text);
create function public.search_studyspace_learners(p_query text)
returns table(learner_id uuid,display_name text,institution text,education_level text,grade text,curriculum text,country text,can_invite boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_query text:=left(btrim(coalesce(p_query,'')),60);
begin
 if not public.is_active_studyspace_learner() then raise exception 'An active learner account is required'; end if;
 if char_length(v_query)<2 then return; end if;
 return query select p.id,coalesce(nullif(btrim(p.preferred_name),''),nullif(btrim(p.full_name),''),'Learner'),
  coalesce(p.institution,''),coalesce(p.education_level,''),coalesce(p.grade,''),coalesce(p.curriculum,''),coalesce(p.country,''),
  (select private.studyspace_peer_chat_eligible((select auth.uid()))) and (select private.studyspace_peer_chat_eligible(p.id))
 from public.profiles p where p.role='learner' and p.account_status='active' and p.id<>(select auth.uid())
  and (coalesce(p.preferred_name,'') ilike '%'||v_query||'%' or coalesce(p.full_name,'') ilike '%'||v_query||'%'
    or coalesce(p.student_id,'') ilike '%'||v_query||'%')
 order by case when upper(coalesce(p.student_id,''))=upper(v_query) then 0
  when lower(coalesce(p.preferred_name,''))=lower(v_query) then 1
  when lower(coalesce(p.full_name,''))=lower(v_query) then 2 else 3 end,p.preferred_name,p.full_name limit 15;
end $$;
revoke all on function public.search_studyspace_learners(text) from public,anon;
grant execute on function public.search_studyspace_learners(text) to authenticated;

-- XP ledger: insert access is withheld from clients; triggers and approved RPCs award points.
create table if not exists public.student_xp_events(
 id uuid primary key default gen_random_uuid(),
 learner_id uuid not null references public.profiles(id) on delete cascade,
 event_key text not null check(char_length(event_key) between 1 and 180),
 event_type text not null check(event_type in ('profile_completed','assessment_completed','assessment_passed','study_session_completed',
  'flashcard_review','referral_qualified','streak_milestone','admin_adjustment')),
 points integer not null check(points between -1000 and 1000 and points<>0),
 metadata jsonb not null default '{}'::jsonb,
 awarded_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint student_xp_events_learner_event_unique unique(learner_id,event_key)
);
create index if not exists student_xp_events_learner_timeline_idx on public.student_xp_events(learner_id,created_at desc);
alter table public.student_xp_events enable row level security;
drop policy if exists student_xp_events_learner_read on public.student_xp_events;
create policy student_xp_events_learner_read on public.student_xp_events for select to authenticated using(learner_id=(select auth.uid()));
drop policy if exists student_xp_events_admin_read on public.student_xp_events;
create policy student_xp_events_admin_read on public.student_xp_events for select to authenticated using((select public.is_studyspace_admin()));
revoke all on public.student_xp_events from anon,authenticated;
grant select on public.student_xp_events to authenticated;

create table if not exists public.student_daily_activity(
 learner_id uuid not null references public.profiles(id) on delete cascade,
 activity_date date not null,
 study_minutes integer not null default 0 check(study_minutes between 0 and 1440),
 completed_sessions integer not null default 0 check(completed_sessions between 0 and 100),
 completed_assessments integer not null default 0 check(completed_assessments between 0 and 100),
 flashcards_reviewed integer not null default 0 check(flashcards_reviewed between 0 and 500),
 last_activity_at timestamptz not null default now(),
 primary key(learner_id,activity_date)
);
create index if not exists student_daily_activity_date_idx on public.student_daily_activity(activity_date desc,learner_id);
alter table public.student_daily_activity enable row level security;
drop policy if exists student_daily_activity_owner_read on public.student_daily_activity;
create policy student_daily_activity_owner_read on public.student_daily_activity for select to authenticated using(learner_id=(select auth.uid()));
drop policy if exists student_daily_activity_admin_read on public.student_daily_activity;
create policy student_daily_activity_admin_read on public.student_daily_activity for select to authenticated using((select public.is_studyspace_admin()));
revoke all on public.student_daily_activity from anon,authenticated;
grant select on public.student_daily_activity to authenticated;

create table if not exists public.student_referral_codes(
 learner_id uuid primary key references public.profiles(id) on delete cascade,
 code text not null unique check(code ~ '^[A-Z0-9]{10}$'),
 created_at timestamptz not null default now()
);
alter table public.student_referral_codes enable row level security;
drop policy if exists student_referral_codes_owner_read on public.student_referral_codes;
create policy student_referral_codes_owner_read on public.student_referral_codes for select to authenticated using(learner_id=(select auth.uid()));
drop policy if exists student_referral_codes_admin_read on public.student_referral_codes;
create policy student_referral_codes_admin_read on public.student_referral_codes for select to authenticated using((select public.is_studyspace_admin()));
revoke all on public.student_referral_codes from anon,authenticated;
grant select on public.student_referral_codes to authenticated;

create table if not exists public.student_referrals(
 id uuid primary key default gen_random_uuid(),
 referrer_id uuid not null references public.profiles(id) on delete cascade,
 referred_id uuid not null unique references public.profiles(id) on delete cascade,
 referral_code text not null references public.student_referral_codes(code) on update cascade,
 status text not null default 'pending' check(status in ('pending','qualified','rejected')),
 created_at timestamptz not null default now(),
 qualified_at timestamptz,
 constraint student_referrals_not_self check(referrer_id<>referred_id)
);
create index if not exists student_referrals_referrer_status_idx on public.student_referrals(referrer_id,status,created_at desc);
alter table public.student_referrals enable row level security;
drop policy if exists student_referrals_participant_read on public.student_referrals;
create policy student_referrals_participant_read on public.student_referrals for select to authenticated
 using(referrer_id=(select auth.uid()) or referred_id=(select auth.uid()) or (select public.is_studyspace_admin()));
revoke all on public.student_referrals from anon,authenticated;
grant select on public.student_referrals to authenticated;

create or replace function public.get_or_create_studyspace_referral_code()
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_user uuid:=(select auth.uid()); v_code text; i integer;
begin
 if v_user is null or not public.is_active_studyspace_learner() then raise exception 'An active student account is required'; end if;
 select code into v_code from public.student_referral_codes where learner_id=v_user;
 if v_code is not null then return v_code; end if;
 for i in 1..12 loop
  v_code:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));
  insert into public.student_referral_codes(learner_id,code) values(v_user,v_code) on conflict(learner_id) do nothing;
  select code into v_code from public.student_referral_codes where learner_id=v_user;
  if v_code is not null then return v_code; end if;
 end loop;
 raise exception 'A referral code could not be generated';
end $$;
revoke all on function public.get_or_create_studyspace_referral_code() from public,anon;
grant execute on function public.get_or_create_studyspace_referral_code() to authenticated;

create or replace function private.qualify_studyspace_referral(p_referred_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_referral public.student_referrals%rowtype; v_profile public.profiles%rowtype;
begin
 select * into v_profile from public.profiles where id=p_referred_id and role='learner' and account_status='active'
  and btrim(institution)<>'' and btrim(education_level)<>'' and btrim(grade)<>'' and btrim(curriculum)<>'';
 if not found then return; end if;
 update public.student_referrals set status='qualified',qualified_at=now()
  where referred_id=p_referred_id and status='pending' returning * into v_referral;
 if not found then return; end if;
 insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
  values(v_referral.referrer_id,'referral:'||v_referral.id::text,'referral_qualified',100,
   jsonb_build_object('referral_id',v_referral.id,'milestone','referred_learner_profile_completed'))
  on conflict(learner_id,event_key) do nothing;
 insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
  values(v_referral.referred_id,'referral-welcome:'||v_referral.id::text,'referral_qualified',50,
   jsonb_build_object('referral_id',v_referral.id,'milestone','joined_with_referral'))
  on conflict(learner_id,event_key) do nothing;
end $$;
revoke all on function private.qualify_studyspace_referral(uuid) from public,anon,authenticated;

-- Server-only referral attribution from the enrolment Edge Function.
create or replace function public.attribute_studyspace_referral(p_referred_id uuid,p_referral_code text)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_referrer uuid; v_referred public.profiles%rowtype; v_code text:=upper(left(btrim(coalesce(p_referral_code,'')),10));
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Referral attribution is restricted to the enrolment service'; end if;
 if v_code='' then return; end if;
 select learner_id into v_referrer from public.student_referral_codes where code=v_code;
 if not found then return; end if;
 select * into v_referred from public.profiles where id=p_referred_id and role='learner'
  and account_status in ('active','pending_guardian_verification');
 if not found or v_referrer=p_referred_id then return; end if;
 insert into public.student_referrals(referrer_id,referred_id,referral_code) values(v_referrer,p_referred_id,v_code)
 on conflict(referred_id) do nothing;
 perform private.qualify_studyspace_referral(p_referred_id);
end $$;
revoke all on function public.attribute_studyspace_referral(uuid,text) from public,anon,authenticated;
grant execute on function public.attribute_studyspace_referral(uuid,text) to service_role;

-- Internal activity ledger and streak rewards.
create or replace function private.record_studyspace_daily_activity(
 p_learner_id uuid,p_activity_date date,p_study_minutes integer default 0,
 p_completed_sessions integer default 0,p_completed_assessments integer default 0,p_flashcards_reviewed integer default 0
)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_latest date; v_current integer:=0; v_day date;
begin
 insert into public.student_daily_activity(learner_id,activity_date,study_minutes,completed_sessions,completed_assessments,flashcards_reviewed,last_activity_at)
 values(p_learner_id,p_activity_date,greatest(0,least(1440,coalesce(p_study_minutes,0))),
  greatest(0,least(100,coalesce(p_completed_sessions,0))),greatest(0,least(100,coalesce(p_completed_assessments,0))),
  greatest(0,least(500,coalesce(p_flashcards_reviewed,0))),now())
 on conflict(learner_id,activity_date) do update set
  study_minutes=least(1440,public.student_daily_activity.study_minutes+excluded.study_minutes),
  completed_sessions=least(100,public.student_daily_activity.completed_sessions+excluded.completed_sessions),
  completed_assessments=least(100,public.student_daily_activity.completed_assessments+excluded.completed_assessments),
  flashcards_reviewed=least(500,public.student_daily_activity.flashcards_reviewed+excluded.flashcards_reviewed),last_activity_at=now();
 select max(activity_date) into v_latest from public.student_daily_activity where learner_id=p_learner_id;
 if v_latest is null or v_latest<timezone('Africa/Mbabane',now())::date-1 then return; end if;
 v_day:=v_latest;
 loop
  exit when not exists(select 1 from public.student_daily_activity where learner_id=p_learner_id and activity_date=v_day);
  v_current:=v_current+1; v_day:=v_day-1; exit when v_current>=365;
 end loop;
 if v_current in (3,7,14,30,60,100) then
  insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
  values(p_learner_id,'streak-milestone:'||v_current::text,'streak_milestone',
   case when v_current=3 then 10 when v_current=7 then 25 when v_current=14 then 50
    when v_current=30 then 100 when v_current=60 then 200 else 350 end,
   jsonb_build_object('streak_days',v_current,'activity_date',v_latest))
  on conflict(learner_id,event_key) do nothing;
 end if;
end $$;
revoke all on function private.record_studyspace_daily_activity(uuid,date,integer,integer,integer,integer) from public,anon,authenticated;

create or replace function private.award_studyspace_profile_xp()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 if new.role='learner' and new.account_status='active' and btrim(coalesce(new.institution,''))<>''
  and btrim(coalesce(new.education_level,''))<>'' and btrim(coalesce(new.grade,''))<>'' and btrim(coalesce(new.curriculum,''))<>'' then
  insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
  values(new.id,'profile-complete','profile_completed',100,jsonb_build_object('milestone','academic_profile_completed'))
  on conflict(learner_id,event_key) do nothing;
  perform private.qualify_studyspace_referral(new.id);
 end if;
 return new;
end $$;
drop trigger if exists zz_studyspace_profile_xp on public.profiles;
create trigger zz_studyspace_profile_xp after insert or update of institution,education_level,grade,curriculum,role,account_status
on public.profiles for each row execute function private.award_studyspace_profile_xp();

create or replace function private.award_studyspace_session_xp()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_date date; v_daily_points integer; v_points integer;
begin
 if new.duration_minutes<10 or new.duration_minutes>1440 then return new; end if;
 if new.started_at<now()-interval '36 hours' or new.started_at>now()+interval '5 minutes' then return new; end if;
 v_date:=(new.started_at at time zone 'Africa/Mbabane')::date;
 perform private.record_studyspace_daily_activity(new.learner_id,v_date,least(new.duration_minutes,90),1,0,0);
 select coalesce(sum(points),0) into v_daily_points from public.student_xp_events
  where learner_id=new.learner_id and event_type='study_session_completed' and metadata->>'activity_date'=v_date::text;
 v_points:=least(10,greatest(2,(least(new.duration_minutes,90)/15)*2),greatest(0,30-v_daily_points));
 if v_points>0 then
  insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
  values(new.learner_id,'study-session:'||new.id::text,'study_session_completed',v_points,
   jsonb_build_object('activity_date',v_date,'duration_minutes',least(new.duration_minutes,90)))
  on conflict(learner_id,event_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists studyspace_session_xp on public.study_sessions;
create trigger studyspace_session_xp after insert on public.study_sessions for each row execute function private.award_studyspace_session_xp();

create or replace function private.award_studyspace_assessment_xp()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_date date; v_percent numeric;
begin
 if new.total_points<=0 then return new; end if;
 v_date:=(coalesce(new.submitted_at,now()) at time zone 'Africa/Mbabane')::date;
 perform private.record_studyspace_daily_activity(new.learner_id,v_date,0,0,1,0);
 insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
 values(new.learner_id,'assessment:'||new.assignment_id::text,'assessment_completed',25,
  jsonb_build_object('activity_date',v_date,'attempt_id',new.id)) on conflict(learner_id,event_key) do nothing;
 v_percent:=(new.score/nullif(new.total_points,0))*100;
 if v_percent>=60 then
  insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
  values(new.learner_id,'assessment-pass:'||new.assignment_id::text,'assessment_passed',10,
   jsonb_build_object('activity_date',v_date,'attempt_id',new.id,'percentage',round(v_percent,1)))
  on conflict(learner_id,event_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists studyspace_assessment_xp on public.exercise_attempts;
create trigger studyspace_assessment_xp after insert on public.exercise_attempts for each row execute function private.award_studyspace_assessment_xp();

create or replace function public.record_studyspace_flashcard_review(p_subject_id uuid,p_card_key text,p_known boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=(select auth.uid()); v_date date; v_count integer; v_key text;
begin
 if v_user is null or not public.is_active_studyspace_learner() then raise exception 'An active student account is required'; end if;
 if p_card_key is null or p_card_key !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'This flashcard cannot be recorded'; end if;
 if not exists(select 1 from public.student_subjects where id=p_subject_id and learner_id=v_user) then
  raise exception 'This subject is not part of your student profile';
 end if;
 perform 1 from public.profiles where id=v_user for update;
 v_date:=timezone('Africa/Mbabane',now())::date;
 select count(*) into v_count from public.student_xp_events where learner_id=v_user and event_type='flashcard_review' and metadata->>'activity_date'=v_date::text;
 if v_count>=10 then return false; end if;
 v_key:='flashcard:'||p_subject_id::text||':'||p_card_key||':'||v_date::text;
 insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
 values(v_user,v_key,'flashcard_review',2,jsonb_build_object('activity_date',v_date,'subject_id',p_subject_id,'card_key',p_card_key,'known',coalesce(p_known,false)))
 on conflict(learner_id,event_key) do nothing;
 if not found then return false; end if;
 perform private.record_studyspace_daily_activity(v_user,v_date,0,0,0,1);
 return true;
end $$;
revoke all on function public.record_studyspace_flashcard_review(uuid,text,boolean) from public,anon;
grant execute on function public.record_studyspace_flashcard_review(uuid,text,boolean) to authenticated;

create or replace function public.get_studyspace_gamification_summary()
returns table(total_xp bigint,level integer,level_title text,xp_into_level bigint,xp_for_next_level bigint,
 current_streak integer,longest_streak integer,active_days integer,study_minutes bigint,
 completed_assessments integer,flashcards_reviewed integer,referrals_qualified integer,last_activity_date date)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=(select auth.uid()); v_xp bigint; v_level integer; v_last date;
 v_current integer:=0; v_longest integer:=0; v_day date; v_title text;
begin
 if v_user is null or not public.is_active_studyspace_learner() then raise exception 'An active student account is required'; end if;
 select greatest(0,coalesce(sum(points),0)) into v_xp from public.student_xp_events where learner_id=v_user;
 v_level:=floor(sqrt(v_xp::numeric/100))::integer+1;
 v_title:=case when v_level<3 then 'Explorer' when v_level<5 then 'Apprentice' when v_level<8 then 'Scholar'
  when v_level<12 then 'Achiever' when v_level<17 then 'Master' else 'Legend' end;
 select max(activity_date) into v_last from public.student_daily_activity where learner_id=v_user;
 if v_last is not null and v_last>=timezone('Africa/Mbabane',now())::date-1 then
  v_day:=v_last;
  loop
   exit when not exists(select 1 from public.student_daily_activity where learner_id=v_user and activity_date=v_day);
   v_current:=v_current+1; v_day:=v_day-1; exit when v_current>=365;
  end loop;
 end if;
 with days as(select activity_date,activity_date-(row_number() over(order by activity_date))::integer grp
  from public.student_daily_activity where learner_id=v_user),
  runs as(select count(*) n from days group by grp)
 select coalesce(max(n),0)::integer into v_longest from runs;
 return query select v_xp,v_level,v_title,
  v_xp-(100*(v_level-1)*(v_level-1))::bigint,
  (100*(v_level*v_level-(v_level-1)*(v_level-1)))::bigint,
  v_current,v_longest,
  (select count(*)::integer from public.student_daily_activity where learner_id=v_user),
  (select coalesce(sum(study_minutes),0)::bigint from public.student_daily_activity where learner_id=v_user),
  (select coalesce(sum(completed_assessments),0)::integer from public.student_daily_activity where learner_id=v_user),
  (select coalesce(sum(flashcards_reviewed),0)::integer from public.student_daily_activity where learner_id=v_user),
  (select count(*)::integer from public.student_referrals where referrer_id=v_user and status='qualified'),v_last;
end $$;
revoke all on function public.get_studyspace_gamification_summary() from public,anon;
grant execute on function public.get_studyspace_gamification_summary() to authenticated;

create or replace function public.get_studyspace_monitor_gamification_overview()
returns table(learner_id uuid,display_name text,institution text,grade text,total_xp bigint,current_streak integer,
 longest_streak integer,qualified_referrals integer,last_activity_date date)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.is_studyspace_admin() then raise exception 'Monitor administrator access is required'; end if;
 return query
 with xp as(select e.learner_id,coalesce(sum(e.points),0)::bigint total from public.student_xp_events e group by e.learner_id),
 daily as(select d.learner_id,max(d.activity_date) last_day from public.student_daily_activity d group by d.learner_id),
 ranks as(select d.learner_id,d.activity_date,d.activity_date-(row_number() over(partition by d.learner_id order by d.activity_date))::integer grp from public.student_daily_activity d),
 longest as(select learner_id,max(n)::integer longest from(select learner_id,grp,count(*) n from ranks group by learner_id,grp) q group by learner_id)
 select p.id,coalesce(nullif(btrim(p.preferred_name),''),p.full_name),p.institution,p.grade,coalesce(x.total,0),
  case when d.last_day>=timezone('Africa/Mbabane',now())::date-1 then
   (select count(*)::integer from generate_series(0,364) s(i) where exists(select 1 from public.student_daily_activity a
     where a.learner_id=p.id and a.activity_date=d.last_day-s.i)) else 0 end,
  coalesce(l.longest,0),
  (select count(*)::integer from public.student_referrals r where r.referrer_id=p.id and r.status='qualified'),d.last_day
 from public.profiles p left join xp x on x.learner_id=p.id left join daily d on d.learner_id=p.id left join longest l on l.learner_id=p.id
 where p.role='learner' and p.account_status='active' order by coalesce(x.total,0) desc,d.last_day desc nulls last limit 200;
end $$;
revoke all on function public.get_studyspace_monitor_gamification_overview() from public,anon;
grant execute on function public.get_studyspace_monitor_gamification_overview() to authenticated;

create or replace function public.adjust_studyspace_learner_xp(p_learner_id uuid,p_points integer,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if not public.is_studyspace_admin() then raise exception 'Monitor administrator access is required'; end if;
 if p_points=0 or p_points not between -500 and 500 then raise exception 'XP adjustments must be between -500 and 500 and cannot be zero'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 5 and 200 then raise exception 'Provide a 5–200 character reason for the adjustment'; end if;
 if not exists(select 1 from public.profiles where id=p_learner_id and role='learner') then raise exception 'Select a learner account'; end if;
 insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata,awarded_by)
 values(p_learner_id,'admin-adjust:'||gen_random_uuid()::text,'admin_adjustment',p_points,jsonb_build_object('reason',btrim(p_reason)),(select auth.uid()))
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.adjust_studyspace_learner_xp(uuid,integer,text) from public,anon;
grant execute on function public.adjust_studyspace_learner_xp(uuid,integer,text) to authenticated;
;