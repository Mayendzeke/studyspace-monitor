
alter table public.studyspace_notification_preferences
 add column if not exists mia_daily_nudges_enabled boolean not null default false,
 add column if not exists mia_morning_time time not null default '07:15',
 add column if not exists mia_afternoon_time time not null default '15:30',
 add column if not exists mia_evening_time time not null default '19:15',
 add column if not exists mia_nudge_timezone text not null default 'Africa/Mbabane';

create table if not exists public.student_mia_nudge_dispatch_log(
 learner_id uuid not null references public.profiles(id) on delete cascade,
 local_date date not null,
 slot text not null check(slot in ('morning','afternoon','evening')),
 claimed_at timestamptz not null default now(),
 primary key(learner_id,local_date,slot)
);
alter table public.student_mia_nudge_dispatch_log enable row level security;
drop policy if exists student_mia_nudge_dispatch_owner_read on public.student_mia_nudge_dispatch_log;
create policy student_mia_nudge_dispatch_owner_read on public.student_mia_nudge_dispatch_log
 for select to authenticated using(learner_id=(select auth.uid()));
revoke all on public.student_mia_nudge_dispatch_log from anon,authenticated;
grant select on public.student_mia_nudge_dispatch_log to authenticated;

create or replace function public.claim_due_studyspace_mia_nudges()
returns table(slot text,title text,body text)
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
 v_user uuid:=(select auth.uid());
 v_pref public.studyspace_notification_preferences%rowtype;
 v_name text; v_zone text; v_now timestamp; v_slot record;
 v_local_date date; v_start time; v_end time;
begin
 if v_user is null or not public.is_active_studyspace_learner() then return; end if;
 select * into v_pref from public.studyspace_notification_preferences where user_id=v_user;
 if not found or not v_pref.master_enabled or not v_pref.study_reminders or not v_pref.mia_daily_nudges_enabled then return; end if;
 select coalesce(nullif(preferred_name,''),nullif(full_name,''),'there') into v_name from public.profiles where id=v_user;
 v_zone:=coalesce(nullif(v_pref.mia_nudge_timezone,''),'Africa/Mbabane');
 begin v_now:=timezone(v_zone,now()); exception when others then v_zone:='Africa/Mbabane'; v_now:=timezone(v_zone,now()); end;
 v_local_date:=v_now::date;
 if v_pref.quiet_hours_enabled then
  v_start:=v_pref.quiet_hours_start; v_end:=v_pref.quiet_hours_end;
  if v_start=v_end or (v_start<v_end and v_now::time>=v_start and v_now::time<v_end)
    or (v_start>v_end and (v_now::time>=v_start or v_now::time<v_end)) then return; end if;
 end if;
 for v_slot in select * from (values
  ('morning'::text,v_pref.mia_morning_time,'Good morning, '||v_name||'!','Choose one realistic learning goal for today. MIΛ is ready to help you get started.'),
  ('afternoon'::text,v_pref.mia_afternoon_time,'A small study break, then one step','Pick one subject and focus for 20 minutes. Progress comes from steady practice, not rushing.'),
  ('evening'::text,v_pref.mia_evening_time,'Wrap up with MIΛ','Review one idea you learned today and choose tomorrow’s first task. Remember to make time to rest.')
 ) as n(slot,send_time,title,body)
 loop
  if v_now::time>=v_slot.send_time and v_now::time<v_slot.send_time+interval '30 minutes' then
   insert into public.student_mia_nudge_dispatch_log(learner_id,local_date,slot)
    values(v_user,v_local_date,v_slot.slot) on conflict do nothing;
   if found then return query select v_slot.slot,v_slot.title,v_slot.body; end if;
  end if;
 end loop;
end $$;
revoke all on function public.claim_due_studyspace_mia_nudges() from public,anon;
grant execute on function public.claim_due_studyspace_mia_nudges() to authenticated;
;