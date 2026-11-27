UPDATE public.curriculum_reference_registry
SET
  notes = 'Official ECESWA EGCSE SiSwati as a Second Language syllabus for the November 2027 to November 2029 examination sessions. Intended for learners whose mother tongue is not SiSwati. The course develops practical listening, speaking, reading and writing. Assessment: Paper 1 Reading and Directed Writing, 2 hours 15 minutes, 70 marks, 50%; Paper 2 Listening, approximately 45 minutes, 40 marks, 25%; Paper 3 Speaking, approximately 15 minutes, 30 marks, 25%. All three papers are compulsory. This is an official syllabus summary for tutor alignment; consult the linked PDF for full specifications and do not infer unlisted requirements.',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'assessment_structure',
    jsonb_build_object(
      'paper_1', jsonb_build_object('name','Reading and Directed Writing','duration_minutes',135,'marks',70,'weighting_percent',50),
      'paper_2', jsonb_build_object('name','Listening','duration_minutes',45,'marks',40,'weighting_percent',25),
      'paper_3', jsonb_build_object('name','Speaking','duration_minutes',15,'marks',30,'weighting_percent',25),
      'all_papers_compulsory', true
    ),
    'skills', jsonb_build_array('listening','speaking','reading','writing'),
    'mother_tongue_route', 'SiSwati as a Second Language is intended for learners whose mother tongue is not SiSwati.',
    'source_scope', 'Summary metadata only; consult the official linked PDF for full syllabus requirements.'
  ),
  last_checked_at = now(),
  updated_at = now()
WHERE country = 'Eswatini'
  AND curriculum = 'EGCSE'
  AND subject_name = 'SiSwati as a Second Language'
  AND version_label = '2027–2029'
  AND source_url = 'https://www.examscouncil.org.sz/upload-centre/syllabus/EGCSE%20Siswati%20as%20a%20Second%20Language%202027-2029%20Syllabus.pdf';
