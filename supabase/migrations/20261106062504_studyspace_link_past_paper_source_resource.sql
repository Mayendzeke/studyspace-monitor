alter table public.exercise_sets
  add column if not exists source_resource_id uuid
  references public.learning_resources(id) on delete set null;

create index if not exists exercise_sets_source_resource_idx
  on public.exercise_sets(source_resource_id)
  where source_resource_id is not null;
