alter table public.student_feedback
  add column if not exists testimonial_background text;

alter table public.student_feedback
  drop constraint if exists student_feedback_testimonial_background_check;

alter table public.student_feedback
  add constraint student_feedback_testimonial_background_check
  check (
    testimonial_background is null
    or testimonial_background in ('ocean', 'violet', 'sunset', 'emerald', 'rose', 'gold', 'midnight')
  );

comment on column public.student_feedback.testimonial_background is
  'Learner-selected visual background theme for an opted-in testimonial marketing card; not a profile or identity field.';
