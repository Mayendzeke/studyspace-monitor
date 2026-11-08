-- Preserve the already-present guardian verifier foreign-key index in migration source control.
create index if not exists guardian_verifications_verified_by_idx
  on public.guardian_verifications (verified_by);
