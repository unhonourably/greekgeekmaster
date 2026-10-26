create type public.application_status as enum ('draft', 'pending_verification', 'info_requested', 'verified', 'rejected', 'suspended', 'withdrawn');
create type public.application_kind as enum ('new_chapter', 'claim_existing', 'recovery');
create type public.verification_method as enum ('institutional_email', 'officer_invitation', 'national_organization', 'university_fsl', 'officer_documentation', 'manual_review');

create table public.chapter_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id),
  kind public.application_kind not null default 'new_chapter',
  status public.application_status not null default 'draft',
  current_step int not null default 1 check (current_step between 1 and 5),
  applicant_full_name text check (char_length(applicant_full_name) <= 120),
  intended_role text check (intended_role in ('president', 'vice_president', 'treasurer', 'secretary', 'recruitment_chair', 'risk_management_chair', 'advisor', 'other_officer')),
  university_id uuid references public.universities (id),
  proposed_university_name text check (char_length(proposed_university_name) <= 200),
  existing_chapter_id uuid references public.chapters (id),
  organization_id uuid references public.national_organizations (id),
  organization_name text check (char_length(organization_name) <= 120),
  designation text check (char_length(designation) <= 120),
  greek_letters text check (char_length(greek_letters) <= 24),
  normalized_key text,
  verification_method public.verification_method,
  institutional_email text check (institutional_email is null or institutional_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  institutional_email_verified_at timestamptz,
  national_contact_name text check (char_length(national_contact_name) <= 120),
  national_contact_email text check (national_contact_email is null or national_contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  fsl_contact_name text check (char_length(fsl_contact_name) <= 120),
  fsl_contact_email text check (fsl_contact_email is null or fsl_contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  officer_statement text check (char_length(officer_statement) <= 2000),
  duplicate_candidates jsonb not null default '[]'::jsonb,
  appeal_count int not null default 0 check (appeal_count between 0 and 2),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_reason text,
  reviewer_notes text,
  created_chapter_id uuid references public.chapters (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chapter_applications_applicant_idx on public.chapter_applications (applicant_id, created_at desc);
create index chapter_applications_queue_idx on public.chapter_applications (status, submitted_at) where status in ('pending_verification', 'info_requested');
create index chapter_applications_key_idx on public.chapter_applications (university_id, normalized_key);

create table public.verification_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.chapter_applications (id),
  actor_id uuid references public.profiles (id),
  kind text not null check (kind in ('created', 'submitted', 'info_requested', 'applicant_response', 'evidence_uploaded', 'approved', 'rejected', 'suspended', 'appealed', 'withdrawn', 'note', 'email_verified', 'duplicate_flagged', 'reopened')),
  message text check (char_length(message) <= 4000),
  visibility text not null default 'applicant' check (visibility in ('applicant', 'internal')),
  created_at timestamptz not null default now()
);

create index verification_events_app_idx on public.verification_events (application_id, created_at);

create trigger verification_events_append_only before update or delete on public.verification_events
  for each row execute function private.prevent_mutation();

create table public.verification_evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.chapter_applications (id),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  kind text not null default 'other' check (kind in ('officer_roster', 'national_letter', 'fsl_letter', 'election_minutes', 'other')),
  uploaded_by uuid not null references public.profiles (id),
  retention_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.institutional_email_challenges (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.chapter_applications (id),
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index institutional_email_challenges_app_idx on public.institutional_email_challenges (application_id, created_at desc);

create table public.chapter_invitations (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text check (char_length(full_name) <= 120),
  member_class public.member_class not null default 'active',
  role_keys text[] not null default '{}',
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create unique index chapter_invitations_pending_unique on public.chapter_invitations (chapter_id, lower(email)) where status = 'pending';

create or replace function private.applications_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_key := private.normalize_name(coalesce(new.organization_name, '') || ' ' || coalesce(new.designation, ''));
  new.updated_at := now();
  if private.is_api_role() then
    if tg_op = 'INSERT' then
      if new.applicant_id <> auth.uid() then
        raise exception 'applications are created for yourself' using errcode = '42501';
      end if;
      new.status := 'draft';
      new.institutional_email_verified_at := null;
      new.submitted_at := null;
      new.decided_at := null;
      new.decided_by := null;
      new.decision_reason := null;
      new.reviewer_notes := null;
      new.created_chapter_id := null;
      new.appeal_count := 0;
      new.duplicate_candidates := '[]'::jsonb;
      return new;
    end if;
    if old.status not in ('draft', 'info_requested') then
      raise exception 'submitted applications cannot be edited' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
      or new.applicant_id is distinct from old.applicant_id
      or new.institutional_email_verified_at is distinct from old.institutional_email_verified_at
      or new.submitted_at is distinct from old.submitted_at
      or new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.decision_reason is distinct from old.decision_reason
      or new.reviewer_notes is distinct from old.reviewer_notes
      or new.created_chapter_id is distinct from old.created_chapter_id
      or new.appeal_count is distinct from old.appeal_count
      or new.duplicate_candidates is distinct from old.duplicate_candidates then
      raise exception 'protected application fields cannot be changed' using errcode = '42501';
    end if;
    if new.institutional_email is distinct from old.institutional_email then
      new.institutional_email_verified_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger chapter_applications_before_write before insert or update on public.chapter_applications
  for each row execute function private.applications_before_write();

create or replace function private.application_event(p_application uuid, p_kind text, p_message text, p_visibility text default 'applicant')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.verification_events (application_id, actor_id, kind, message, visibility)
  values (p_application, auth.uid(), p_kind, p_message, p_visibility)
$$;

revoke execute on function private.application_event(uuid, text, text, text) from public, anon, authenticated;

create or replace function private.find_duplicate_chapters(p_university uuid, p_key text, p_exclude uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('type', 'chapter', 'id', c.id, 'name', c.organization_name || coalesce(' — ' || c.designation, ''), 'status', c.status) as x
    from public.chapters c
    where c.university_id = p_university and c.status <> 'closed'
      and (c.normalized_key = p_key or (length(p_key) >= 4 and (c.normalized_key like p_key || '%' or p_key like c.normalized_key || '%')))
    union all
    select jsonb_build_object('type', 'application', 'id', a.id, 'name', coalesce(a.organization_name, '') || coalesce(' — ' || a.designation, ''), 'status', a.status)
    from public.chapter_applications a
    where a.university_id = p_university and a.id <> coalesce(p_exclude, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.status in ('pending_verification', 'info_requested', 'verified')
      and a.normalized_key = p_key
  ) d
$$;

create or replace function public.check_chapter_duplicates(p_university uuid, p_organization text, p_designation text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.find_duplicate_chapters(p_university, private.normalize_name(coalesce(p_organization, '') || ' ' || coalesce(p_designation, '')), null)
  where auth.uid() is not null
$$;

revoke execute on function public.check_chapter_duplicates(uuid, text, text) from public, anon;
grant execute on function public.check_chapter_duplicates(uuid, text, text) to authenticated;

create or replace function public.submit_chapter_application(p_application uuid)
returns public.application_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.chapter_applications;
  v_dupes jsonb;
begin
  select * into v_app from public.chapter_applications where id = p_application for update;
  if v_app.id is null or v_app.applicant_id <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_app.status not in ('draft', 'info_requested') then
    raise exception 'application is not editable' using errcode = '22023';
  end if;
  if coalesce(btrim(v_app.applicant_full_name), '') = '' or v_app.intended_role is null then
    raise exception 'applicant name and role are required' using errcode = '22023';
  end if;
  if v_app.university_id is null and coalesce(btrim(v_app.proposed_university_name), '') = '' then
    raise exception 'a university is required' using errcode = '22023';
  end if;
  if v_app.kind = 'new_chapter' and coalesce(btrim(v_app.organization_name), '') = '' then
    raise exception 'organization name is required' using errcode = '22023';
  end if;
  if v_app.kind in ('claim_existing', 'recovery') and v_app.existing_chapter_id is null then
    raise exception 'select the chapter you are claiming' using errcode = '22023';
  end if;
  if v_app.verification_method is null then
    raise exception 'choose a verification method' using errcode = '22023';
  end if;
  if v_app.verification_method = 'institutional_email' and v_app.institutional_email_verified_at is null then
    raise exception 'verify your institutional email first' using errcode = '22023';
  end if;
  if v_app.verification_method = 'national_organization' and v_app.national_contact_email is null then
    raise exception 'a national organization contact is required' using errcode = '22023';
  end if;
  if v_app.verification_method = 'university_fsl' and v_app.fsl_contact_email is null then
    raise exception 'a fraternity and sorority life contact is required' using errcode = '22023';
  end if;
  if v_app.verification_method = 'officer_documentation'
    and not exists (select 1 from public.verification_evidence e where e.application_id = v_app.id and e.deleted_at is null) then
    raise exception 'upload at least one supporting document' using errcode = '22023';
  end if;
  if v_app.university_id is not null then
    v_dupes := private.find_duplicate_chapters(v_app.university_id, v_app.normalized_key, v_app.id);
  else
    v_dupes := '[]'::jsonb;
  end if;
  update public.chapter_applications
  set status = 'pending_verification', submitted_at = coalesce(submitted_at, now()), duplicate_candidates = v_dupes, current_step = 4
  where id = v_app.id;
  perform private.application_event(v_app.id, case when v_app.status = 'info_requested' then 'applicant_response' else 'submitted' end, null);
  if jsonb_array_length(v_dupes) > 0 then
    perform private.application_event(v_app.id, 'duplicate_flagged', v_dupes::text, 'internal');
  end if;
  return 'pending_verification';
end;
$$;

revoke execute on function public.submit_chapter_application(uuid) from public, anon;
grant execute on function public.submit_chapter_application(uuid) to authenticated;

create or replace function public.respond_to_application(p_application uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.chapter_applications;
begin
  select * into v_app from public.chapter_applications where id = p_application for update;
  if v_app.id is null or v_app.applicant_id <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(btrim(p_message), '') = '' then
    raise exception 'a message is required' using errcode = '22023';
  end if;
  if v_app.status = 'rejected' then
    if v_app.appeal_count >= 2 then
      raise exception 'appeal limit reached; contact support' using errcode = '22023';
    end if;
    update public.chapter_applications set status = 'pending_verification', appeal_count = appeal_count + 1 where id = v_app.id;
    perform private.application_event(v_app.id, 'appealed', p_message);
  elsif v_app.status in ('info_requested', 'pending_verification') then
    perform private.application_event(v_app.id, 'applicant_response', p_message);
  else
    raise exception 'application is closed' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.respond_to_application(uuid, text) from public, anon;
grant execute on function public.respond_to_application(uuid, text) to authenticated;

create or replace function public.withdraw_chapter_application(p_application uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.chapter_applications;
begin
  select * into v_app from public.chapter_applications where id = p_application for update;
  if v_app.id is null or v_app.applicant_id <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_app.status not in ('draft', 'pending_verification', 'info_requested') then
    raise exception 'application cannot be withdrawn' using errcode = '22023';
  end if;
  update public.chapter_applications set status = 'withdrawn' where id = v_app.id;
  perform private.application_event(v_app.id, 'withdrawn', null);
end;
$$;

revoke execute on function public.withdraw_chapter_application(uuid) from public, anon;
grant execute on function public.withdraw_chapter_application(uuid) to authenticated;

create or replace function private.unique_chapter_slug(p_base text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := left(btrim(regexp_replace(lower(p_base), '[^a-z0-9]+', '-', 'g'), '-'), 60);
  v_slug text;
  v_n int := 1;
begin
  if char_length(v_base) < 3 then
    v_base := 'chapter-' || v_base;
  end if;
  v_slug := v_base;
  while exists (select 1 from public.chapters where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

revoke execute on function private.unique_chapter_slug(text) from public, anon, authenticated;

create or replace function public.review_chapter_application(
  p_application uuid,
  p_decision public.application_status,
  p_message text,
  p_internal_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.chapter_applications;
  v_chapter uuid;
  v_university uuid;
  v_membership uuid;
  v_uni public.universities;
begin
  if not private.is_platform_staff(array['reviewer']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_app from public.chapter_applications where id = p_application for update;
  if v_app.id is null then
    raise exception 'application not found' using errcode = '22023';
  end if;
  if v_app.applicant_id = auth.uid() then
    raise exception 'reviewers cannot decide their own application' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected', 'info_requested', 'suspended') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if v_app.status not in ('pending_verification', 'info_requested') and not (p_decision = 'suspended' and v_app.status = 'verified') then
    raise exception 'application is not awaiting review' using errcode = '22023';
  end if;
  if p_decision in ('rejected', 'info_requested') and coalesce(btrim(p_message), '') = '' then
    raise exception 'explain the decision to the applicant' using errcode = '22023';
  end if;

  if p_internal_note is not null and btrim(p_internal_note) <> '' then
    perform private.application_event(v_app.id, 'note', p_internal_note, 'internal');
  end if;

  if p_decision = 'info_requested' then
    update public.chapter_applications set status = 'info_requested', reviewer_notes = coalesce(p_internal_note, reviewer_notes) where id = v_app.id;
    perform private.application_event(v_app.id, 'info_requested', p_message);
    perform private.write_audit(null, 'verification.info_requested', 'chapter_application', v_app.id::text, '{}'::jsonb);
    return null;
  end if;

  if p_decision = 'rejected' then
    update public.chapter_applications
    set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_reason = p_message
    where id = v_app.id;
    perform private.application_event(v_app.id, 'rejected', p_message);
    perform private.write_audit(null, 'verification.rejected', 'chapter_application', v_app.id::text, jsonb_build_object('reason', p_message));
    return null;
  end if;

  if p_decision = 'suspended' then
    update public.chapter_applications
    set status = 'suspended', decided_at = now(), decided_by = auth.uid(), decision_reason = p_message
    where id = v_app.id;
    if v_app.created_chapter_id is not null then
      update public.chapters set status = 'suspended', suspended_reason = p_message where id = v_app.created_chapter_id;
    end if;
    perform private.application_event(v_app.id, 'suspended', p_message);
    perform private.write_audit(v_app.created_chapter_id, 'verification.suspended', 'chapter_application', v_app.id::text, jsonb_build_object('reason', p_message));
    return v_app.created_chapter_id;
  end if;

  v_university := v_app.university_id;
  if v_university is null then
    insert into public.universities (name, slug)
    values (v_app.proposed_university_name, private.unique_chapter_slug(v_app.proposed_university_name))
    returning id into v_university;
  end if;

  if v_app.kind = 'new_chapter' then
    select * into v_uni from public.universities where id = v_university;
    select id into v_chapter from public.chapters
    where university_id = v_university and normalized_key = v_app.normalized_key and status <> 'closed';
    if v_chapter is not null then
      if exists (select 1 from public.chapters where id = v_chapter and status <> 'unclaimed') then
        raise exception 'this chapter already exists; process the application as a claim or recovery' using errcode = '23505';
      end if;
      update public.chapters set status = 'verified', verified_at = now(), verification_method = v_app.verification_method::text where id = v_chapter;
    else
      insert into public.chapters (university_id, organization_id, organization_name, designation, greek_letters, normalized_key, slug, status, verified_at, verification_method)
      values (
        v_university, v_app.organization_id, v_app.organization_name, v_app.designation, v_app.greek_letters, '',
        private.unique_chapter_slug(coalesce(v_uni.short_name, v_uni.slug) || '-' || v_app.organization_name || '-' || coalesce(v_app.designation, '')),
        'verified', now(), v_app.verification_method::text
      )
      returning id into v_chapter;
    end if;
  else
    v_chapter := v_app.existing_chapter_id;
    if exists (select 1 from public.chapters where id = v_chapter and status = 'unclaimed') then
      update public.chapters set status = 'verified', verified_at = now(), verification_method = v_app.verification_method::text where id = v_chapter;
    elsif exists (select 1 from public.chapters where id = v_chapter and status = 'closed') then
      raise exception 'chapter is closed' using errcode = '22023';
    end if;
  end if;

  perform private.provision_chapter_roles(v_chapter);

  insert into public.memberships (chapter_id, user_id, member_class, status)
  values (v_chapter, v_app.applicant_id, 'active', 'active')
  on conflict (chapter_id, user_id) do update set status = 'active', ended_at = null, end_reason = null
  returning id into v_membership;

  perform private.grant_role(v_membership, 'chapter_admin', auth.uid());
  if v_app.intended_role in ('president', 'vice_president', 'treasurer', 'secretary', 'recruitment_chair', 'risk_management_chair') then
    perform private.grant_role(v_membership, v_app.intended_role, auth.uid());
  end if;

  update public.chapter_applications
  set status = 'verified', decided_at = now(), decided_by = auth.uid(), decision_reason = p_message, created_chapter_id = v_chapter, university_id = v_university, current_step = 5
  where id = v_app.id;
  perform private.application_event(v_app.id, 'approved', coalesce(p_message, 'Your chapter has been verified.'));
  perform private.write_audit(v_chapter, 'verification.approved', 'chapter_application', v_app.id::text,
    jsonb_build_object('method', v_app.verification_method, 'kind', v_app.kind, 'applicant', v_app.applicant_id));
  return v_chapter;
end;
$$;

revoke execute on function public.review_chapter_application(uuid, public.application_status, text, text) from public, anon;
grant execute on function public.review_chapter_application(uuid, public.application_status, text, text) to authenticated;

create or replace function public.platform_set_chapter_status(p_chapter uuid, p_status public.chapter_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.chapter_status;
begin
  if not private.is_platform_staff(array['admin']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  select status into v_old from public.chapters where id = p_chapter for update;
  update public.chapters set status = p_status, suspended_reason = case when p_status = 'suspended' then p_reason else null end where id = p_chapter;
  perform private.write_audit(p_chapter, 'chapter.status_changed', 'chapter', p_chapter::text,
    jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason));
end;
$$;

revoke execute on function public.platform_set_chapter_status(uuid, public.chapter_status, text) from public, anon;
grant execute on function public.platform_set_chapter_status(uuid, public.chapter_status, text) to authenticated;

create or replace function private.record_email_verified(p_application uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chapter_applications set institutional_email_verified_at = now() where id = p_application;
  insert into public.verification_events (application_id, actor_id, kind, message, visibility)
  select id, applicant_id, 'email_verified', institutional_email, 'applicant' from public.chapter_applications where id = p_application;
end;
$$;

revoke execute on function private.record_email_verified(uuid) from public, anon, authenticated;

create or replace function public.service_mark_institutional_email_verified(p_application uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.record_email_verified(p_application)
$$;

revoke execute on function public.service_mark_institutional_email_verified(uuid) from public, anon, authenticated;
grant execute on function public.service_mark_institutional_email_verified(uuid) to service_role;

create or replace function public.create_chapter_invitation(
  p_chapter uuid,
  p_email text,
  p_full_name text,
  p_member_class public.member_class,
  p_role_keys text[],
  p_token_hash text,
  p_import_batch uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_key text;
  v_role uuid;
begin
  if not private.has_permission(p_chapter, 'members.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.chapter_id = p_chapter and lower(u.email) = lower(btrim(p_email)) and m.status = 'active'
  ) then
    raise exception 'this person is already an active member' using errcode = '23505';
  end if;
  foreach v_key in array coalesce(p_role_keys, '{}') loop
    select id into v_role from public.roles where chapter_id = p_chapter and key = v_key;
    if v_role is null then
      raise exception 'unknown role %', v_key using errcode = '22023';
    end if;
    if not private.has_permission(p_chapter, 'roles.manage') then
      raise exception 'you cannot pre-assign roles' using errcode = '42501';
    end if;
    if exists (select 1 from public.roles where id = v_role and is_owner) and not private.has_permission(p_chapter, 'chapter.ownership') then
      raise exception 'only administrators can invite administrators' using errcode = '42501';
    end if;
    if exists (select 1 from public.role_permissions rp where rp.role_id = v_role and not private.has_permission(p_chapter, rp.permission_key)) then
      raise exception 'you cannot grant permissions you do not hold' using errcode = '42501';
    end if;
  end loop;
  update public.chapter_invitations set status = 'revoked'
  where chapter_id = p_chapter and lower(email) = lower(btrim(p_email)) and status = 'pending';
  insert into public.chapter_invitations (chapter_id, email, full_name, member_class, role_keys, token_hash, invited_by, import_batch_id)
  values (p_chapter, lower(btrim(p_email)), nullif(btrim(p_full_name), ''), p_member_class, coalesce(p_role_keys, '{}'), p_token_hash, auth.uid(), p_import_batch)
  returning id into v_id;
  perform private.write_audit(p_chapter, 'invitation.created', 'chapter_invitation', v_id::text,
    jsonb_build_object('member_class', p_member_class, 'roles', p_role_keys));
  return v_id;
end;
$$;

revoke execute on function public.create_chapter_invitation(uuid, text, text, public.member_class, text[], text, uuid) from public, anon;
grant execute on function public.create_chapter_invitation(uuid, text, text, public.member_class, text[], text, uuid) to authenticated;

create or replace function public.accept_chapter_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.chapter_invitations;
  v_email text;
  v_membership uuid;
  v_key text;
  v_role uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into v_inv from public.chapter_invitations where token_hash = p_token_hash for update;
  if v_inv.id is null or v_inv.status <> 'pending' then
    raise exception 'invitation is not valid' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    update public.chapter_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired' using errcode = '22023';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chapters where id = v_inv.chapter_id and status = 'verified') then
    raise exception 'chapter is not accepting members' using errcode = '22023';
  end if;
  if not private.user_has_permission(v_inv.invited_by, v_inv.chapter_id, 'members.manage') then
    raise exception 'the officer who invited you no longer has access; ask for a new invitation' using errcode = '42501';
  end if;
  insert into public.memberships (chapter_id, user_id, member_class, status, invited_by)
  values (v_inv.chapter_id, auth.uid(), v_inv.member_class, 'active', v_inv.invited_by)
  on conflict (chapter_id, user_id) do update set status = 'active', member_class = excluded.member_class, ended_at = null, end_reason = null
  returning id into v_membership;
  foreach v_key in array v_inv.role_keys loop
    select id into v_role from public.roles where chapter_id = v_inv.chapter_id and key = v_key;
    if v_role is not null and not exists (
      select 1 from public.role_permissions rp where rp.role_id = v_role
      and not private.user_has_permission(v_inv.invited_by, v_inv.chapter_id, rp.permission_key)
    ) then
      insert into public.role_assignments (chapter_id, membership_id, role_id, assigned_by)
      values (v_inv.chapter_id, v_membership, v_role, v_inv.invited_by)
      on conflict (membership_id, role_id) where ends_at is null do nothing;
    end if;
  end loop;
  update public.chapter_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  perform private.write_audit(v_inv.chapter_id, 'invitation.accepted', 'chapter_invitation', v_inv.id::text, '{}'::jsonb);
  return v_inv.chapter_id;
end;
$$;

revoke execute on function public.accept_chapter_invitation(text) from public, anon;
grant execute on function public.accept_chapter_invitation(text) to authenticated;

create or replace function public.transfer_chapter_ownership(p_chapter uuid, p_to_membership uuid, p_remove_self boolean, p_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_target public.memberships;
  v_owner_role uuid;
  v_my_membership uuid;
begin
  if not private.has_permission(p_chapter, 'chapter.ownership') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select slug into v_slug from public.chapters where id = p_chapter;
  if p_confirmation is distinct from v_slug then
    raise exception 'confirmation does not match the chapter handle' using errcode = '22023';
  end if;
  select * into v_target from public.memberships where id = p_to_membership and chapter_id = p_chapter;
  if v_target.id is null or v_target.status <> 'active' then
    raise exception 'recipient must be an active member' using errcode = '22023';
  end if;
  select id into v_owner_role from public.roles where chapter_id = p_chapter and is_owner;
  insert into public.role_assignments (chapter_id, membership_id, role_id, assigned_by)
  values (p_chapter, v_target.id, v_owner_role, auth.uid())
  on conflict (membership_id, role_id) where ends_at is null do nothing;
  if p_remove_self then
    v_my_membership := private.active_membership_id(p_chapter);
    if v_my_membership = v_target.id then
      raise exception 'choose a different member' using errcode = '22023';
    end if;
    update public.role_assignments set ends_at = now(), ended_by = auth.uid(), end_reason = 'ownership transferred'
    where membership_id = v_my_membership and role_id = v_owner_role and ends_at is null;
  end if;
  perform private.write_audit(p_chapter, 'chapter.ownership_transferred', 'membership', v_target.id::text,
    jsonb_build_object('removed_self', p_remove_self));
end;
$$;

revoke execute on function public.transfer_chapter_ownership(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.transfer_chapter_ownership(uuid, uuid, boolean, text) to authenticated;

alter table public.chapter_applications enable row level security;
alter table public.verification_events enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.institutional_email_challenges enable row level security;
alter table public.chapter_invitations enable row level security;

create policy applications_read on public.chapter_applications for select to authenticated
  using (applicant_id = auth.uid() or private.is_platform_staff(array['reviewer']::public.platform_staff_role[]));
create policy applications_insert on public.chapter_applications for insert to authenticated
  with check (applicant_id = auth.uid());
create policy applications_update on public.chapter_applications for update to authenticated
  using (applicant_id = auth.uid() and status in ('draft', 'info_requested'))
  with check (applicant_id = auth.uid());

create policy verification_events_read on public.verification_events for select to authenticated
  using (
    private.is_platform_staff(array['reviewer']::public.platform_staff_role[])
    or (visibility = 'applicant' and exists (select 1 from public.chapter_applications a where a.id = application_id and a.applicant_id = auth.uid()))
  );

create policy verification_evidence_read on public.verification_evidence for select to authenticated
  using (
    deleted_at is null and (
      uploaded_by = auth.uid()
      or private.is_platform_staff(array['reviewer']::public.platform_staff_role[])
    )
  );
create policy verification_evidence_insert on public.verification_evidence for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.chapter_applications a
      where a.id = application_id and a.applicant_id = auth.uid() and a.status in ('draft', 'info_requested', 'pending_verification')
    )
  );

create policy invitations_read on public.chapter_invitations for select to authenticated
  using (private.has_permission(chapter_id, 'members.manage'));
create policy invitations_revoke on public.chapter_invitations for update to authenticated
  using (private.has_permission(chapter_id, 'members.manage'))
  with check (private.has_permission(chapter_id, 'members.manage') and status = 'revoked');

create or replace function private.guard_invitation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() then
    if old.status <> 'pending' or new.status <> 'revoked'
      or new.token_hash is distinct from old.token_hash or new.email is distinct from old.email
      or new.role_keys is distinct from old.role_keys or new.member_class is distinct from old.member_class
      or new.chapter_id is distinct from old.chapter_id or new.invited_by is distinct from old.invited_by then
      raise exception 'invitations can only be revoked' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger chapter_invitations_guard before update on public.chapter_invitations
  for each row execute function private.guard_invitation_update();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-evidence', 'verification-evidence', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy verification_evidence_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-evidence'
    and exists (
      select 1 from public.chapter_applications a
      where a.id::text = (storage.foldername(name))[1]
        and a.applicant_id = auth.uid()
        and a.status in ('draft', 'info_requested', 'pending_verification')
    )
  );

create policy verification_evidence_download on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-evidence'
    and (
      private.is_platform_staff(array['reviewer']::public.platform_staff_role[])
      or exists (
        select 1 from public.chapter_applications a
        where a.id::text = (storage.foldername(name))[1] and a.applicant_id = auth.uid()
      )
    )
  );
