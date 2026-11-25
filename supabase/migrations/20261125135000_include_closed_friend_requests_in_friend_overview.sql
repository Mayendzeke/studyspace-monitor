CREATE OR REPLACE FUNCTION public.get_studyspace_friend_overview()
RETURNS TABLE (
  request_id uuid,
  learner_id uuid,
  display_name text,
  institution text,
  education_level text,
  grade text,
  curriculum text,
  country text,
  status text,
  direction text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF NOT public.is_active_studyspace_learner() THEN
    RAISE EXCEPTION 'An active learner account is required';
  END IF;
  IF NOT private.studyspace_peer_chat_eligible(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    p.id,
    coalesce(nullif(btrim(p.preferred_name),''), nullif(btrim(p.full_name),''), 'Student'),
    coalesce(p.institution,''),
    coalesce(p.education_level,''),
    coalesce(p.grade,''),
    coalesce(p.curriculum,''),
    coalesce(p.country,''),
    c.status,
    CASE
      WHEN c.status='accepted' THEN 'friend'
      WHEN c.status='rejected' THEN 'closed'
      WHEN c.addressee_id=auth.uid() THEN 'incoming'
      ELSE 'outgoing'
    END,
    c.created_at
  FROM public.student_connections c
  JOIN public.profiles p
    ON p.id = CASE WHEN c.requester_id=auth.uid() THEN c.addressee_id ELSE c.requester_id END
  WHERE (c.requester_id=auth.uid() OR c.addressee_id=auth.uid())
    AND c.status IN ('pending','accepted','rejected')
    AND p.role='learner'
    AND p.account_status='active'
    AND private.studyspace_peer_chat_eligible(p.id)
  ORDER BY CASE WHEN c.status='accepted' THEN 0 WHEN c.status='pending' THEN 1 ELSE 2 END,
    lower(coalesce(p.preferred_name,p.full_name,'')), c.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_studyspace_friend_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_studyspace_friend_overview() TO authenticated;
