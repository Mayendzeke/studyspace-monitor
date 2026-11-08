-- Harden the school homework request intake path and fix photo suffix matching.
alter table public.homework_help_requests
  drop constraint if exists homework_help_photo_path;
alter table public.homework_help_requests
  add constraint homework_help_photo_path
  check (
    image_path is null
    or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp)$'
  );

create index if not exists homework_help_teacher_idx
  on public.homework_help_requests(teacher_id)
  where teacher_id is not null;

create or replace function public.set_studyspace_homework_request_defaults()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.created_at := now();
  new.updated_at := now();
  new.fallback_due_at := now() + interval '2 minutes';
  new.status := 'waiting_for_teacher';
  new.fallback_attempts := 0;
  new.mia_response := null;
  new.mia_replied_at := null;
  new.teacher_response := null;
  new.teacher_id := null;
  new.teacher_replied_at := null;
  new.last_fallback_error := null;
  return new;
end;
$function$;
revoke all on function public.set_studyspace_homework_request_defaults() from public, anon, authenticated, service_role;
drop trigger if exists set_studyspace_homework_request_defaults on public.homework_help_requests;
create trigger set_studyspace_homework_request_defaults
  before insert on public.homework_help_requests
  for each row execute function public.set_studyspace_homework_request_defaults();

drop policy if exists homework_help_learner_select_own on public.homework_help_requests;
create policy homework_help_learner_select_own on public.homework_help_requests
  for select to authenticated
  using (learner_id = (select auth.uid()) and (select public.is_active_studyspace_learner()));
drop policy if exists homework_help_learner_insert_own on public.homework_help_requests;
create policy homework_help_learner_insert_own on public.homework_help_requests
  for insert to authenticated
  with check (
    learner_id = (select auth.uid())
    and (select public.is_active_studyspace_learner())
    and (image_path is null or split_part(image_path, '/', 1) = (select auth.uid())::text)
    and (length(btrim(question_text)) > 0 or image_path is not null)
    and status = 'waiting_for_teacher'
    and fallback_attempts = 0
    and mia_response is null
    and teacher_response is null
    and teacher_id is null
  );
drop policy if exists homework_help_admin_select_all on public.homework_help_requests;
create policy homework_help_admin_select_all on public.homework_help_requests
  for select to authenticated
  using ((select public.is_studyspace_admin()));
