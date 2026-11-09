-- Cover the announcement creator foreign key for admin audit queries and FK maintenance.
create index if not exists studyspace_announcements_created_by_idx
  on public.studyspace_announcements(created_by);
