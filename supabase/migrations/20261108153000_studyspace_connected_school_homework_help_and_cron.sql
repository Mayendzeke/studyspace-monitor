-- Connected school homework requests with private photo storage and a durable 30-second scheduler.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.homework_help_requests (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  question_text text not null default '',
  image_path text,
  status text not null default 'waiting_for_teacher'
    check (status in ('waiting_for_teacher','mia_generating','mia_replied','teacher_replied','teacher_replied_after_mia','mia_failed')),
  created_at timestamptz not null default now(),
  fallback_due_at timestamptz not null default (now() + interval '2 minutes'),
  fallback_attempts integer not null default 0 check (fallback_attempts between 0 and 5),
  mia_response text,
  mia_replied_at timestamptz,
  teacher_response text,
  teacher_id uuid references public.profiles(id),
  teacher_replied_at timestamptz,
  last_fallback_error text,
  updated_at timestamptz not null default now(),
  constraint homework_help_question_or_photo check (char_length(question_text) <= 5000 and (length(btrim(question_text)) > 0 or image_path is not null)),
  constraint homework_help_photo_path check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp)$')
);
create index if not exists homework_help_status_due_idx
  on public.homework_help_requests(status, fallback_due_at)
  where status = 'waiting_for_teacher';
create index if not exists homework_help_learner_created_idx
  on public.homework_help_requests(learner_id, created_at desc);

alter table public.homework_help_requests enable row level security;
revoke all on public.homework_help_requests from anon, authenticated;
grant select, insert on public.homework_help_requests to authenticated;
grant select, insert, update, delete on public.homework_help_requests to service_role;
drop policy if exists homework_help_learner_select_own on public.homework_help_requests;
create policy homework_help_learner_select_own on public.homework_help_requests
  for select to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner());
drop policy if exists homework_help_learner_insert_own on public.homework_help_requests;
create policy homework_help_learner_insert_own on public.homework_help_requests
  for insert to authenticated
  with check (
    learner_id = auth.uid()
    and public.is_active_studyspace_learner()
    and (image_path is null or split_part(image_path, '/', 1) = auth.uid()::text)
    and (length(btrim(question_text)) > 0 or image_path is not null)
  );
drop policy if exists homework_help_admin_select_all on public.homework_help_requests;
create policy homework_help_admin_select_all on public.homework_help_requests
  for select to authenticated
  using (public.is_studyspace_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('studyspace-homework-help','studyspace-homework-help',false,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[];

drop policy if exists studyspace_homework_photo_upload on storage.objects;
create policy studyspace_homework_photo_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studyspace-homework-help'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_studyspace_learner()
  );
drop policy if exists studyspace_homework_photo_read on storage.objects;
create policy studyspace_homework_photo_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studyspace-homework-help'
    and (
      ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_studyspace_learner())
      or public.is_studyspace_admin()
    )
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
create table if not exists private.studyspace_homework_cron_tokens (
  token_hash bytea primary key,
  created_at timestamptz not null default now()
);
revoke all on private.studyspace_homework_cron_tokens from public, anon, authenticated;
grant select, insert, delete on private.studyspace_homework_cron_tokens to service_role;

create or replace function public.verify_studyspace_homework_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_token is not null
    and length(p_token) >= 48
    and exists (
      select 1 from private.studyspace_homework_cron_tokens
      where token_hash = extensions.digest(p_token, 'sha256')
    );
$function$;
revoke all on function public.verify_studyspace_homework_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_studyspace_homework_cron_token(text) to service_role;

create or replace function public.claim_studyspace_homework_fallback(p_request_id uuid)
returns setof public.homework_help_requests
language sql
security definer
set search_path = ''
as $function$
  update public.homework_help_requests
  set status = 'mia_generating',
      fallback_attempts = fallback_attempts + 1,
      updated_at = now()
  where id = p_request_id
    and status = 'waiting_for_teacher'
    and fallback_due_at <= now()
    and fallback_attempts < 5
  returning *;
$function$;
revoke all on function public.claim_studyspace_homework_fallback(uuid) from public, anon, authenticated;
grant execute on function public.claim_studyspace_homework_fallback(uuid) to service_role;

do $block$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into private.studyspace_homework_cron_tokens(token_hash)
  values (extensions.digest(v_token, 'sha256'));
  perform vault.create_secret(v_token, 'studyspace_homework_cron_token');
  perform vault.create_secret('https://tibcoottzstnqkfpwabk.supabase.co', 'studyspace_homework_project_url');
  perform vault.create_secret('sb_publishable_wqNRB4M60as8Ubj_XBUreA_WnpcBIx2', 'studyspace_homework_publishable_key');
end
$block$;

do $block$
begin
  if not exists (select 1 from cron.job where jobname = 'studyspace-homework-fallbacks') then
    perform cron.schedule(
      'studyspace-homework-fallbacks',
      '30 seconds',
      $schedule$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_homework_project_url') || '/functions/v1/process-homework-fallbacks',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_homework_publishable_key'),
            'x-studyspace-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'studyspace_homework_cron_token')
          ),
          body := '{"source":"supabase-cron"}'::jsonb,
          timeout_milliseconds := 8000
        );
      $schedule$
    );
  end if;
end
$block$;
