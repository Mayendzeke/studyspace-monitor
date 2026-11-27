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
  'SiSwati as a Second Language',
  'SiSwati',
  'exam_board_syllabus',
  'EGCSE SiSwati as a Second Language Syllabus — 2027–2029',
  'Examinations Council of Eswatini',
  'https://www.examscouncil.org.sz/upload-centre/syllabus/EGCSE%20Siswati%20as%20a%20Second%20Language%202027-2029%20Syllabus.pdf',
  '2027–2029',
  '2027–2029',
  'verified',
  now(),
  'Official ECESWA syllabus PDF for EGCSE SiSwati as a Second Language, 2027–2029. The syllabus distinguishes this route from First Language SiSwati; use it for candidates studying SiSwati as an additional language.',
  jsonb_build_object('exam_code','6871','official_index','https://www.examscouncil.org.sz/programmes/subject.php?id=44&programme=EGCSE')
WHERE NOT EXISTS (
  SELECT 1 FROM public.curriculum_reference_registry
  WHERE country='Eswatini' AND curriculum='EGCSE'
    AND subject_name='SiSwati as a Second Language'
    AND version_label='2027–2029'
);
