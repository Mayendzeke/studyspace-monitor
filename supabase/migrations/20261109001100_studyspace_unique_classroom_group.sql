drop index if exists public.studyspace_groups_one_classroom_per_entry_school;
create unique index if not exists studyspace_groups_one_classroom_per_school_grade
on public.studyspace_groups(lower(btrim(school_name)),lower(btrim(grade)),lower(btrim(education_level)))
where group_type='classroom' and is_active;
