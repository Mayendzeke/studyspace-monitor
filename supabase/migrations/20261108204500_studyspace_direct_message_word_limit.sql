-- Hard cap direct messages so the messaging system remains lightweight.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.direct_messages'::regclass
      and conname='direct_messages_word_limit'
  ) then
    alter table public.direct_messages
      add constraint direct_messages_word_limit
      check (cardinality(regexp_split_to_array(btrim(body), '\s+')) <= 350);
  end if;
end $$;
