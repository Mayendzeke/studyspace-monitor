-- Limit notification preference tables to the operations required by their owners.
revoke all privileges on table public.studyspace_notification_preferences
  from public,anon,authenticated;
grant select,insert,update on table public.studyspace_notification_preferences to authenticated;

revoke all privileges on table public.studyspace_group_notification_preferences
  from public,anon,authenticated;
grant select,insert,update on table public.studyspace_group_notification_preferences to authenticated;
