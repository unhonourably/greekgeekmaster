alter table public.profiles add column erased_at timestamptz;

create or replace function private.reject_if_erased()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() and exists (select 1 from public.profiles where id = auth.uid() and erased_at is not null) then
    raise exception 'this account has been deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_reject_erased before insert or update on public.profiles
  for each row execute function private.reject_if_erased();

create trigger profile_details_reject_erased before insert or update on public.profile_details
  for each row execute function private.reject_if_erased();

create trigger chapter_applications_reject_erased before insert or update on public.chapter_applications
  for each row execute function private.reject_if_erased();

insert into public.notification_kinds (kind, label, description, default_in_app, default_email, required) values
  ('membership_removed', 'Removed from a chapter', 'An officer ended your membership', true, true, true)
on conflict (kind) do nothing;

create or replace function public.remove_chapter_member(p_membership uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null or not private.has_permission(v_m.chapter_id, 'members.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_m.user_id = auth.uid() then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  if v_m.status = 'ended' then
    raise exception 'this membership has already ended' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id and r.is_owner
    where ra.membership_id = v_m.id and ra.ends_at is null
  ) then
    if not exists (
      select 1
      from public.memberships m2
      join public.role_assignments ra2 on ra2.membership_id = m2.id and ra2.ends_at is null
      join public.roles r2 on r2.id = ra2.role_id and r2.is_owner
      where m2.chapter_id = v_m.chapter_id and m2.id <> v_m.id and m2.status = 'active'
    ) then
      raise exception 'transfer ownership before removing the last administrator' using errcode = '22023';
    end if;
    if not private.has_permission(v_m.chapter_id, 'chapter.ownership') then
      raise exception 'only an administrator can remove another administrator' using errcode = '42501';
    end if;
  end if;
  if not private.has_permission(v_m.chapter_id, 'roles.manage') and exists (
    select 1 from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
    where ra.membership_id = v_m.id and ra.ends_at is null and not private.has_permission(v_m.chapter_id, rp.permission_key)
  ) then
    raise exception 'this officer holds permissions you do not have' using errcode = '42501';
  end if;

  update public.memberships
  set status = 'ended', ended_at = now(), end_reason = v_reason
  where id = v_m.id;

  update public.role_assignments
  set ends_at = now(), ended_by = auth.uid(), end_reason = 'removed from chapter'
  where membership_id = v_m.id and ends_at is null;

  update public.conversation_members
  set removed_at = coalesce(removed_at, now())
  where chapter_id = v_m.chapter_id and user_id = v_m.user_id and removed_at is null;

  update public.room_assignments
  set ends_on = case when starts_on < current_date then current_date - 1 else starts_on end,
      ended_by = auth.uid(),
      end_reason = left(v_reason, 200)
  where membership_id = v_m.id and (ends_on is null or ends_on >= current_date);

  update public.housing_requests
  set status = 'withdrawn', notes = null
  where membership_id = v_m.id and status in ('submitted', 'waitlisted');

  perform private.notify(
    v_m.user_id, v_m.chapter_id, 'membership_removed',
    'You were removed from a chapter', v_reason, '/home', 'removed:' || v_m.id::text
  );
  perform private.write_audit(v_m.chapter_id, 'membership.removed', 'membership', v_m.id::text, jsonb_build_object('reason', v_reason));
end;
$$;

revoke execute on function public.remove_chapter_member(uuid, text) from public, anon;
grant execute on function public.remove_chapter_member(uuid, text) to authenticated;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = v_user;
  return jsonb_build_object(
    'exported_at', now(),
    'email', v_email,
    'profile', (select jsonb_build_object('display_name', display_name, 'full_name', full_name, 'graduation_year', graduation_year, 'created_at', created_at) from public.profiles where id = v_user),
    'details', (select to_jsonb(d) - 'user_id' from public.profile_details d where d.user_id = v_user),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chapter', c.organization_name, 'designation', c.designation, 'university', u.name,
        'class', m.member_class, 'status', m.status, 'joined_at', m.joined_at, 'ended_at', m.ended_at
      ) order by m.joined_at)
      from public.memberships m
      join public.chapters c on c.id = m.chapter_id
      join public.universities u on u.id = c.university_id
      where m.user_id = v_user
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('body', s.body, 'sent_at', s.created_at, 'deleted', s.deleted_at is not null) order by s.created_at)
      from (select body, created_at, deleted_at from public.messages where sender_id = v_user order by created_at desc limit 2000) s
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization', organization_name, 'designation', designation, 'status', status,
        'institutional_email', institutional_email, 'submitted_at', submitted_at
      ) order by created_at)
      from public.chapter_applications where applicant_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

create or replace function public.erase_my_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_avatar text;
  v_attachments text[];
  v_evidence text[];
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = v_user;
  if lower(btrim(coalesce(p_confirmation, ''))) is distinct from lower(v_email) then
    raise exception 'type your email address to confirm' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = v_user and erased_at is not null) then
    raise exception 'this account has already been deleted' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.platform_staff s
    where s.user_id = v_user and s.role = 'admin' and s.revoked_at is null
      and not exists (
        select 1 from public.platform_staff o
        where o.user_id <> v_user and o.role = 'admin' and o.revoked_at is null
      )
  ) then
    raise exception 'grant another platform administrator before deleting your account' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.memberships m
    join public.role_assignments ra on ra.membership_id = m.id and ra.ends_at is null
    join public.roles r on r.id = ra.role_id and r.is_owner
    where m.user_id = v_user and m.status = 'active'
      and not exists (
        select 1
        from public.memberships m2
        join public.role_assignments ra2 on ra2.membership_id = m2.id and ra2.ends_at is null
        join public.roles r2 on r2.id = ra2.role_id and r2.is_owner
        where m2.chapter_id = m.chapter_id and m2.user_id <> v_user and m2.status = 'active'
      )
  ) then
    raise exception 'transfer chapter ownership before deleting your account' using errcode = '22023';
  end if;

  select avatar_path into v_avatar from public.profiles where id = v_user;

  select coalesce(array_agg(a.storage_path), '{}') into v_attachments
  from public.message_attachments a
  join public.messages m on m.id = a.message_id
  where m.sender_id = v_user or a.uploaded_by = v_user;

  select coalesce(array_agg(storage_path), '{}') into v_evidence
  from public.verification_evidence where uploaded_by = v_user and deleted_at is null;

  update public.memberships
  set status = 'ended', ended_at = coalesce(ended_at, now()), end_reason = coalesce(end_reason, 'account deleted')
  where user_id = v_user and status <> 'ended';

  update public.role_assignments ra
  set ends_at = now(), ended_by = v_user, end_reason = 'account deleted'
  from public.memberships m
  where ra.membership_id = m.id and m.user_id = v_user and ra.ends_at is null;

  update public.conversation_members
  set removed_at = coalesce(removed_at, now())
  where user_id = v_user and removed_at is null;

  update public.room_assignments a
  set ends_on = case when a.starts_on < current_date then current_date - 1 else a.starts_on end,
      ended_by = v_user,
      end_reason = 'account deleted'
  from public.memberships m
  where a.membership_id = m.id and m.user_id = v_user and (a.ends_on is null or a.ends_on >= current_date);

  update public.messages
  set deleted_at = coalesce(deleted_at, now()), deleted_by = v_user, body = '', mentions = '{}', mention_role_ids = '{}', mention_all = false, pinned_at = null, pinned_by = null
  where sender_id = v_user and deleted_at is null;

  delete from public.message_attachments a
  using public.messages m
  where a.message_id = m.id and (m.sender_id = v_user or a.uploaded_by = v_user);

  delete from public.message_reactions where user_id = v_user;
  delete from public.user_blocks where blocker_id = v_user or blocked_id = v_user;
  delete from public.notifications where user_id = v_user;
  delete from public.notification_preferences where user_id = v_user;

  update public.message_reports set message_snapshot = '' where reported_user_id = v_user;
  update public.message_reports set details = null where reporter_id = v_user;

  update public.chapter_applications
  set applicant_full_name = 'Deleted member',
      institutional_email = null,
      national_contact_name = null,
      national_contact_email = null,
      fsl_contact_name = null,
      fsl_contact_email = null,
      officer_statement = null
  where applicant_id = v_user;

  delete from public.institutional_email_challenges c
  using public.chapter_applications a
  where c.application_id = a.id and a.applicant_id = v_user;

  update public.verification_events set message = null where actor_id = v_user;

  update public.verification_evidence set deleted_at = now() where uploaded_by = v_user and deleted_at is null;

  update public.chapter_invitations
  set email = 'deleted-' || id::text || '@deleted.invalid',
      full_name = null,
      status = case when status = 'pending' then 'revoked' else status end
  where lower(email) = lower(v_email);

  delete from public.prospect_notes n
  using public.prospects p
  where n.prospect_id = p.id and p.email is not null and lower(p.email) = lower(v_email);

  update public.recruitment_activities a
  set notes = null
  from public.prospects p
  where a.prospect_id = p.id and p.email is not null and lower(p.email) = lower(v_email);

  update public.prospects
  set full_name = 'Deleted member', preferred_name = null, email = null, phone = null, major = null, hometown = null, interests = '{}'
  where email is not null and lower(email) = lower(v_email);

  update public.profile_details
  set pronouns = null, major = null, hometown = null, bio = null, interests = '{}', social_links = '{}'::jsonb, phone = null
  where user_id = v_user;

  update public.platform_staff set revoked_at = coalesce(revoked_at, now()) where user_id = v_user;

  update public.profiles
  set display_name = 'Deleted member', full_name = '', avatar_path = null, graduation_year = null, erased_at = now()
  where id = v_user;

  update auth.users
  set email = 'deleted-' || id::text || '@deleted.invalid',
      raw_user_meta_data = '{}'::jsonb
  where id = v_user;

  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id = $1' using v_user;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using v_user;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1' using v_user;
  end if;

  perform private.write_audit(null, 'account.erased', 'profile', v_user::text, '{}'::jsonb);

  return jsonb_build_object(
    'avatars', case when v_avatar is null then '[]'::jsonb else jsonb_build_array(v_avatar) end,
    'chat-attachments', to_jsonb(v_attachments),
    'verification-evidence', to_jsonb(v_evidence)
  );
end;
$$;

revoke execute on function public.erase_my_account(text) from public, anon;
grant execute on function public.erase_my_account(text) to authenticated;

insert into public.terms_documents (kind, version, title, summary, body, published_at)
values (
  'privacy_policy',
  '2026-10-21.2',
  'Privacy Policy',
  'What GreekGeek collects, who can see it, and how to download or delete your account.',
  $policy$GreekGeek stores the information a chapter needs to run: your account, your membership, messages, and dues records. This policy says what that includes, who can see it, and how you can take it with you or delete it.

1. What we collect
Account data: your name, email address, password (stored by our authentication provider as a hash), profile details you choose to add, and your photo.
Chapter data: membership, roles, event responses, housing assignments, and announcements you post.
Messages and files you send in chapter conversations.
Verification data you submit when applying for a chapter, including a school email address and documents you upload.
Payment data: dues balances, receipts, and refunds. Card and bank numbers are collected by Stripe and are not stored by GreekGeek.
Technical data: security logs of sensitive actions, such as role changes and payment settings.

2. Why
We use this information to provide the service your chapter signed up for, to keep accounts secure, and to keep the financial records chapters and tax rules require. We do not sell personal information, and we do not share it with advertisers.

3. Who can see it
Other members of your chapter can see the profile fields you set to chapter visibility.
Officers see more only when their role includes that permission. A treasurer can see balances. A recruitment chair can see recruitment notes. Platform staff cannot read private conversations or recruitment notes.
Direct messages are visible only to the people in them.
Verification documents are visible only to you and platform reviewers.

4. Your choices
You can correct your profile, photo, and notification settings from Account settings at any time.
Download my data, on the same page, gives you a copy of your profile, memberships, messages, and chapter applications. This is your right to access the personal information we hold.
Delete my account, on the same page, erases that personal information. Deletion is immediate after you confirm it by typing your email address. There is no charge for a request, and you do not need to contact anyone to make one.

5. What deletion removes
Your name, photo, phone number, biography, and other profile details.
The contents of messages you sent, and files attached to them.
Your notifications and notification settings.
School email addresses and verification documents you uploaded.
Your sign-in email is released so it can be used for a new account, and you are signed out.

6. What deletion keeps
Chapters still need a record that a membership, a payment, or an event response existed. Those rows stay, with your name replaced by "Deleted member".
Payment and ledger entries stay for as long as tax and accounting rules require, which is typically seven years. They no longer include your name or email address.
Security audit logs stay so a chapter can see that an action happened. They are not used to identify you for any other purpose.
If you are the only administrator of a chapter, or the only platform administrator, you must hand that role to someone else before deleting your account. That protects the chapter's records and access.

7. How long we keep information
Profile and message content is kept until you delete it or delete your account.
Financial records are kept for the retention period above, then remain only as anonymous ledger entries.
Verification documents are removed when you delete your account, or when a reviewer no longer needs them.

8. Children
GreekGeek is for college chapters. It is not directed at children under 16, and we do not knowingly collect their information.

9. Contact and changes
Use Download my data and Delete my account on your account page to exercise these rights. If a request needs something those tools do not cover, contact the officer who administers your chapter.
We will post changes to this policy on this page. Where a change affects a chapter agreement, the chapter administrator is asked to accept the new version.

This policy should be reviewed by qualified counsel before GreekGeek is offered commercially.$policy$,
  now()
)
on conflict (kind, version) do nothing;
