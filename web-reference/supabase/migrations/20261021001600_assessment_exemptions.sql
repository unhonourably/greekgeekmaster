create table public.assessment_exemptions (
  chapter_id uuid not null,
  assessment_id uuid not null,
  membership_id uuid not null references public.memberships (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (assessment_id, membership_id),
  foreign key (chapter_id, assessment_id) references public.dues_assessments (chapter_id, id)
);

alter table public.assessment_exemptions enable row level security;

create policy assessment_exemptions_read on public.assessment_exemptions for select to authenticated
  using (private.has_permission(chapter_id, 'finance.view'));

create or replace function public.set_assessment_exemptions(p_assessment uuid, p_memberships uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.dues_assessments;
  v_count int;
begin
  select * into v_a from public.dues_assessments where id = p_assessment for update;
  if v_a.id is null or not private.has_permission(v_a.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_a.status not in ('draft', 'issued') then
    raise exception 'assessment is closed' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_memberships, '{}')) as x(id)
    where not exists (select 1 from public.memberships m where m.id = x.id and m.chapter_id = v_a.chapter_id)
  ) then
    raise exception 'member is not in this chapter' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.member_assessments ma
    where ma.assessment_id = v_a.id and ma.membership_id = any (coalesce(p_memberships, '{}'))
  ) then
    raise exception 'that member has already been charged; void their charge instead' using errcode = '22023';
  end if;
  delete from public.assessment_exemptions where assessment_id = v_a.id and not (membership_id = any (coalesce(p_memberships, '{}')));
  insert into public.assessment_exemptions (chapter_id, assessment_id, membership_id, created_by)
  select v_a.chapter_id, v_a.id, x.id, auth.uid() from unnest(coalesce(p_memberships, '{}')) as x(id)
  on conflict do nothing;
  select count(*) into v_count from public.assessment_exemptions where assessment_id = v_a.id;
  perform private.write_audit(v_a.chapter_id, 'assessment.exemptions_set', 'dues_assessment', v_a.id::text, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

revoke execute on function public.set_assessment_exemptions(uuid, uuid[]) from public, anon;
grant execute on function public.set_assessment_exemptions(uuid, uuid[]) to authenticated;
