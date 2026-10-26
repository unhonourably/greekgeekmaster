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

create or replace function public.accept_chapter_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return private.accept_invitation_as(p_token_hash, auth.uid());
end;
$$;

revoke execute on function public.accept_chapter_invitation(text) from public, anon;
grant execute on function public.accept_chapter_invitation(text) to authenticated;

create or replace function private.manually_accept_invitations(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_confirmed boolean;
  v_inv record;
  v_accepted jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
begin
  select id, email_confirmed_at is null into v_user, v_confirmed
  from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no account exists for %; they need to sign up first', p_email using errcode = '22023';
  end if;
  update auth.users set email_confirmed_at = now() where id = v_user and email_confirmed_at is null;
  for v_inv in
    select i.token_hash, c.organization_name, c.designation
    from public.chapter_invitations i
    join public.chapters c on c.id = i.chapter_id
    where lower(i.email) = lower(trim(p_email)) and i.status = 'pending'
    order by i.created_at
  loop
    begin
      perform private.accept_invitation_as(v_inv.token_hash, v_user);
      v_accepted := v_accepted || to_jsonb(concat_ws(', ', v_inv.organization_name, v_inv.designation));
    exception when others then
      v_failed := v_failed || jsonb_build_object('chapter', concat_ws(', ', v_inv.organization_name, v_inv.designation), 'reason', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('user_id', v_user, 'email_confirmed_now', v_confirmed, 'accepted', v_accepted, 'failed', v_failed);
end;
$$;

revoke execute on function private.manually_accept_invitations(text) from public, anon, authenticated;

insert into public.terms_documents (kind, version, title, summary, body, pricing_rule_id, published_at)
select kind, '2026-10-21.1',
  regexp_replace(title, '\mChapter\M', 'GreekGeek', 'g'),
  regexp_replace(summary, '\mChapter\M', 'GreekGeek', 'g'),
  regexp_replace(body, '\mChapter\M', 'GreekGeek', 'g'),
  pricing_rule_id, now()
from public.terms_documents
where version = '2026-10-21' and published_at is not null
on conflict (kind, version) do nothing;

update public.saas_plans set name = 'GreekGeek subscription' where code = 'chapter_monthly' and name = 'Chapter subscription';
