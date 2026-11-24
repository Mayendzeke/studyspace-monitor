create table if not exists public.literature_text_registry (
 id uuid primary key default gen_random_uuid(),
 country text not null,
 exam_authority text not null default '',
 institution text not null default '',
 education_level text not null default '',
 grade text not null default '',
 qualification text not null default '',
 curriculum text not null default '',
 subject_name text not null,
 learning_language text not null,
 title text not null,
 author text not null default '',
 editor text not null default '',
 genre text not null default '',
 anthology text not null default '',
 prescribed_status text not null default 'unconfirmed' check (prescribed_status in ('confirmed_current','publisher_reported','recommended','historical','unconfirmed')),
 valid_from_year integer,
 valid_to_year integer,
 examination_years text not null default '',
 syllabus_url text not null default '',
 catalogue_url text not null default '',
 source_references jsonb not null default '[]'::jsonb,
 notes text not null default '',
 last_checked_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint literature_text_registry_source_https check (syllabus_url = '' or syllabus_url ~ '^https://')
);
create unique index if not exists literature_text_registry_unique_idx
 on public.literature_text_registry(country, qualification, grade, subject_name, learning_language, title, author, examination_years);
create index if not exists literature_text_registry_lookup_idx
 on public.literature_text_registry(country, qualification, grade, subject_name, learning_language, prescribed_status);
alter table public.literature_text_registry enable row level security;
drop policy if exists literature_text_registry_admin_manage on public.literature_text_registry;
create policy literature_text_registry_admin_manage on public.literature_text_registry
 for all to authenticated using ((select is_studyspace_admin())) with check ((select is_studyspace_admin()));
grant select, insert, update, delete on public.literature_text_registry to authenticated;
comment on table public.literature_text_registry is 'Country-, grade-, language- and examination-cycle-specific prescribed literature and set-text register. Distinguishes ECESWA-confirmed works from publisher-reported titles.';
