
insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
select p.id,'profile-complete','profile_completed',100,
  jsonb_build_object('milestone','academic_profile_completed','backfilled_on',timezone('Africa/Mbabane',now())::date)
from public.profiles p
where p.role='learner'
  and p.account_status='active'
  and btrim(coalesce(p.institution,''))<>''
  and btrim(coalesce(p.education_level,''))<>''
  and btrim(coalesce(p.grade,''))<>''
  and btrim(coalesce(p.curriculum,''))<>''
on conflict(learner_id,event_key) do nothing;
;