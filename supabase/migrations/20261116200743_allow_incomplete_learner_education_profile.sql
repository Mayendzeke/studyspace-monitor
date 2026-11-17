ALTER TABLE public.profiles DROP CONSTRAINT profiles_learner_education_level_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_learner_education_level_check CHECK (
  role <> 'learner'
  OR education_level = ''
  OR education_level = ANY (ARRAY['Primary','Secondary High','High School','Matric','Tertiary']::text[])
);