do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'direct_message_user_deletions'
    ) then
      execute 'alter publication supabase_realtime add table public.direct_message_user_deletions';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'studyspace_group_message_user_deletions'
    ) then
      execute 'alter publication supabase_realtime add table public.studyspace_group_message_user_deletions';
    end if;
  end if;
end;
$block$;
