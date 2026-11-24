alter table public.student_subjects
  add column if not exists difficulty_level text not null default 'moderate',
  add column if not exists subject_type text not null default 'mixed',
  add column if not exists credit_hours numeric(5,2) not null default 1,
  add column if not exists weekly_minutes_target integer not null default 60;
alter table public.student_subjects
  drop constraint if exists student_subjects_difficulty_level_check,
  drop constraint if exists student_subjects_subject_type_check,
  drop constraint if exists student_subjects_credit_hours_check,
  drop constraint if exists student_subjects_weekly_minutes_target_check;
alter table public.student_subjects
  add constraint student_subjects_difficulty_level_check check (difficulty_level in ('very_low','low','moderate','high','very_high')),
  add constraint student_subjects_subject_type_check check (subject_type in ('calculation','practical','essay','theory','memorisation','language','mixed')),
  add constraint student_subjects_credit_hours_check check (credit_hours > 0 and credit_hours <= 60),
  add constraint student_subjects_weekly_minutes_target_check check (weekly_minutes_target between 10 and 1200);
