alter table public.class_sessions
  add column if not exists meeting_password text,
  add column if not exists meeting_ready_at timestamptz;

comment on column public.class_sessions.meeting_password is
  'Session-specific Jitsi room password. Visible only through administrator and assigned-member row policies.';
comment on column public.class_sessions.meeting_ready_at is
  'Set after the teacher has joined as moderator and configured the session room password.';
