alter function public.list_incident_reports(uuid) volatile;

create or replace function public.my_chapter_context(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'membership', jsonb_build_object('id', m.id, 'member_class', m.member_class, 'status', m.status),
    'chapter', jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'organization_name', c.organization_name, 'designation', c.designation,
      'greek_letters', c.greek_letters, 'status', c.status, 'timezone', c.timezone, 'currency', c.currency, 'modules', c.modules,
      'university', case when u.id is null then null else jsonb_build_object('name', u.name, 'short_name', u.short_name) end
    ),
    'permissions', to_jsonb(public.my_permissions(c.id))
  )
  from public.chapters c
  join public.memberships m on m.chapter_id = c.id and m.user_id = auth.uid()
  left join public.universities u on u.id = c.university_id
  where c.slug = p_slug
$$;

revoke execute on function public.my_chapter_context(text) from public, anon;
grant execute on function public.my_chapter_context(text) to authenticated;

insert into public.notification_kinds (kind, label, description, default_in_app, default_email, required) values
  ('membership_added', 'Added to a chapter', 'When an officer adds you to a chapter roster', true, true, false)
on conflict (kind) do nothing;

create or replace function public.add_existing_member(p_chapter uuid, p_email text, p_member_class public.member_class)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_existing public.memberships;
  v_membership uuid;
  v_chapter public.chapters;
begin
  if not private.has_permission(p_chapter, 'members.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_chapter from public.chapters where id = p_chapter;
  if v_chapter.status <> 'verified' then
    raise exception 'only verified chapters can add members' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null limit 1;
  if v_user is null or not exists (select 1 from public.profiles where id = v_user) then
    return jsonb_build_object('status', 'no_account');
  end if;
  select * into v_existing from public.memberships where chapter_id = p_chapter and user_id = v_user;
  if v_existing.id is not null and v_existing.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'membership_id', v_existing.id);
  end if;
  if v_existing.status = 'suspended' then
    raise exception 'this person is suspended; change their status from the member page' using errcode = '22023';
  end if;
  insert into public.memberships (chapter_id, user_id, member_class, status, invited_by)
  values (p_chapter, v_user, p_member_class, 'active', auth.uid())
  on conflict (chapter_id, user_id) do update set status = 'active', member_class = excluded.member_class, ended_at = null, end_reason = null
  returning id into v_membership;
  update public.chapter_invitations set status = 'revoked'
  where chapter_id = p_chapter and lower(email) = lower(btrim(p_email)) and status = 'pending';
  perform private.write_audit(p_chapter, 'membership.added', 'membership', v_membership::text, jsonb_build_object('member_class', p_member_class));
  perform private.notify(
    v_user, p_chapter, 'membership_added',
    'You were added to ' || v_chapter.organization_name,
    'An officer added you to the chapter roster.',
    '/c/' || v_chapter.slug,
    'membership_added:' || v_membership::text || ':' || extract(epoch from now())::bigint::text
  );
  return jsonb_build_object('status', 'added', 'membership_id', v_membership);
end;
$$;

revoke execute on function public.add_existing_member(uuid, text, public.member_class) from public, anon;
grant execute on function public.add_existing_member(uuid, text, public.member_class) to authenticated;
