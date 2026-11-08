-- Keep the private student feedback inbox on the Realtime publication.
-- The guard also makes local rebuilds safe when the table is already published.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_feedback'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_feedback;
  END IF;
END
$$;
