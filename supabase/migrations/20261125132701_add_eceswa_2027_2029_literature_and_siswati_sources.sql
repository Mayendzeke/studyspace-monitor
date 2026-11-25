INSERT INTO public.curriculum_reference_registry (
  country, authority_name, education_level, grade, curriculum, subject_name,
  language, source_type, title, publisher, source_url, version_label,
  academic_year, verified_status, last_checked_at, notes, metadata
)
SELECT
  'Eswatini',
  'Examinations Council of Eswatini',
  'Senior Secondary',
  'Form 4 / Form 5',
  'EGCSE',
  'Literature in English',
  'English',
  'exam_board_syllabus',
  'EGCSE Literature in English Syllabus 6875 — 2027–2029',
  'Examinations Council of Eswatini',
  'https://www.examscouncil.org.sz/upload-centre/syllabus/EGCSE%20Literature%20in%20English%202027-2029%20Syllabus.pdf',
  '2027–2029',
  '2027–2029',
  'verified',
  now(),
  'Official ECESWA syllabus PDF. Set texts, poems and prose requirements are defined for the 2027–2029 examination cycle.',
  jsonb_build_object('exam_code','6875','official_index','https://www.examscouncil.org.sz/programmes/subject.php?id=51&programme=EGCSE')
WHERE NOT EXISTS (
  SELECT 1 FROM public.curriculum_reference_registry
  WHERE country='Eswatini' AND curriculum='EGCSE'
    AND subject_name='Literature in English'
    AND version_label='2027–2029'
);

INSERT INTO public.curriculum_reference_registry (
  country, authority_name, education_level, grade, curriculum, subject_name,
  language, source_type, title, publisher, source_url, version_label,
  academic_year, verified_status, last_checked_at, notes, metadata
)
SELECT
  'Eswatini',
  'Examinations Council of Eswatini',
  'Senior Secondary',
  'Form 4 / Form 5',
  'EGCSE',
  'First Language SiSwati',
  'SiSwati',
  'exam_board_syllabus',
  'EGCSE First Language SiSwati Syllabus — 2027–2029',
  'Examinations Council of Eswatini',
  'https://www.examscouncil.org.sz/upload-centre/syllabus/EGCSE%20First%20Language%20SiSwati%202027-2029%20Syllabus.pdf',
  '2027–2029',
  '2027–2029',
  'verified',
  now(),
  'Official ECESWA syllabus link listed on the First Language SiSwati subject page for the 2027–2029 cycle. Confirm availability at point of use.',
  jsonb_build_object('exam_code','6870','official_index','https://www.examscouncil.org.sz/programmes/subject.php?id=43&programme=EGCSE')
WHERE NOT EXISTS (
  SELECT 1 FROM public.curriculum_reference_registry
  WHERE country='Eswatini' AND curriculum='EGCSE'
    AND subject_name='First Language SiSwati'
    AND version_label='2027–2029'
);
