-- Allow assigned learners to receive realtime notifications when a teacher
-- adds or removes them from a classroom session. RLS remains responsible
-- for which membership rows each user is allowed to see.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'class_session_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.class_session_members;
  END IF;
END
$$;
