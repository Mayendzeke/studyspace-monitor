-- Raise the default personal storage allowance to 3 GiB.
-- Preserve all existing learner files and never lower a quota below current use.

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_studyspace_storage_status(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition,
    'coalesce(q.quota_bytes,1073741824)',
    'coalesce(q.quota_bytes,3221225472)');
  execute v_definition;

  select pg_get_functiondef('public.reserve_studyspace_personal_storage(text,bigint)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition,
    'coalesce(q.quota_bytes,1073741824)',
    'coalesce(q.quota_bytes,3221225472)');
  execute v_definition;

  select pg_get_functiondef('public.set_studyspace_learner_storage_quota(uuid,bigint)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition,
    'p_quota_bytes < 1073741824',
    'p_quota_bytes < 3221225472');
  v_definition := replace(v_definition,
    'between 1 GiB and 20 GiB',
    'between 3 GiB and 20 GiB');
  execute v_definition;
end;
$migration$;

-- Existing custom allowances below 3 GiB are raised, never reduced.
update public.learner_storage_quotas q
set quota_bytes = greatest(
  3221225472::bigint,
  coalesce(used.bytes, 0) + coalesce(reserved.bytes, 0)
),
updated_at = now()
from (
  select learner_id, sum(file_size)::bigint as bytes
  from public.learner_personal_resources
  group by learner_id
) used
full join (
  select learner_id, sum(file_size)::bigint as bytes
  from public.learner_storage_reservations
  where expires_at > now()
  group by learner_id
) reserved using (learner_id)
where q.learner_id = coalesce(used.learner_id, reserved.learner_id)
  and q.quota_bytes < 3221225472;

update public.learner_storage_quotas q
set quota_bytes = greatest(3221225472::bigint, coalesce(used.bytes, 0)),
    updated_at = now()
from (
  select learner_id, sum(file_size)::bigint as bytes
  from public.learner_personal_resources
  group by learner_id
) used
where q.learner_id = used.learner_id
  and q.quota_bytes < 3221225472;
