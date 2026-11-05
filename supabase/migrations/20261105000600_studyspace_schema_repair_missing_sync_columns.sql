-- Forward-only repair for two columns found missing during production verification.
-- Safe to apply more than once; existing rows and values are preserved.

alter table public.student_subjects
  add column if not exists period_ids jsonb not null default '[]'::jsonb;

alter table public.exercise_assignments
  add column if not exists available_at timestamptz not null default now();
