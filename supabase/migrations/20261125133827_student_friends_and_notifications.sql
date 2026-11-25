-- Student-facing Friends discovery, relationship summary and persistent notifications.
ALTER TABLE public.studyspace_notification_preferences
  ADD COLUMN IF NOT EXISTS friend_requests boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.studyspace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'friend_request','friend_accepted','direct_message','group_message',
    'homework_assignment','assessment_update','system_announcement','timetable_update'
  )),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 140),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  action_page text NOT NULL DEFAULT 'Friends'
    CHECK (action_page IN ('Friends','Messages','Study & Exams','Academic Calendar','Timetable','Overview')),
  entity_id uuid,
  event_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS studyspace_notifications_user_created_idx
  ON public.studyspace_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studyspace_notifications_user_unread_idx
  ON public.studyspace_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.studyspace_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studyspace_notifications FROM public, anon;
GRANT SELECT ON public.studyspace_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.studyspace_notifications TO authenticated;
DROP POLICY IF EXISTS studyspace_notifications_read_own ON public.studyspace_notifications;
CREATE POLICY studyspace_notifications_read_own
  ON public.studyspace_notifications FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) AND (select public.is_active_studyspace_learner()));
DROP POLICY IF EXISTS studyspace_notifications_mark_own ON public.studyspace_notifications;
CREATE POLICY studyspace_notifications_mark_own
  ON public.studyspace_notifications FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()) AND (select public.is_active_studyspace_learner()))
  WITH CHECK (user_id = (select auth.uid()) AND (select public.is_active_studyspace_learner()));

CREATE OR REPLACE FUNCTION private.emit_studyspace_notification(
  p_user_id uuid, p_category text, p_title text, p_body text,
  p_action_page text, p_entity_id uuid, p_event_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  allowed boolean := true;
  prefs public.studyspace_notification_preferences%rowtype;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'learner' AND account_status = 'active'
  ) THEN RETURN; END IF;

  SELECT * INTO prefs FROM public.studyspace_notification_preferences WHERE user_id = p_user_id;
  IF FOUND THEN
    IF NOT prefs.master_enabled THEN RETURN; END IF;
    CASE p_category
      WHEN 'friend_request' THEN allowed := prefs.friend_requests;
      WHEN 'friend_accepted' THEN allowed := prefs.friend_requests;
      WHEN 'direct_message' THEN allowed := prefs.direct_messages;
      WHEN 'group_message' THEN allowed := prefs.group_messages;
      WHEN 'homework_assignment' THEN allowed := prefs.homework_assignments;
      WHEN 'assessment_update' THEN allowed := prefs.assessment_updates;
      WHEN 'system_announcement' THEN allowed := prefs.system_announcements;
      WHEN 'timetable_update' THEN allowed := prefs.timetable_updates;
      ELSE allowed := true;
    END CASE;
  END IF;
  IF NOT coalesce(allowed, true) THEN RETURN; END IF;

  INSERT INTO public.studyspace_notifications (
    user_id, category, title, body, action_page, entity_id, event_key
  )
  VALUES (
    p_user_id, p_category,
    left(coalesce(nullif(btrim(p_title), ''), 'StudySpace update'), 140),
    left(coalesce(p_body, ''), 500),
    CASE WHEN p_action_page IN ('Friends','Messages','Study & Exams','Academic Calendar','Timetable','Overview')
      THEN p_action_page ELSE 'Friends' END,
    p_entity_id, p_event_key
  )
  ON CONFLICT (event_key) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION private.emit_studyspace_notification(uuid,text,text,text,text,uuid,text)
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_studyspace_friend_connection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE person_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT coalesce(nullif(btrim(preferred_name),''), nullif(btrim(full_name),''), 'A StudySpace learner')
      INTO person_name FROM public.profiles WHERE id = NEW.requester_id;
    PERFORM private.emit_studyspace_notification(
      NEW.addressee_id, 'friend_request', 'New friend request',
      person_name || ' wants to connect with you.', 'Friends', NEW.id,
      'friend-request:' || NEW.id::text || ':' || NEW.addressee_id::text
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'accepted' THEN
    SELECT coalesce(nullif(btrim(preferred_name),''), nullif(btrim(full_name),''), 'Your friend')
      INTO person_name FROM public.profiles WHERE id = NEW.addressee_id;
    PERFORM private.emit_studyspace_notification(
      NEW.requester_id, 'friend_accepted', 'Friend request accepted',
      person_name || ' accepted your friend request.', 'Friends', NEW.id,
      'friend-accepted:' || NEW.id::text || ':' || NEW.requester_id::text
    );
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_studyspace_friend_connection() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS studyspace_friend_connection_notification ON public.student_connections;
CREATE TRIGGER studyspace_friend_connection_notification
AFTER INSERT OR UPDATE OF status ON public.student_connections
FOR EACH ROW EXECUTE FUNCTION public.notify_studyspace_friend_connection();

CREATE OR REPLACE FUNCTION public.notify_studyspace_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE sender_name text; excerpt text;
BEGIN
  SELECT coalesce(nullif(btrim(preferred_name),''), nullif(btrim(full_name),''), 'A StudySpace learner')
    INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  excerpt := CASE
    WHEN NEW.attachment_path IS NOT NULL THEN 'Sent an attachment: ' || coalesce(nullif(NEW.attachment_name,''), 'file')
    ELSE coalesce(nullif(left(btrim(NEW.body), 110), ''), 'Sent you a message')
  END;
  PERFORM private.emit_studyspace_notification(
    NEW.recipient_id, 'direct_message', 'New message from ' || sender_name,
    excerpt, 'Messages', NEW.id,
    'direct-message:' || NEW.id::text || ':' || NEW.recipient_id::text
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_studyspace_direct_message() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS studyspace_direct_message_notification ON public.direct_messages;
CREATE TRIGGER studyspace_direct_message_notification
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_studyspace_direct_message();

CREATE OR REPLACE FUNCTION public.notify_studyspace_group_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE sender_name text; group_name text; member record; excerpt text;
BEGIN
  SELECT coalesce(nullif(btrim(preferred_name),''), nullif(btrim(full_name),''), 'A group member')
    INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT name INTO group_name FROM public.studyspace_groups WHERE id = NEW.group_id;
  excerpt := CASE
    WHEN NEW.attachment_path IS NOT NULL THEN 'Shared an attachment'
    ELSE coalesce(nullif(left(btrim(NEW.body), 110), ''), 'Sent a group message')
  END;

  FOR member IN
    SELECT gm.learner_id
    FROM public.studyspace_group_members gm
    JOIN public.profiles p ON p.id = gm.learner_id
    WHERE gm.group_id = NEW.group_id AND gm.learner_id <> NEW.sender_id
      AND gm.membership_status = 'active' AND p.role = 'learner' AND p.account_status = 'active'
      AND private.studyspace_peer_chat_eligible(gm.learner_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.studyspace_group_notification_preferences gp
        WHERE gp.user_id = gm.learner_id AND gp.group_id = NEW.group_id AND gp.muted
      )
  LOOP
    PERFORM private.emit_studyspace_notification(
      member.learner_id, 'group_message', 'New message in ' || coalesce(group_name, 'your group'),
      sender_name || ': ' || excerpt, 'Messages', NEW.id,
      'group-message:' || NEW.id::text || ':' || member.learner_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_studyspace_group_message() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS studyspace_group_message_notification ON public.studyspace_group_messages;
CREATE TRIGGER studyspace_group_message_notification
AFTER INSERT ON public.studyspace_group_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_studyspace_group_message();

CREATE OR REPLACE FUNCTION public.notify_studyspace_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE exercise_title text; exercise_subject text; notification_category text;
BEGIN
  IF NEW.assigned_by = NEW.learner_id OR NEW.available_at > now() THEN RETURN NEW; END IF;
  SELECT title, subject_name INTO exercise_title, exercise_subject
  FROM public.exercise_sets WHERE id = NEW.exercise_set_id;
  notification_category := CASE WHEN NEW.assignment_type = 'scheduled_assessment'
    THEN 'assessment_update' ELSE 'homework_assignment' END;
  PERFORM private.emit_studyspace_notification(
    NEW.learner_id, notification_category,
    CASE WHEN notification_category = 'assessment_update' THEN 'New assessment available' ELSE 'New learning task assigned' END,
    coalesce(nullif(exercise_title,''), coalesce(nullif(exercise_subject,''), 'A new activity')) ||
      CASE WHEN coalesce(exercise_subject,'') <> '' THEN ' · ' || exercise_subject ELSE '' END,
    'Study & Exams', NEW.id,
    'exercise-assignment:' || NEW.id::text || ':' || NEW.learner_id::text
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_studyspace_assignment() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS studyspace_assignment_notification ON public.exercise_assignments;
CREATE TRIGGER studyspace_assignment_notification
AFTER INSERT ON public.exercise_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_studyspace_assignment();

CREATE OR REPLACE FUNCTION public.notify_studyspace_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE learner record;
BEGIN
  IF NEW.is_published IS DISTINCT FROM true
    OR (NEW.expires_at IS NOT NULL AND NEW.expires_at <= now())
    OR (TG_OP = 'UPDATE' AND OLD.is_published IS NOT DISTINCT FROM NEW.is_published
        AND OLD.published_at IS NOT DISTINCT FROM NEW.published_at) THEN
    RETURN NEW;
  END IF;
  FOR learner IN
    SELECT id FROM public.profiles WHERE role = 'learner' AND account_status = 'active'
  LOOP
    PERFORM private.emit_studyspace_notification(
      learner.id, 'system_announcement', NEW.title, NEW.body,
      'Overview', NEW.id, 'announcement:' || NEW.id::text || ':' || learner.id::text
    );
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_studyspace_announcement() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS studyspace_announcement_notification ON public.studyspace_announcements;
CREATE TRIGGER studyspace_announcement_notification
AFTER INSERT OR UPDATE OF is_published, published_at, expires_at ON public.studyspace_announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_studyspace_announcement();

CREATE OR REPLACE FUNCTION public.get_studyspace_friend_overview()
RETURNS TABLE (
  request_id uuid, learner_id uuid, display_name text, institution text, education_level text,
  grade text, curriculum text, country text, status text, direction text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF NOT public.is_active_studyspace_learner() THEN RAISE EXCEPTION 'An active learner account is required'; END IF;
  IF NOT private.studyspace_peer_chat_eligible(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, p.id,
    coalesce(nullif(btrim(p.preferred_name),''), nullif(btrim(p.full_name),''), 'Student'),
    coalesce(p.institution,''), coalesce(p.education_level,''), coalesce(p.grade,''),
    coalesce(p.curriculum,''), coalesce(p.country,''), c.status,
    CASE WHEN c.status='accepted' THEN 'friend'
      WHEN c.addressee_id=auth.uid() THEN 'incoming' ELSE 'outgoing' END,
    c.created_at
  FROM public.student_connections c
  JOIN public.profiles p
    ON p.id = CASE WHEN c.requester_id=auth.uid() THEN c.addressee_id ELSE c.requester_id END
  WHERE (c.requester_id=auth.uid() OR c.addressee_id=auth.uid())
    AND c.status IN ('pending','accepted')
    AND p.role='learner' AND p.account_status='active'
    AND private.studyspace_peer_chat_eligible(p.id)
  ORDER BY CASE WHEN c.status='accepted' THEN 0 ELSE 1 END,
    lower(coalesce(p.preferred_name,p.full_name,'')), c.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_studyspace_friend_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_studyspace_friend_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_studyspace_friend_suggestions(p_limit integer DEFAULT 12)
RETURNS TABLE (
  learner_id uuid, display_name text, institution text, education_level text,
  grade text, curriculum text, country text, shared_subjects integer, can_invite boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, private, pg_temp
AS $function$
DECLARE me public.profiles%rowtype; safe_limit integer := least(greatest(coalesce(p_limit,12),1),24);
BEGIN
  IF NOT public.is_active_studyspace_learner() THEN RAISE EXCEPTION 'An active learner account is required'; END IF;
  IF NOT private.studyspace_peer_chat_eligible(auth.uid()) THEN RETURN; END IF;
  SELECT * INTO me FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id,
    coalesce(nullif(btrim(p.preferred_name),''), nullif(btrim(p.full_name),''), 'Student'),
    coalesce(p.institution,''), coalesce(p.education_level,''), coalesce(p.grade,''),
    coalesce(p.curriculum,''), coalesce(p.country,''),
    (SELECT count(*)::integer FROM public.student_subjects mine
      JOIN public.student_subjects theirs ON lower(btrim(mine.name))=lower(btrim(theirs.name))
      WHERE mine.learner_id=auth.uid() AND theirs.learner_id=p.id),
    true
  FROM public.profiles p
  WHERE p.role='learner' AND p.account_status='active' AND p.id<>auth.uid()
    AND private.studyspace_peer_chat_eligible(p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.student_connections c
      WHERE (c.requester_id=auth.uid() AND c.addressee_id=p.id)
         OR (c.addressee_id=auth.uid() AND c.requester_id=p.id)
    )
  ORDER BY
    CASE WHEN nullif(btrim(me.institution),'') IS NOT NULL
      AND lower(btrim(p.institution))=lower(btrim(me.institution)) THEN 0 ELSE 1 END,
    CASE WHEN nullif(btrim(me.grade),'') IS NOT NULL
      AND lower(btrim(p.grade))=lower(btrim(me.grade)) THEN 0 ELSE 1 END,
    CASE WHEN nullif(btrim(me.curriculum),'') IS NOT NULL
      AND lower(btrim(p.curriculum))=lower(btrim(me.curriculum)) THEN 0 ELSE 1 END,
    (SELECT count(*)::integer FROM public.student_subjects mine
      JOIN public.student_subjects theirs ON lower(btrim(mine.name))=lower(btrim(theirs.name))
      WHERE mine.learner_id=auth.uid() AND theirs.learner_id=p.id) DESC,
    lower(coalesce(p.preferred_name,p.full_name,'')) LIMIT safe_limit;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_studyspace_friend_suggestions(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_studyspace_friend_suggestions(integer) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='studyspace_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.studyspace_notifications;
  END IF;
END $$;
