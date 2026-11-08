alter table public.homework_help_requests
  drop constraint if exists homework_help_photo_path;
alter table public.homework_help_requests
  add constraint homework_help_photo_path
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp)$');