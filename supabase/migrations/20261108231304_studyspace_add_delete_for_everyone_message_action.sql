alter table public.direct_messages
  add column if not exists deleted_for_everyone_at timestamptz;

alter table public.studyspace_group_messages
  add column if not exists deleted_for_everyone_at timestamptz;

create index if not exists studyspace_group_message_user_deletions_group_idx
  on public.studyspace_group_message_user_deletions (group_id);

create or replace function public.guard_direct_message_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in is required to modify a message.';
  end if;

  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Message identity and delivery details cannot be changed.';
  end if;

  if actor = old.sender_id then
    if new.read_at is distinct from old.read_at
       or new.delivered_at is distinct from old.delivered_at then
      raise exception 'Only the recipient can update delivery receipts.';
    end if;

    if new.unsent_at is distinct from old.unsent_at then
      if new.deleted_for_everyone_at is distinct from old.deleted_for_everyone_at
         or old.unsent_at is not null or old.deleted_for_everyone_at is not null
         or new.unsent_at is null then
        raise exception 'This message has already been removed.';
      end if;
      if new.body is distinct from 'This message was unsent.'
         or new.attachment_path is not null
         or coalesce(new.attachment_name, '') <> ''
         or coalesce(new.attachment_mime, '') <> ''
         or coalesce(new.attachment_size, 0) <> 0 then
        raise exception 'Unsend must remove the message content and attachment.';
      end if;
      new.unsent_at := pg_catalog.clock_timestamp();
      new.edited_at := old.edited_at;
    elsif new.deleted_for_everyone_at is distinct from old.deleted_for_everyone_at then
      if old.unsent_at is not null or old.deleted_for_everyone_at is not null
         or new.deleted_for_everyone_at is null then
        raise exception 'This message has already been removed.';
      end if;
      if new.body is distinct from 'This message was deleted.'
         or new.attachment_path is not null
         or coalesce(new.attachment_name, '') <> ''
         or coalesce(new.attachment_mime, '') <> ''
         or coalesce(new.attachment_size, 0) <> 0 then
        raise exception 'Deleting for everyone must remove the message content and attachment.';
      end if;
      new.deleted_for_everyone_at := pg_catalog.clock_timestamp();
      new.edited_at := old.edited_at;
    else
      if new.attachment_path is distinct from old.attachment_path
         or new.attachment_name is distinct from old.attachment_name
         or new.attachment_mime is distinct from old.attachment_mime
         or new.attachment_size is distinct from old.attachment_size then
        raise exception 'Attachments cannot be changed after a message is sent.';
      end if;
      if new.body is distinct from old.body then
        if old.unsent_at is not null or old.deleted_for_everyone_at is not null then
          raise exception 'A removed message cannot be edited.';
        end if;
        if old.created_at < pg_catalog.clock_timestamp() - interval '2 minutes' then
          raise exception 'Messages can only be edited within two minutes of sending.';
        end if;
        new.edited_at := pg_catalog.clock_timestamp();
      elsif new.edited_at is distinct from old.edited_at then
        raise exception 'The edit timestamp is managed by StudySpace.';
      end if;
    end if;
  elsif actor = old.recipient_id then
    if new.body is distinct from old.body
       or new.attachment_path is distinct from old.attachment_path
       or new.attachment_name is distinct from old.attachment_name
       or new.attachment_mime is distinct from old.attachment_mime
       or new.attachment_size is distinct from old.attachment_size
       or new.edited_at is distinct from old.edited_at
       or new.unsent_at is distinct from old.unsent_at
       or new.deleted_for_everyone_at is distinct from old.deleted_for_everyone_at then
      raise exception 'Recipients can only update delivery receipts.';
    end if;
    if old.read_at is not null and new.read_at is distinct from old.read_at then
      raise exception 'A read receipt cannot be cleared.';
    end if;
    if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then
      raise exception 'A delivery receipt cannot be cleared.';
    end if;
  else
    raise exception 'Only a message participant can modify this message.';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_studyspace_group_message_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null or actor <> old.sender_id then
    raise exception 'Only the message sender can modify a group message.';
  end if;

  if new.id is distinct from old.id
     or new.group_id is distinct from old.group_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Message identity cannot be changed.';
  end if;

  if new.unsent_at is distinct from old.unsent_at then
    if new.deleted_for_everyone_at is distinct from old.deleted_for_everyone_at
       or old.unsent_at is not null or old.deleted_for_everyone_at is not null
       or new.unsent_at is null then
      raise exception 'This message has already been removed.';
    end if;
    if new.body is distinct from 'This message was unsent.'
       or new.attachment_path is not null
       or coalesce(new.attachment_name, '') <> ''
       or coalesce(new.attachment_mime, '') <> ''
       or coalesce(new.attachment_size, 0) <> 0 then
      raise exception 'Unsend must remove the message content and attachment.';
    end if;
    new.unsent_at := pg_catalog.clock_timestamp();
    new.edited_at := old.edited_at;
  elsif new.deleted_for_everyone_at is distinct from old.deleted_for_everyone_at then
    if old.unsent_at is not null or old.deleted_for_everyone_at is not null
       or new.deleted_for_everyone_at is null then
      raise exception 'This message has already been removed.';
    end if;
    if new.body is distinct from 'This message was deleted.'
       or new.attachment_path is not null
       or coalesce(new.attachment_name, '') <> ''
       or coalesce(new.attachment_mime, '') <> ''
       or coalesce(new.attachment_size, 0) <> 0 then
      raise exception 'Deleting for everyone must remove the message content and attachment.';
    end if;
    new.deleted_for_everyone_at := pg_catalog.clock_timestamp();
    new.edited_at := old.edited_at;
  else
    if new.attachment_path is distinct from old.attachment_path
       or new.attachment_name is distinct from old.attachment_name
       or new.attachment_mime is distinct from old.attachment_mime
       or new.attachment_size is distinct from old.attachment_size then
      raise exception 'Attachments cannot be changed after a message is sent.';
    end if;
    if new.body is distinct from old.body then
      if old.unsent_at is not null or old.deleted_for_everyone_at is not null then
        raise exception 'A removed message cannot be edited.';
      end if;
      if old.created_at < pg_catalog.clock_timestamp() - interval '2 minutes' then
        raise exception 'Messages can only be edited within two minutes of sending.';
      end if;
      new.edited_at := pg_catalog.clock_timestamp();
    elsif new.edited_at is distinct from old.edited_at then
      raise exception 'The edit timestamp is managed by StudySpace.';
    end if;
  end if;

  return new;
end;
$function$;

drop policy if exists direct_messages_recipient_read_receipt on public.direct_messages;
drop policy if exists direct_messages_sender_edit_or_unsend on public.direct_messages;
create policy direct_messages_participant_update
  on public.direct_messages
  for update to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

grant update (body, unsent_at, deleted_for_everyone_at, attachment_path, attachment_name, attachment_mime, attachment_size)
  on public.direct_messages to authenticated;
grant update (body, unsent_at, deleted_for_everyone_at, attachment_path, attachment_name, attachment_mime, attachment_size)
  on public.studyspace_group_messages to authenticated;
