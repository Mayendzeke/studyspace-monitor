-- Index MIΛ message rows by learner for account-scoped history and cleanup queries.
create index if not exists mia_messages_learner_id_idx
  on public.mia_messages (learner_id);
