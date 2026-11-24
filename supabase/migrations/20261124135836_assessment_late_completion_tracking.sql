alter table public.exercise_attempts
  add column if not exists submitted_late boolean not null default false,
  add column if not exists minutes_late integer not null default 0;
alter table public.exercise_attempts
  drop constraint if exists exercise_attempts_minutes_late_nonnegative;
alter table public.exercise_attempts
  add constraint exercise_attempts_minutes_late_nonnegative check (minutes_late >= 0);
