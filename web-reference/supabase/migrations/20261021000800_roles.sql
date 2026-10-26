create or replace function public.save_chapter_role(
  p_chapter uuid,
  p_role uuid,
  p_name text,
  p_description text,
  p_badge_tone text,
  p_is_officer boolean,
  p_permissions text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
  v_wanted text[] := coalesce((select array_agg(distinct p) from unnest(p_permissions) p), '{}');
  v_current text[] := '{}';
  v_added text[];
  v_removed text[];
  v_key text;
  v_base text;
  v_n int := 1;
begin
  if not private.has_permission(p_chapter, 'roles.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'role names must be 2 to 60 characters' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_wanted) p where not exists (select 1 from public.permissions x where x.key = p)) then
    raise exception 'unknown permission' using errcode = '22023';
  end if;
  if p_role is not null then
    select * into v_role from public.roles where id = p_role and chapter_id = p_chapter for update;
    if v_role.id is null then
      raise exception 'role not found' using errcode = '22023';
    end if;
    if v_role.is_owner then
      raise exception 'administrator role permissions are fixed' using errcode = '42501';
    end if;
    select coalesce(array_agg(permission_key), '{}') into v_current from public.role_permissions where role_id = v_role.id;
  end if;
  select coalesce(array_agg(p), '{}') into v_added from unnest(v_wanted) p where not (p = any (v_current));
  select coalesce(array_agg(p), '{}') into v_removed from unnest(v_current) p where not (p = any (v_wanted));
  if exists (select 1 from unnest(v_added || v_removed) p where not private.has_permission(p_chapter, p)) then
    raise exception 'you can only add or remove permissions you hold yourself' using errcode = '42501';
  end if;
  if p_role is null then
    v_base := left(regexp_replace(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), 32);
    if char_length(v_base) < 2 then
      v_base := 'role';
    end if;
    v_key := v_base;
    while exists (select 1 from public.roles where chapter_id = p_chapter and key = v_key) loop
      v_n := v_n + 1;
      v_key := v_base || '_' || v_n;
    end loop;
    insert into public.roles (chapter_id, key, name, description, kind, is_officer, is_owner, badge_tone, sort_order)
    values (p_chapter, v_key, btrim(p_name), nullif(btrim(p_description), ''), 'custom', coalesce(p_is_officer, true), false, coalesce(p_badge_tone, 'neutral'), 200)
    returning * into v_role;
  else
    update public.roles
    set name = btrim(p_name), description = nullif(btrim(p_description), ''), badge_tone = coalesce(p_badge_tone, badge_tone), is_officer = coalesce(p_is_officer, is_officer)
    where id = v_role.id
    returning * into v_role;
  end if;
  delete from public.role_permissions where role_id = v_role.id and permission_key = any (v_removed);
  insert into public.role_permissions (role_id, permission_key) select v_role.id, p from unnest(v_added) p;
  perform private.write_audit(p_chapter, case when p_role is null then 'role.created' else 'role.updated' end, 'role', v_role.id::text,
    jsonb_build_object('name', v_role.name, 'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed)));
  return v_role.id;
end;
$$;

revoke execute on function public.save_chapter_role(uuid, uuid, text, text, text, boolean, text[]) from public, anon;
grant execute on function public.save_chapter_role(uuid, uuid, text, text, text, boolean, text[]) to authenticated;

create or replace function private.audit_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select name into v_role from public.roles where id = new.role_id;
  if tg_op = 'INSERT' then
    perform private.write_audit(new.chapter_id, 'role.assigned', 'membership', new.membership_id::text, jsonb_build_object('role', v_role, 'role_id', new.role_id));
  elsif old.ends_at is null and new.ends_at is not null then
    perform private.write_audit(new.chapter_id, 'role.ended', 'membership', new.membership_id::text, jsonb_build_object('role', v_role, 'role_id', new.role_id, 'reason', new.end_reason));
  end if;
  return new;
end;
$$;

create trigger role_assignments_audit after insert or update of ends_at on public.role_assignments
  for each row execute function private.audit_role_assignment();

create or replace function private.audit_role_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit(old.chapter_id, 'role.deleted', 'role', old.id::text, jsonb_build_object('name', old.name));
  return old;
end;
$$;

create trigger roles_audit_delete after delete on public.roles
  for each row execute function private.audit_role_delete();
