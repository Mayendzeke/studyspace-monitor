-- Keep the peer safeguarding eligibility check out of the API-exposed public schema.
-- Internal functions and RLS policies still need it, so expose it only through the
-- private schema and grant execute only for trusted database evaluation paths.

create or replace function private.studyspace_peer_chat_eligible(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
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
$function$;

comment on function private.studyspace_peer_chat_eligible(uuid) is
  'Internal safeguarding eligibility predicate. Keep in the non-exposed private schema; do not publish as a client RPC.';

revoke all on function private.studyspace_peer_chat_eligible(uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.studyspace_peer_chat_eligible(uuid) to authenticated, service_role;

-- Rewrite all public functions that use this helper, preserving their existing
-- signatures, security modes, guards, grants, and implementation logic.
do $migration$
declare
  v_fn record;
  v_definition text;
begin
  for v_fn in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.oid <> 'public.studyspace_peer_chat_eligible(uuid)'::regprocedure
      and pg_get_functiondef(p.oid) ilike '%studyspace_peer_chat_eligible%'
  loop
    v_definition := replace(
      v_fn.definition,
      'public.studyspace_peer_chat_eligible(',
      'private.studyspace_peer_chat_eligible('
    );
    v_definition := regexp_replace(
      v_definition,
      '(^|[^[:alnum:]_.])studyspace_peer_chat_eligible[[:space:]]*\(',
      '\1private.studyspace_peer_chat_eligible(',
      'g'
    );
    execute v_definition;
  end loop;
end
$migration$;

-- Rewrite RLS policy expressions as well. The authenticated role needs EXECUTE
-- for policy evaluation, but private is not an exposed PostgREST schema.
do $migration$
declare
  v_policy record;
  v_roles text;
  v_using text;
  v_check text;
  v_sql text;
begin
  for v_policy in
    select p.polname, p.polrelid, p.polroles, p.polqual, p.polwithcheck,
           n.nspname as schema_name, c.relname as table_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where (p.polqual is not null and pg_get_expr(p.polqual,p.polrelid) ilike '%studyspace_peer_chat_eligible%')
       or (p.polwithcheck is not null and pg_get_expr(p.polwithcheck,p.polrelid) ilike '%studyspace_peer_chat_eligible%')
  loop
    select string_agg(
      case when r.role_oid = 0 then 'PUBLIC' else quote_ident(gr.rolname) end,
      ', ' order by r.ordinality
    )
    into v_roles
    from unnest(v_policy.polroles) with ordinality as r(role_oid, ordinality)
    left join pg_roles gr on gr.oid = r.role_oid;

    v_sql := format(
      'ALTER POLICY %I ON %I.%I',
      v_policy.polname, v_policy.schema_name, v_policy.table_name
    );
    if v_roles is not null then
      v_sql := v_sql || ' TO ' || v_roles;
    end if;

    if v_policy.polqual is not null then
      v_using := regexp_replace(
        pg_get_expr(v_policy.polqual,v_policy.polrelid),
        '(public\.)?studyspace_peer_chat_eligible[[:space:]]*\(',
        'private.studyspace_peer_chat_eligible(',
        'g'
      );
      v_sql := v_sql || ' USING (' || v_using || ')';
    end if;

    if v_policy.polwithcheck is not null then
      v_check := regexp_replace(
        pg_get_expr(v_policy.polwithcheck,v_policy.polrelid),
        '(public\.)?studyspace_peer_chat_eligible[[:space:]]*\(',
        'private.studyspace_peer_chat_eligible(',
        'g'
      );
      v_sql := v_sql || ' WITH CHECK (' || v_check || ')';
    end if;

    execute v_sql;
  end loop;
end
$migration$;

-- The public RPC is no longer needed once every internal caller and policy uses
-- the private helper.
drop function public.studyspace_peer_chat_eligible(uuid);
