create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_staff s where s.user_id = auth.uid() and s.revoked_at is null and s.role = 'admin')
$$;

revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

create or replace function public.am_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
$$;

revoke execute on function public.am_platform_admin() from public, anon;
grant execute on function public.am_platform_admin() to authenticated;

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
  if v_app.applicant_id = auth.uid() and not private.is_platform_admin() then
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
    jsonb_build_object('method', v_app.verification_method, 'kind', v_app.kind, 'applicant', v_app.applicant_id, 'self_approved_by_admin', v_app.applicant_id = auth.uid()));
  return v_chapter;
end;
$$;

revoke execute on function public.review_chapter_application(uuid, public.application_status, text, text) from public, anon;
grant execute on function public.review_chapter_application(uuid, public.application_status, text, text) to authenticated;

create or replace function public.submit_chapter_application(p_application uuid)
returns public.application_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.chapter_applications;
  v_dupes jsonb;
  v_admin boolean := private.is_platform_admin();
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
  if not v_admin then
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
  end if;
  if v_app.university_id is not null then
    v_dupes := private.find_duplicate_chapters(v_app.university_id, v_app.normalized_key, v_app.id);
  else
    v_dupes := '[]'::jsonb;
  end if;
  update public.chapter_applications
  set status = 'pending_verification', submitted_at = coalesce(submitted_at, now()), duplicate_candidates = v_dupes, current_step = 4,
    verification_method = case when v_admin then coalesce(verification_method, 'manual_review') else verification_method end
  where id = v_app.id;
  perform private.application_event(v_app.id, case when v_app.status = 'info_requested' then 'applicant_response' else 'submitted' end, null);
  if jsonb_array_length(v_dupes) > 0 then
    perform private.application_event(v_app.id, 'duplicate_flagged', v_dupes::text, 'internal');
  end if;
  if v_admin then
    perform public.review_chapter_application(v_app.id, 'verified', 'Approved automatically because a platform administrator submitted it.', null);
    return 'verified';
  end if;
  return 'pending_verification';
end;
$$;

revoke execute on function public.submit_chapter_application(uuid) from public, anon;
grant execute on function public.submit_chapter_application(uuid) to authenticated;

create or replace function private.accept_invitation_as(p_token_hash text, p_user uuid)
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
  if p_user is null then
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
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is distinct from lower(v_inv.email) and not (p_user = auth.uid() and private.is_platform_admin()) then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chapters where id = v_inv.chapter_id and status = 'verified') then
    raise exception 'chapter is not accepting members' using errcode = '22023';
  end if;
  if not private.user_has_permission(v_inv.invited_by, v_inv.chapter_id, 'members.manage') then
    raise exception 'the officer who invited you no longer has access; ask for a new invitation' using errcode = '42501';
  end if;
  insert into public.memberships (chapter_id, user_id, member_class, status, invited_by)
  values (v_inv.chapter_id, p_user, v_inv.member_class, 'active', v_inv.invited_by)
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
  update public.chapter_invitations set status = 'accepted', accepted_by = p_user, accepted_at = now() where id = v_inv.id;
  perform private.write_audit(v_inv.chapter_id, 'invitation.accepted', 'chapter_invitation', v_inv.id::text, '{}'::jsonb);
  return v_inv.chapter_id;
end;
$$;

revoke execute on function private.accept_invitation_as(text, uuid) from public, anon, authenticated;

create or replace function public.service_confirm_admin_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select u.id into v_user
  from auth.users u
  join public.platform_staff s on s.user_id = u.id and s.revoked_at is null and s.role = 'admin'
  where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    return false;
  end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_user;
  return true;
end;
$$;

revoke execute on function public.service_confirm_admin_email(text) from public, anon, authenticated;
grant execute on function public.service_confirm_admin_email(text) to service_role;
