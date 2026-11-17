revoke all privileges on table public.lab_generated_materials from anon, public;
revoke all privileges on table public.lab_practice_attempts from anon, public;
grant select, insert, update, delete on table public.lab_generated_materials to authenticated;
grant select, insert, update, delete on table public.lab_practice_attempts to authenticated;
create index if not exists ai_generation_usage_actor_purpose_created_idx
  on public.ai_generation_usage (actor_id, purpose, created_at desc);
