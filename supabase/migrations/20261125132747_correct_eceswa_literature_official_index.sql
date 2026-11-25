UPDATE public.curriculum_reference_registry
SET metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{official_index}',
  to_jsonb('https://www.examscouncil.org.sz/'::text),
  true
),
updated_at = now()
WHERE country = 'Eswatini'
  AND curriculum = 'EGCSE'
  AND subject_name = 'Literature in English'
  AND version_label = '2027–2029';
