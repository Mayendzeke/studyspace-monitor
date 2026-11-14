-- AI-assisted assessment marking, live-class homework results and per-learner storage quotas.
-- Objective answers remain deterministic. AI-written marks are confidence-gated and
-- uncertain work is routed to the teacher's review queue.

alter table public.exercise_attempts
  add column if not exists marking_status text not null default 'not_required',
  add column if not exists marking_details jsonb not null default '{}'::jsonb,
  add column if not exists ai_marked_at timestamptz,
  add column if not exists teacher_review_required boolean not null default false;
alter table public.exercise_attempts drop constraint if exists exercise_attempts_marking_status_check;
alter table public.exercise_attempts add constraint exercise_attempts_marking_status_check
  check (marking_status in ('not_required','ai_marked','teacher_review','teacher_marked'));
create index if not exists exercise_attempts_review_queue_idx
  on public.exercise_attempts(teacher_review_required, submitted_at desc);

alter table public.session_homework
  add column if not exists total_points numeric not null default 10,
  add column if not exists marking_rubric text not null default '';
alter table public.session_homework drop constraint if exists session_homework_total_points_check;
alter table public.session_homework add constraint session_homework_total_points_check
  check (total_points between 1 and 100);

alter table public.session_homework_submissions
  add column if not exists ai_score numeric,
  add column if not exists total_points numeric not null default 10,
  add column if not exists ai_feedback text not null default '',
  add column if not exists ai_marking_status text not null default 'pending',
  add column if not exists ai_marked_at timestamptz,
  add column if not exists ai_marking_details jsonb not null default '{}'::jsonb,
  add column if not exists teacher_feedback text not null default '',
  add column if not exists teacher_score numeric,
  add column if not exists marked_by uuid references public.profiles(id),
  add column if not exists marked_at timestamptz;
alter table public.session_homework_submissions drop constraint if exists session_homework_submissions_ai_marking_status_check;
alter table public.session_homework_submissions add constraint session_homework_submissions_ai_marking_status_check
  check (ai_marking_status in ('pending','ai_marked','teacher_review','teacher_marked','marking_failed'));
alter table public.session_homework_submissions drop constraint if exists session_homework_submissions_mark_range_check;
alter table public.session_homework_submissions add constraint session_homework_submissions_mark_range_check
  check ((ai_score is null or (ai_score >= 0 and ai_score <= total_points))
    and (teacher_score is null or (teacher_score >= 0 and teacher_score <= total_points)));
create index if not exists session_homework_submissions_marking_idx
  on public.session_homework_submissions(ai_marking_status, submitted_at desc);

-- Default learner allocation is 1 GiB. Admins may increase it up to 20 GiB.
create table if not exists public.learner_storage_quotas (
  learner_id uuid primary key references public.profiles(id) on delete cascade,
  quota_bytes bigint not null check (quota_bytes between 104857600 and 21474836480),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.learner_storage_quotas enable row level security;
drop policy if exists learner_storage_quotas_read_self_or_admin on public.learner_storage_quotas;
create policy learner_storage_quotas_read_self_or_admin
  on public.learner_storage_quotas for select to authenticated
  using (learner_id = auth.uid() or public.is_studyspace_admin());
revoke insert, update, delete on public.learner_storage_quotas from anon, authenticated;
grant select on public.learner_storage_quotas to authenticated;

create table if not exists public.learner_storage_reservations (
  learner_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null,
  file_size bigint not null check (file_size > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (learner_id, object_path)
);
create index if not exists learner_storage_reservations_expiry_idx
  on public.learner_storage_reservations(learner_id, expires_at);
alter table public.learner_storage_reservations enable row level security;
revoke all on public.learner_storage_reservations from public, anon, authenticated;

create or replace function public.get_studyspace_storage_status(p_learner_id uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_learner uuid;
  v_quota bigint;
  v_used bigint;
  v_reserved bigint;
begin
  if v_actor is null then raise exception 'Authentication is required' using errcode = '28000'; end if;
  v_learner := coalesce(p_learner_id, v_actor);
  if v_learner <> v_actor then
    if not public.is_studyspace_admin() or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
      raise exception 'Administrator access with verified MFA is required' using errcode = '42501';
    end if;
  elsif not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required' using errcode = '42501';
  end if;
  select coalesce(q.quota_bytes,1073741824) into v_quota
    from (select 1) seed left join public.learner_storage_quotas q on q.learner_id = v_learner;
  select coalesce(sum(r.file_size),0)::bigint into v_used
    from public.learner_personal_resources r where r.learner_id = v_learner;
  select coalesce(sum(res.file_size),0)::bigint into v_reserved
    from public.learner_storage_reservations res
    where res.learner_id = v_learner and res.expires_at > now()
      and not exists (select 1 from public.learner_personal_resources r
        where r.learner_id = v_learner and r.storage_path = res.object_path);
  return jsonb_build_object(
    'learner_id',v_learner,'used_bytes',v_used,'quota_bytes',v_quota,
    'reserved_bytes',v_reserved,'available_bytes',greatest(0,v_quota-v_used-v_reserved),
    'used_percent',case when v_quota>0 then round(((v_used+v_reserved)::numeric/v_quota::numeric)*100,1) else 0 end
  );
end;
$function$;

create or replace function public.set_studyspace_learner_storage_quota(p_learner_id uuid,p_quota_bytes bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_used bigint; v_reserved bigint;
begin
  if auth.uid() is null or not public.is_studyspace_admin() or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Administrator access with verified MFA is required' using errcode = '42501';
  end if;
  if p_quota_bytes < 1073741824 or p_quota_bytes > 21474836480 then
    raise exception 'Storage quota must be between 1 GiB and 20 GiB' using errcode = '22023';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_learner_id and p.role='learner') then
    raise exception 'Learner account was not found' using errcode = 'P0002';
  end if;
  select coalesce(sum(file_size),0)::bigint into v_used
    from public.learner_personal_resources where learner_id=p_learner_id;
  select coalesce(sum(res.file_size),0)::bigint into v_reserved
    from public.learner_storage_reservations res
    where res.learner_id=p_learner_id and res.expires_at>now()
      and not exists(select 1 from public.learner_personal_resources r
        where r.learner_id=p_learner_id and r.storage_path=res.object_path);
  if p_quota_bytes < v_used+v_reserved then
    raise exception 'The new quota cannot be lower than storage already used or reserved' using errcode = '22023';
  end if;
  insert into public.learner_storage_quotas(learner_id,quota_bytes,updated_by,updated_at)
  values(p_learner_id,p_quota_bytes,auth.uid(),now())
  on conflict(learner_id) do update set quota_bytes=excluded.quota_bytes,updated_by=excluded.updated_by,updated_at=now();
  return public.get_studyspace_storage_status(p_learner_id);
end;
$function$;

create or replace function public.reserve_studyspace_personal_storage(p_object_path text,p_file_size bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_learner uuid := auth.uid(); v_quota bigint; v_used bigint; v_reserved bigint;
  v_existing bigint := 0; v_extra bigint;
begin
  if v_learner is null or not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required' using errcode = '42501';
  end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 104857600 then
    raise exception 'Each personal file must be between 1 byte and 100 MiB' using errcode = '22023';
  end if;
  if p_object_path is null or left(p_object_path,length(v_learner::text||'/personal/')) <> v_learner::text||'/personal/'
    or array_length(string_to_array(p_object_path,'/'),1) < 4 then
    raise exception 'Invalid personal storage path' using errcode = '22023';
  end if;
  perform 1 from public.profiles p where p.id=v_learner and p.role='learner' and p.account_status='active' for update;
  if not found then raise exception 'An active learner account is required' using errcode = '42501'; end if;
  select coalesce(q.quota_bytes,1073741824) into v_quota
    from (select 1) seed left join public.learner_storage_quotas q on q.learner_id=v_learner;
  select coalesce(sum(r.file_size),0)::bigint into v_used
    from public.learner_personal_resources r where r.learner_id=v_learner;
  select coalesce(r.file_size,0)::bigint into v_existing from public.learner_personal_resources r
    where r.learner_id=v_learner and r.storage_path=p_object_path;
  select coalesce(sum(res.file_size),0)::bigint into v_reserved
    from public.learner_storage_reservations res
    where res.learner_id=v_learner and res.expires_at>now() and res.object_path<>p_object_path
      and not exists(select 1 from public.learner_personal_resources r
        where r.learner_id=v_learner and r.storage_path=res.object_path);
  v_extra:=greatest(0,p_file_size-v_existing);
  if v_used+v_reserved+v_extra>v_quota then
    raise exception 'Storage limit reached. Delete unused files or ask your StudySpace administrator to increase your quota.' using errcode = '54000';
  end if;
  insert into public.learner_storage_reservations(learner_id,object_path,file_size,expires_at,created_at)
  values(v_learner,p_object_path,p_file_size,now()+interval '20 minutes',now())
  on conflict(learner_id,object_path) do update set file_size=excluded.file_size,expires_at=excluded.expires_at,created_at=now();
  return jsonb_build_object('reserved',true,'reserved_bytes',p_file_size,'available_after_reservation',greatest(0,v_quota-v_used-v_reserved-v_extra));
end;
$function$;

create or replace function public.complete_studyspace_personal_storage_upload(p_object_path text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_learner uuid:=auth.uid();
begin
  if v_learner is null then raise exception 'Authentication is required' using errcode='28000'; end if;
  if not exists(select 1 from public.learner_personal_resources r where r.learner_id=v_learner and r.storage_path=p_object_path) then
    raise exception 'The cloud file record has not been saved yet' using errcode='P0002';
  end if;
  delete from public.learner_storage_reservations where learner_id=v_learner and object_path=p_object_path;
  return true;
end;
$function$;

create or replace function public.release_studyspace_personal_storage_reservation(p_object_path text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_learner uuid:=auth.uid();
begin
  if v_learner is null then raise exception 'Authentication is required' using errcode='28000'; end if;
  delete from public.learner_storage_reservations where learner_id=v_learner and object_path=p_object_path;
  return true;
end;
$function$;

create or replace function public.can_upload_studyspace_personal_object(p_object_path text,p_file_size bigint)
returns boolean language sql security definer set search_path = ''
as $function$
  select auth.uid() is not null and public.is_active_studyspace_learner()
    and p_object_path like (auth.uid()::text||'/personal/%')
    and exists(select 1 from public.learner_storage_reservations res
      where res.learner_id=auth.uid() and res.object_path=p_object_path
        and res.expires_at>now() and res.file_size=p_file_size);
$function$;

revoke all on function public.get_studyspace_storage_status(uuid) from public,anon;
revoke all on function public.set_studyspace_learner_storage_quota(uuid,bigint) from public,anon;
revoke all on function public.reserve_studyspace_personal_storage(text,bigint) from public,anon;
revoke all on function public.complete_studyspace_personal_storage_upload(text) from public,anon;
revoke all on function public.release_studyspace_personal_storage_reservation(text) from public,anon;
revoke all on function public.can_upload_studyspace_personal_object(text,bigint) from public,anon;
grant execute on function public.get_studyspace_storage_status(uuid) to authenticated;
grant execute on function public.set_studyspace_learner_storage_quota(uuid,bigint) to authenticated;
grant execute on function public.reserve_studyspace_personal_storage(text,bigint) to authenticated;
grant execute on function public.complete_studyspace_personal_storage_upload(text) to authenticated;
grant execute on function public.release_studyspace_personal_storage_reservation(text) to authenticated;
grant execute on function public.can_upload_studyspace_personal_object(text,bigint) to authenticated;

drop policy if exists "studyspace_personal_files_owner_manage" on storage.objects;
create policy "studyspace_personal_files_owner_manage"
  on storage.objects for all to authenticated
  using (bucket_id='studyspace-resources'
    and (storage.foldername(name))[1]=auth.uid()::text
    and (storage.foldername(name))[2]='personal'
    and public.is_active_studyspace_learner())
  with check (bucket_id='studyspace-resources'
    and (storage.foldername(name))[1]=auth.uid()::text
    and (storage.foldername(name))[2]='personal'
    and public.can_upload_studyspace_personal_object(name,coalesce(nullif(metadata->>'size','')::bigint,0)));

drop policy if exists session_homework_submissions_admin_mark on public.session_homework_submissions;
create policy session_homework_submissions_admin_mark
  on public.session_homework_submissions for update to authenticated
  using(public.is_studyspace_admin()) with check(public.is_studyspace_admin());
grant update on public.session_homework_submissions to authenticated;


-- Keep the learner academic record in lock-step with authoritative attempts.
-- A single progress event per submitted attempt is updated when teacher marks change.
with ranked as (
  select ctid,
    row_number() over (
      partition by learner_id, metadata->>'attempt_id'
      order by created_at desc, ctid desc
    ) as position
  from public.progress_events
  where event_type='assigned_assessment' and metadata ? 'attempt_id'
)
delete from public.progress_events e using ranked r
where e.ctid=r.ctid and r.position>1;

create unique index if not exists progress_events_one_assigned_attempt
  on public.progress_events(learner_id,(metadata->>'attempt_id'))
  where event_type='assigned_assessment' and metadata ? 'attempt_id';

create or replace function public.sync_studyspace_assessment_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.total_points <= 0 then return new; end if;
  insert into public.progress_events(learner_id,event_type,score,max_score,metadata)
  values(
    new.learner_id,
    'assigned_assessment',
    new.score,
    new.total_points,
    jsonb_build_object(
      'assignment_id',new.assignment_id,
      'attempt_id',new.id,
      'marking_status',new.marking_status,
      'teacher_review_required',new.teacher_review_required,
      'ai_marked_at',new.ai_marked_at,
      'teacher_marked_at',new.marked_at
    )
  )
  on conflict(learner_id,(metadata->>'attempt_id'))
    where event_type='assigned_assessment' and metadata ? 'attempt_id'
  do update set
    score=excluded.score,
    max_score=excluded.max_score,
    metadata=coalesce(public.progress_events.metadata,'{}'::jsonb)||excluded.metadata,
    created_at=now();
  return new;
end;
$function$;
revoke all on function public.sync_studyspace_assessment_progress() from public,anon,authenticated;
drop trigger if exists studyspace_sync_assessment_progress on public.exercise_attempts;
create trigger studyspace_sync_assessment_progress
  after insert or update of score,total_points,marking_status,marking_details,teacher_review_required,ai_marked_at,marked_at
  on public.exercise_attempts
  for each row execute function public.sync_studyspace_assessment_progress();
