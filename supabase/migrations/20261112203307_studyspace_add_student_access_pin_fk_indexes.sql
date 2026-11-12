-- Cover the creator and redeemer profile foreign keys on student access PIN records.
-- Existing indexes cover learner_id and pin_hash, but not these two FK columns.
create index if not exists student_access_pins_created_by_idx
  on public.student_access_pins (created_by);

create index if not exists student_access_pins_redeemed_by_idx
  on public.student_access_pins (redeemed_by);
