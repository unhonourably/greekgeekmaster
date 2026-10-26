insert into public.role_templates (key, name, description, is_officer, is_owner, badge_tone, sort_order, permission_keys)
values (
  'pledge',
  'Pledge',
  'A new member who has not been initiated. Pledges use the chapter, except housing.',
  false,
  false,
  'neutral',
  150,
  '{}'
)
on conflict (key) do nothing;

do $$
declare
  v_chapter uuid;
begin
  for v_chapter in select id from public.chapters loop
    perform private.provision_chapter_roles(v_chapter);
  end loop;
end $$;

create or replace function private.caller_is_pledge(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_assignments ra on ra.membership_id = m.id and ra.ends_at is null
    join public.roles r on r.id = ra.role_id and r.key = 'pledge'
    where m.chapter_id = p_chapter and m.user_id = auth.uid() and m.status = 'active'
  )
  and not exists (
    select 1
    from public.memberships m
    join public.role_assignments ra on ra.membership_id = m.id and ra.ends_at is null
    join public.roles r on r.id = ra.role_id and r.is_officer
    where m.chapter_id = p_chapter and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

revoke execute on function private.caller_is_pledge(uuid) from public, anon;
grant execute on function private.caller_is_pledge(uuid) to authenticated, current_user;

create or replace function public.am_pledge(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.caller_is_pledge(p_chapter)
$$;

revoke execute on function public.am_pledge(uuid) from public, anon;
grant execute on function public.am_pledge(uuid) to authenticated;

create or replace function private.member_in_house(p_membership uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.room_assignments a
    where a.membership_id = p_membership
      and a.starts_on <= current_date
      and (a.ends_on is null or a.ends_on >= current_date)
  )
$$;

revoke execute on function private.member_in_house(uuid) from public, anon, authenticated;
grant execute on function private.member_in_house(uuid) to current_user;

drop function public.chapter_directory(uuid, text, public.member_class, uuid, public.membership_status, int, int);

create or replace function public.chapter_directory(
  p_chapter uuid,
  p_search text,
  p_class public.member_class,
  p_role uuid,
  p_status public.membership_status,
  p_limit int,
  p_offset int,
  p_residence text default null
)
returns table (
  membership_id uuid, user_id uuid, display_name text, full_name text, avatar_path text, graduation_year int,
  member_class public.member_class, status public.membership_status, joined_at timestamptz, roles jsonb,
  in_house boolean, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_residence text := case
    when p_residence in ('in', 'out') and not private.caller_is_pledge(p_chapter) then p_residence
    else null
  end;
  v_hide boolean := private.caller_is_pledge(p_chapter);
begin
  if not private.is_member(p_chapter) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  with base as (
    select m.id as mid, m.user_id as uid, p.display_name as dn, p.full_name as fn, p.avatar_path as av, p.graduation_year as gy,
      m.member_class as mc, m.status as st, m.joined_at as ja
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.chapter_id = p_chapter
      and (p_status is null and m.status in ('active', 'inactive') or m.status = p_status)
      and (p_status is distinct from 'ended' or private.has_permission(p_chapter, 'members.manage'))
      and (p_class is null or m.member_class = p_class)
      and (p_role is null or exists (select 1 from public.role_assignments ra where ra.membership_id = m.id and ra.role_id = p_role and ra.ends_at is null))
      and (coalesce(btrim(p_search), '') = '' or p.full_name ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
      and (
        v_residence is null
        or (
          m.member_class = 'active'
          and private.member_in_house(m.id) = (v_residence = 'in')
        )
      )
  )
  select b.mid, b.uid, b.dn, b.fn, b.av, b.gy, b.mc, b.st, b.ja,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name, 'tone', r.badge_tone, 'is_officer', r.is_officer, 'is_owner', r.is_owner) order by r.sort_order)
      from public.role_assignments ra join public.roles r on r.id = ra.role_id
      where ra.membership_id = b.mid and ra.ends_at is null
    ), '[]'::jsonb),
    case when v_hide or b.mc <> 'active' then null else private.member_in_house(b.mid) end,
    count(*) over ()
  from base b
  order by (select min(r.sort_order) from public.role_assignments ra join public.roles r on r.id = ra.role_id where ra.membership_id = b.mid and ra.ends_at is null and r.is_officer) nulls last,
    b.fn, b.dn
  limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.chapter_directory(uuid, text, public.member_class, uuid, public.membership_status, int, int, text) from public, anon;
grant execute on function public.chapter_directory(uuid, text, public.member_class, uuid, public.membership_status, int, int, text) to authenticated;

drop policy housing_rooms_read on public.housing_rooms;
create policy housing_rooms_read on public.housing_rooms for select to authenticated
  using (private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id));

drop policy room_assignments_read on public.room_assignments;
create policy room_assignments_read on public.room_assignments for select to authenticated
  using (private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id));

drop policy facilities_read on public.facilities;
create policy facilities_read on public.facilities for select to authenticated
  using (private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id));

drop policy reservations_read on public.facility_reservations;
create policy reservations_read on public.facility_reservations for select to authenticated
  using (private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id));

drop policy reservations_insert on public.facility_reservations;
create policy reservations_insert on public.facility_reservations for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id) and status = 'confirmed');

drop policy maintenance_read on public.maintenance_requests;
create policy maintenance_read on public.maintenance_requests for select to authenticated
  using (
    not private.caller_is_pledge(chapter_id)
    and (
      submitted_by = auth.uid()
      or private.has_permission(chapter_id, 'housing.manage')
      or assigned_membership_id = private.active_membership_id(chapter_id)
    )
  );

drop policy maintenance_insert on public.maintenance_requests;
create policy maintenance_insert on public.maintenance_requests for insert to authenticated
  with check (submitted_by = auth.uid() and private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id) and status = 'open');

drop policy chores_read on public.chores;
create policy chores_read on public.chores for select to authenticated
  using (
    not private.caller_is_pledge(chapter_id)
    and (assigned_membership_id = private.active_membership_id(chapter_id) or private.has_permission(chapter_id, 'housing.manage'))
  );

drop policy supply_read on public.supply_requests;
create policy supply_read on public.supply_requests for select to authenticated
  using (not private.caller_is_pledge(chapter_id) and (requested_by = auth.uid() or private.has_permission(chapter_id, 'housing.manage')));

drop policy supply_insert on public.supply_requests;
create policy supply_insert on public.supply_requests for insert to authenticated
  with check (requested_by = auth.uid() and private.is_member(chapter_id) and not private.caller_is_pledge(chapter_id) and status = 'requested');

create or replace function private.block_pledge_housing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.caller_is_pledge(new.chapter_id) then
    raise exception 'pledges cannot use housing' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger housing_requests_block_pledge
before insert on public.housing_requests
for each row execute function private.block_pledge_housing();
