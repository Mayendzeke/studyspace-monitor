-- Apply the existing guardian-verification decision to peer discovery and peer chat.
-- Unknown date of birth is treated conservatively until the guardian check is approved.

create or replace function public.studyspace_peer_chat_eligible(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_learner
      and p.role = 'learner'
      and p.account_status = 'active'
      and (
        (p.date_of_birth is not null and p.date_of_birth <= (current_date - interval '18 years'))
        or exists (
          select 1
          from public.guardian_verifications gv
          where gv.learner_id = p.id
            and gv.approval_status = 'approved'
            and gv.consent_given = true
            and gv.verified_at is not null
        )
      )
  );
$$;

revoke all on function public.studyspace_peer_chat_eligible(uuid) from public, anon;
grant execute on function public.studyspace_peer_chat_eligible(uuid) to authenticated;

drop policy if exists student_connections_learner_invite on public.student_connections;
create policy student_connections_learner_invite
  on public.student_connections
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and (select public.is_active_studyspace_learner())
    and (select public.studyspace_peer_chat_eligible((select auth.uid())))
    and (select public.studyspace_peer_chat_eligible(addressee_id))
    and exists (
      select 1 from public.profiles p
      where p.id = addressee_id and p.role = 'learner' and p.account_status = 'active'
    )
  );

drop policy if exists student_connections_recipient_respond on public.student_connections;
create policy student_connections_recipient_respond
  on public.student_connections
  for update to authenticated
  using (
    addressee_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    addressee_id = (select auth.uid())
    and status in ('accepted', 'rejected')
    and (
      status = 'rejected'
      or (
        (select public.studyspace_peer_chat_eligible((select auth.uid())))
        and (select public.studyspace_peer_chat_eligible(requester_id))
      )
    )
  );

create or replace function public.can_message_studyspace_user(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_other is not null
    and p_other <> (select auth.uid())
    and exists (
      select 1
      from public.profiles other_profile
      where other_profile.id = p_other
        and other_profile.account_status = 'active'
        and (
          ((select public.is_studyspace_admin()) and other_profile.role = 'learner')
          or ((select public.is_active_studyspace_learner()) and other_profile.role = 'admin')
          or (
            (select public.is_active_studyspace_learner())
            and other_profile.role = 'learner'
            and (select public.studyspace_peer_chat_eligible((select auth.uid())))
            and (select public.studyspace_peer_chat_eligible(p_other))
            and exists (
              select 1 from public.student_connections c
              where c.status = 'accepted'
                and ((c.requester_id = (select auth.uid()) and c.addressee_id = p_other)
                  or (c.addressee_id = (select auth.uid()) and c.requester_id = p_other))
            )
          )
        )
    );
$$;

revoke all on function public.can_message_studyspace_user(uuid) from public, anon;
grant execute on function public.can_message_studyspace_user(uuid) to authenticated;

drop function if exists public.search_studyspace_learners(text);
create function public.search_studyspace_learners(p_query text)
returns table (learner_id uuid, display_name text, grade text, can_invite boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  return query
  select p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Learner'),
         coalesce(p.grade, ''),
         (select public.studyspace_peer_chat_eligible((select auth.uid())))
           and (select public.studyspace_peer_chat_eligible(p.id))
  from public.profiles p
  where p.role = 'learner'
    and p.account_status = 'active'
    and p.id <> auth.uid()
    and (
      coalesce(p.preferred_name, '') ilike '%' || left(btrim(p_query), 60) || '%'
      or coalesce(p.full_name, '') ilike '%' || left(btrim(p_query), 60) || '%'
      or coalesce(p.student_id, '') ilike '%' || left(btrim(p_query), 60) || '%'
    )
  order by p.preferred_name, p.full_name
  limit 15;
end;
$$;

grant execute on function public.search_studyspace_learners(text) to authenticated;

create or replace function public.get_studyspace_pending_friend_requests()
returns table (
  request_id uuid,
  requester_id uuid,
  display_name text,
  grade text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active Studyspace learner account is required';
  end if;
  return query
  select c.id,
         p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Student'),
         coalesce(p.grade, ''),
         c.created_at
  from public.student_connections c
  join public.profiles p on p.id = c.requester_id
  where c.addressee_id = auth.uid()
    and c.status = 'pending'
    and p.role = 'learner'
    and p.account_status = 'active'
  order by c.created_at desc
  limit 30;
end;
$$;

revoke all on function public.get_studyspace_pending_friend_requests() from public, anon;
grant execute on function public.get_studyspace_pending_friend_requests() to authenticated;

create or replace function public.get_studyspace_message_contacts()
returns table (contact_id uuid, display_name text, grade text, contact_type text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_studyspace_admin() then
    return query
    select p.id,
           coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Learner'),
           coalesce(p.grade, ''),
           'learner'::text
    from public.profiles p
    where p.role = 'learner' and p.account_status = 'active'
    order by p.preferred_name, p.full_name;
    return;
  end if;

  if not public.is_active_studyspace_learner() then
    raise exception 'An active Studyspace learner account is required';
  end if;

  return query
  select p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Teacher'),
         coalesce(p.grade, ''),
         'teacher'::text
  from public.profiles p
  where p.role = 'admin' and p.account_status = 'active'
  union
  select p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Student'),
         coalesce(p.grade, ''),
         'student'::text
  from public.profiles p
  join public.student_connections c
    on c.status = 'accepted'
   and ((c.requester_id = auth.uid() and c.addressee_id = p.id)
     or (c.addressee_id = auth.uid() and c.requester_id = p.id))
  where p.role = 'learner'
    and p.account_status = 'active'
    and public.studyspace_peer_chat_eligible(auth.uid())
    and public.studyspace_peer_chat_eligible(p.id);
end;
$$;

revoke all on function public.get_studyspace_message_contacts() from public, anon;
grant execute on function public.get_studyspace_message_contacts() to authenticated;
