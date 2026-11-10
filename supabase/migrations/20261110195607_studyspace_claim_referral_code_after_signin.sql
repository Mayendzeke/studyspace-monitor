
create or replace function public.claim_studyspace_referral_code(p_code text)
returns text
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=(select auth.uid());
  v_referrer uuid;
  v_code text:=upper(left(btrim(coalesce(p_code,'')),10));
  v_existing public.student_referrals%rowtype;
begin
  if v_user is null or not public.is_active_studyspace_learner() then
    raise exception 'An active StudySpace learner account is required';
  end if;
  if v_code !~ '^[A-Z0-9]{10}$' then
    raise exception 'Enter a valid 10-character referral code';
  end if;

  select learner_id into v_referrer
  from public.student_referral_codes
  where code=v_code;
  if not found then raise exception 'That referral code could not be found'; end if;
  if v_referrer=v_user then raise exception 'You cannot use your own referral code'; end if;

  select * into v_existing
  from public.student_referrals
  where referred_id=v_user;
  if found then
    if v_existing.referral_code=v_code then return 'already_claimed'; end if;
    raise exception 'A referral code has already been claimed for this account';
  end if;

  insert into public.student_referrals(referrer_id,referred_id,referral_code)
  values(v_referrer,v_user,v_code)
  on conflict(referred_id) do nothing;

  perform private.qualify_studyspace_referral(v_user);
  return 'claimed';
end;
$$;
revoke all on function public.claim_studyspace_referral_code(text) from public,anon;
grant execute on function public.claim_studyspace_referral_code(text) to authenticated;
;