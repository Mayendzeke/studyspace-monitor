alter table public.assessment_question_exposures
  add column if not exists cohort_key text not null default '',
  add column if not exists assessment_week date not null default current_date;
create index if not exists assessment_question_exposures_cohort_week_idx
  on public.assessment_question_exposures (cohort_key, assessment_week, question_id);
create unique index if not exists assessment_question_exposures_cohort_week_question_uidx
  on public.assessment_question_exposures (question_id, cohort_key, assessment_week);
