-- Keep authentication/rate-limit attempt logs inaccessible through the client Data API.
revoke all on table public.pin_redemption_attempts from public, anon, authenticated;
revoke all on table public.student_auth_attempts from public, anon, authenticated;

-- Wrap stable auth/helper calls in scalar subqueries so PostgreSQL can evaluate
-- them once per statement rather than once per candidate row.
do $$
declare
  p record;
  using_expr text;
  check_expr text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
        or coalesce(qual, '') like '%is_active_studyspace_learner()%'
        or coalesce(with_check, '') like '%is_active_studyspace_learner()%'
        or coalesce(qual, '') like '%is_studyspace_admin()%'
        or coalesce(with_check, '') like '%is_studyspace_admin()%'
      )
  loop
    using_expr := p.qual;
    check_expr := p.with_check;
    if using_expr is not null then
      using_expr := replace(using_expr, 'auth.uid()', '(select auth.uid())');
      using_expr := replace(using_expr, 'is_active_studyspace_learner()', '(select public.is_active_studyspace_learner())');
      using_expr := replace(using_expr, 'is_studyspace_admin()', '(select public.is_studyspace_admin())');
    end if;
    if check_expr is not null then
      check_expr := replace(check_expr, 'auth.uid()', '(select auth.uid())');
      check_expr := replace(check_expr, 'is_active_studyspace_learner()', '(select public.is_active_studyspace_learner())');
      check_expr := replace(check_expr, 'is_studyspace_admin()', '(select public.is_studyspace_admin())');
    end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if using_expr is not null then stmt := stmt || format(' using (%s)', using_expr); end if;
    if check_expr is not null then stmt := stmt || format(' with check (%s)', check_expr); end if;
    execute stmt;
  end loop;
end
$$;