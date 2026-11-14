
-- Cover both profile foreign keys on the student access PIN ledger.
-- These indexes keep profile restriction/set-null checks from scanning the table.
create index if not exists student_access_pins_created_by_idx
  on public.student_access_pins (created_by);

create index if not exists student_access_pins_redeemed_by_idx
  on public.student_access_pins (redeemed_by);
