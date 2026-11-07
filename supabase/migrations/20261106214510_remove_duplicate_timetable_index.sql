-- Keep the pre-existing, equivalent timetable index and remove the duplicate added during rollout.
drop index if exists public.student_timetable_learner_kind_day_starts_idx;
