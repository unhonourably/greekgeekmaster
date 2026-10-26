update public.role_templates set permission_keys = array['members.manage','committees.manage','finance.view','chat.manage','chat.moderate','announcements.publish','announcements.officers','events.manage','attendance.view','recruitment.view','standards.view','analytics.view','audit.view'],
  description = 'Second in command with the same visibility as the president'
where key = 'vice_president';
update public.role_templates set permission_keys = array['finance.view','finance.manage','finance.refund','payments.configure','announcements.officers','analytics.view','audit.view'] where key = 'treasurer';
update public.role_templates set permission_keys = array['attendance.view','attendance.manage','committees.manage','announcements.publish','announcements.officers','events.manage','analytics.view'] where key = 'secretary';
update public.role_templates set permission_keys = array['recruitment.view','recruitment.manage','events.manage','announcements.officers','analytics.view'] where key = 'recruitment_chair';
update public.role_templates set permission_keys = array['events.manage','attendance.view','announcements.officers'] where key = 'social_chair';
update public.role_templates set permission_keys = array['standards.view','standards.manage','events.manage','attendance.view','announcements.officers'] where key = 'risk_management_chair';
update public.role_templates set permission_keys = array['standards.view','attendance.view','announcements.officers'] where key = 'standards_board';

update public.roles r set description = t.description
from public.role_templates t
where r.kind = 'system' and r.key = 'vice_president' and t.key = r.key;

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
from (values
  ('vice_president', 'finance.view'),
  ('vice_president', 'chat.moderate'),
  ('vice_president', 'recruitment.view'),
  ('vice_president', 'standards.view'),
  ('vice_president', 'audit.view'),
  ('treasurer', 'audit.view'),
  ('secretary', 'committees.manage'),
  ('secretary', 'analytics.view'),
  ('recruitment_chair', 'analytics.view'),
  ('social_chair', 'attendance.view'),
  ('risk_management_chair', 'attendance.view'),
  ('standards_board', 'attendance.view')
) as x (role_key, permission_key)
join public.roles r on r.key = x.role_key and r.kind = 'system'
on conflict do nothing;

create or replace function private.guard_role_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  if not private.is_api_role() then
    return coalesce(new, old);
  end if;
  select * into v_role from public.roles where id = coalesce(new.role_id, old.role_id);
  if v_role.is_owner then
    raise exception 'administrator role permissions are fixed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'role permissions are added or removed, not updated' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not private.has_permission(v_role.chapter_id, new.permission_key) then
    raise exception 'you cannot grant permissions you do not hold' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and v_role.id is not null and not private.has_permission(v_role.chapter_id, old.permission_key) then
    raise exception 'you cannot remove permissions you do not hold' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.update_membership(
  p_membership uuid,
  p_member_class public.member_class,
  p_status public.membership_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null or not private.has_permission(v_m.chapter_id, 'members.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_m.user_id = auth.uid() then
    raise exception 'you cannot change your own membership' using errcode = '42501';
  end if;
  if v_m.status = 'ended' then
    raise exception 'ended memberships cannot be changed' using errcode = '22023';
  end if;
  if p_status = 'ended' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required to end a membership' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id and r.is_owner
    where ra.membership_id = v_m.id and ra.ends_at is null
  ) and p_status <> 'active' and not private.has_permission(v_m.chapter_id, 'chapter.ownership') then
    raise exception 'only administrators can deactivate another administrator' using errcode = '42501';
  end if;
  if p_status <> 'active' and p_status <> v_m.status and not private.has_permission(v_m.chapter_id, 'roles.manage') and exists (
    select 1 from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
    where ra.membership_id = v_m.id and ra.ends_at is null and not private.has_permission(v_m.chapter_id, rp.permission_key)
  ) then
    raise exception 'this officer holds permissions you do not have; ask someone who manages roles' using errcode = '42501';
  end if;
  update public.memberships
  set member_class = p_member_class,
      status = p_status,
      ended_at = case when p_status = 'ended' then now() else null end,
      end_reason = nullif(btrim(p_reason), '')
  where id = v_m.id;
  if p_status in ('ended', 'suspended') then
    update public.role_assignments
    set ends_at = now(), ended_by = auth.uid(), end_reason = 'membership ' || p_status::text
    where membership_id = v_m.id and ends_at is null;
  end if;
  perform private.write_audit(v_m.chapter_id, 'membership.updated', 'membership', v_m.id::text,
    jsonb_build_object('from_class', v_m.member_class, 'to_class', p_member_class, 'from_status', v_m.status, 'to_status', p_status, 'reason', p_reason));
end;
$$;

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
  if not (
    private.has_permission(p_chapter, 'members.manage')
    or (
      private.has_permission(p_chapter, 'recruitment.manage')
      and p_member_class = 'new_member'
      and coalesce(cardinality(p_role_keys), 0) = 0
      and p_import_batch is null
    )
  ) then
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

create or replace function public.charge_member_assessment(p_assessment uuid, p_membership uuid, p_amount_cents bigint default null, p_due_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.dues_assessments;
  v_user uuid;
  v_amount bigint;
  v_due date;
  v_ma uuid;
begin
  select * into v_a from public.dues_assessments where id = p_assessment for update;
  if v_a.id is null or not private.has_permission(v_a.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_a.status not in ('issued', 'closed') then
    raise exception 'only assessments that were already sent can be charged to one member' using errcode = '22023';
  end if;
  select user_id into v_user from public.memberships
  where id = p_membership and chapter_id = v_a.chapter_id and status in ('active', 'inactive');
  if v_user is null then
    raise exception 'member is not in this chapter' using errcode = '42501';
  end if;
  if exists (select 1 from public.member_assessments where assessment_id = v_a.id and membership_id = p_membership) then
    raise exception 'this member already has a charge for this assessment' using errcode = '23505';
  end if;
  v_amount := coalesce(p_amount_cents, v_a.default_amount_cents);
  if v_amount < 50 or v_amount > 10000000 then
    raise exception 'amount must be between $0.50 and $100,000' using errcode = '22023';
  end if;
  v_due := coalesce(p_due_date, greatest(v_a.due_date, current_date + 14));
  if v_due < current_date - 1 then
    raise exception 'due date cannot be in the past' using errcode = '22023';
  end if;
  delete from public.assessment_exemptions where assessment_id = v_a.id and membership_id = p_membership;
  insert into public.member_assessments (chapter_id, assessment_id, membership_id, amount_cents, due_date, issued_by)
  values (v_a.chapter_id, v_a.id, p_membership, v_amount, v_due, auth.uid())
  returning id into v_ma;
  perform private.post_ledger(
    v_a.chapter_id, 'assessment', v_a.title, 'assessment:' || v_ma::text,
    jsonb_build_array(
      jsonb_build_object('account', 'member_receivable', 'amount', v_amount, 'membership_id', p_membership, 'member_assessment_id', v_ma),
      jsonb_build_object('account', 'dues_revenue', 'amount', -v_amount)
    ),
    jsonb_build_object('membership_id', p_membership, 'member_assessment_id', v_ma)
  );
  perform private.notify(
    v_user, v_a.chapter_id, 'dues_assessed',
    'New balance: ' || v_a.title, 'Due ' || to_char(v_due, 'Mon DD, YYYY') || '. Open your billing page for details.',
    '/c/' || (select slug from public.chapters where id = v_a.chapter_id) || '/billing',
    'assessment:' || v_ma::text
  );
  perform private.write_audit(v_a.chapter_id, 'assessment.member_charged', 'dues_assessment', v_a.id::text,
    jsonb_build_object('membership_id', p_membership, 'amount_cents', v_amount, 'due_date', v_due, 'default_amount_cents', v_a.default_amount_cents));
  return v_ma;
end;
$$;

revoke execute on function public.charge_member_assessment(uuid, uuid, bigint, date) from public, anon;
grant execute on function public.charge_member_assessment(uuid, uuid, bigint, date) to authenticated;

insert into public.notification_kinds (kind, label, description, default_in_app, default_email, required) values
  ('housing_update', 'Housing updates', 'Room assignments, move-out dates, and answers to your housing requests', true, true, false)
on conflict (kind) do nothing;

create table public.housing_rooms (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 1 and 60),
  floor text check (char_length(floor) <= 40),
  capacity int not null default 2 check (capacity between 1 and 12),
  rent_cents bigint check (rent_cents is null or rent_cents between 0 and 10000000),
  features text[] not null default '{}' check (cardinality(features) <= 12),
  notes text check (char_length(notes) <= 500),
  archived_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create unique index housing_rooms_name on public.housing_rooms (chapter_id, lower(name)) where archived_at is null;

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  room_id uuid not null,
  membership_id uuid not null,
  bed_label text check (char_length(bed_label) <= 20),
  starts_on date not null,
  ends_on date,
  assigned_by uuid not null references public.profiles (id),
  ended_by uuid references public.profiles (id),
  end_reason text check (char_length(end_reason) <= 200),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (chapter_id, room_id) references public.housing_rooms (chapter_id, id),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id)
);

create index room_assignments_room on public.room_assignments (room_id, starts_on);
create index room_assignments_member on public.room_assignments (membership_id, starts_on);

create or replace function private.check_room_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_room public.housing_rooms;
  v_span daterange := daterange(new.starts_on, new.ends_on, '[]');
begin
  select * into v_room from public.housing_rooms where id = new.room_id for update;
  if v_room.archived_at is not null and (tg_op = 'INSERT' or new.room_id is distinct from old.room_id) then
    raise exception 'this room is archived' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.room_assignments a
    where a.membership_id = new.membership_id and a.id <> new.id
      and daterange(a.starts_on, a.ends_on, '[]') && v_span
  ) then
    raise exception 'this member already has a room for those dates' using errcode = '23P01';
  end if;
  if (
    select count(*) from public.room_assignments a
    where a.room_id = new.room_id and a.id <> new.id
      and daterange(a.starts_on, a.ends_on, '[]') && v_span
  ) >= v_room.capacity then
    raise exception 'this room is full for those dates' using errcode = '23P01';
  end if;
  if new.bed_label is not null and exists (
    select 1 from public.room_assignments a
    where a.room_id = new.room_id and a.id <> new.id and lower(a.bed_label) = lower(new.bed_label)
      and daterange(a.starts_on, a.ends_on, '[]') && v_span
  ) then
    raise exception 'that bed is already taken for those dates' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger room_assignments_check before insert or update on public.room_assignments
  for each row execute function private.check_room_assignment();

create table public.housing_requests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  membership_id uuid not null,
  term_label text not null check (char_length(term_label) between 2 and 40),
  preferred_room_ids uuid[] not null default '{}' check (cardinality(preferred_room_ids) <= 3),
  roommate_membership_ids uuid[] not null default '{}' check (cardinality(roommate_membership_ids) <= 3),
  wants_single boolean not null default false,
  notes text check (char_length(notes) <= 1000),
  status text not null default 'submitted' check (status in ('submitted', 'waitlisted', 'placed', 'declined', 'withdrawn')),
  response text check (char_length(response) <= 500),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id)
);

create unique index housing_requests_term on public.housing_requests (membership_id, lower(term_label)) where status <> 'withdrawn';

create trigger housing_rooms_touch before update on public.housing_rooms for each row execute function private.touch_updated_at();
create trigger housing_requests_touch before update on public.housing_requests for each row execute function private.touch_updated_at();

alter table public.housing_rooms enable row level security;
alter table public.room_assignments enable row level security;
alter table public.housing_requests enable row level security;

create policy housing_rooms_read on public.housing_rooms for select to authenticated using (private.is_member(chapter_id));
create policy room_assignments_read on public.room_assignments for select to authenticated using (private.is_member(chapter_id));
create policy housing_requests_read on public.housing_requests for select to authenticated
  using (membership_id = private.active_membership_id(chapter_id) or private.has_permission(chapter_id, 'housing.manage'));

create or replace function private.housing_link(p_chapter uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select '/c/' || slug || '/housing' from public.chapters where id = p_chapter
$$;

revoke execute on function private.housing_link(uuid) from public, anon, authenticated;

create or replace function public.save_housing_room(
  p_chapter uuid,
  p_room uuid,
  p_name text,
  p_floor text,
  p_capacity int,
  p_rent_cents bigint,
  p_features text[],
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.housing_rooms;
  v_features text[] := coalesce((
    select array_agg(distinct left(btrim(f), 40)) from unnest(p_features) f where btrim(f) <> ''
  ), '{}');
  v_peak int;
begin
  if not private.has_permission(p_chapter, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'room names must be 1 to 60 characters' using errcode = '22023';
  end if;
  if p_room is null then
    insert into public.housing_rooms (chapter_id, name, floor, capacity, rent_cents, features, notes, created_by)
    values (p_chapter, btrim(p_name), nullif(btrim(p_floor), ''), p_capacity, p_rent_cents, v_features, nullif(btrim(p_notes), ''), auth.uid())
    returning * into v_room;
    perform private.write_audit(p_chapter, 'housing.room_created', 'housing_room', v_room.id::text, jsonb_build_object('name', v_room.name, 'capacity', v_room.capacity));
    return v_room.id;
  end if;
  select * into v_room from public.housing_rooms where id = p_room and chapter_id = p_chapter for update;
  if v_room.id is null then
    raise exception 'room not found' using errcode = '22023';
  end if;
  select count(*) into v_peak from public.room_assignments
  where room_id = v_room.id and (ends_on is null or ends_on >= current_date);
  if p_capacity < v_peak then
    raise exception 'this room has % current or upcoming residents; move someone out before lowering capacity', v_peak using errcode = '22023';
  end if;
  update public.housing_rooms
  set name = btrim(p_name), floor = nullif(btrim(p_floor), ''), capacity = p_capacity, rent_cents = p_rent_cents,
      features = v_features, notes = nullif(btrim(p_notes), '')
  where id = v_room.id;
  perform private.write_audit(p_chapter, 'housing.room_updated', 'housing_room', v_room.id::text,
    jsonb_build_object('name', btrim(p_name), 'capacity', p_capacity, 'rent_cents', p_rent_cents));
  return v_room.id;
end;
$$;

create or replace function public.set_housing_room_archived(p_room uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.housing_rooms;
begin
  select * into v_room from public.housing_rooms where id = p_room for update;
  if v_room.id is null or not private.has_permission(v_room.chapter_id, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_archived and exists (select 1 from public.room_assignments where room_id = v_room.id and (ends_on is null or ends_on >= current_date)) then
    raise exception 'move everyone out of this room before archiving it' using errcode = '22023';
  end if;
  update public.housing_rooms set archived_at = case when p_archived then now() else null end where id = v_room.id;
  perform private.write_audit(v_room.chapter_id, case when p_archived then 'housing.room_archived' else 'housing.room_restored' end, 'housing_room', v_room.id::text, '{}'::jsonb);
end;
$$;

create or replace function public.assign_room(
  p_room uuid,
  p_membership uuid,
  p_starts_on date,
  p_ends_on date,
  p_bed text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.housing_rooms;
  v_user uuid;
  v_id uuid;
  v_moved int;
begin
  select * into v_room from public.housing_rooms where id = p_room;
  if v_room.id is null or not private.has_permission(v_room.chapter_id, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_room.archived_at is not null then
    raise exception 'this room is archived' using errcode = '22023';
  end if;
  select user_id into v_user from public.memberships where id = p_membership and chapter_id = v_room.chapter_id and status = 'active';
  if v_user is null then
    raise exception 'only active members can be assigned a room' using errcode = '22023';
  end if;
  if p_starts_on is null then
    raise exception 'pick a move-in date' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'move-out must be on or after move-in' using errcode = '22023';
  end if;
  update public.room_assignments
  set ends_on = p_starts_on - 1, ended_by = auth.uid(), end_reason = left('Moved to ' || v_room.name, 200)
  where membership_id = p_membership and starts_on < p_starts_on and (ends_on is null or ends_on >= p_starts_on);
  get diagnostics v_moved = row_count;
  insert into public.room_assignments (chapter_id, room_id, membership_id, bed_label, starts_on, ends_on, assigned_by)
  values (v_room.chapter_id, v_room.id, p_membership, nullif(btrim(p_bed), ''), p_starts_on, p_ends_on, auth.uid())
  returning id into v_id;
  update public.housing_requests
  set status = 'placed', reviewed_by = auth.uid(), reviewed_at = now()
  where membership_id = p_membership and status in ('submitted', 'waitlisted');
  perform private.notify(
    v_user, v_room.chapter_id, 'housing_update',
    case when v_moved > 0 then 'You are moving to ' || v_room.name else 'Room assignment: ' || v_room.name end,
    'Move in ' || to_char(p_starts_on, 'Mon DD, YYYY') || coalesce('. Move out ' || to_char(p_ends_on, 'Mon DD, YYYY'), '') || '.',
    private.housing_link(v_room.chapter_id),
    'room:' || v_id::text
  );
  perform private.write_audit(v_room.chapter_id, 'housing.room_assigned', 'room_assignment', v_id::text,
    jsonb_build_object('room_id', v_room.id, 'membership_id', p_membership, 'starts_on', p_starts_on, 'ends_on', p_ends_on, 'moved', v_moved > 0));
  return v_id;
end;
$$;

create or replace function public.end_room_assignment(p_assignment uuid, p_ends_on date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.room_assignments;
  v_room text;
  v_user uuid;
begin
  select * into v_a from public.room_assignments where id = p_assignment for update;
  if v_a.id is null or not private.has_permission(v_a.chapter_id, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_ends_on is null then
    raise exception 'pick a move-out date' using errcode = '22023';
  end if;
  select name into v_room from public.housing_rooms where id = v_a.room_id;
  select user_id into v_user from public.memberships where id = v_a.membership_id;
  if p_ends_on < v_a.starts_on then
    if v_a.starts_on <= current_date then
      raise exception 'move-out must be on or after move-in' using errcode = '22023';
    end if;
    delete from public.room_assignments where id = v_a.id;
    perform private.notify(v_user, v_a.chapter_id, 'housing_update', 'Room assignment cancelled', 'Your upcoming assignment to ' || v_room || ' was cancelled.',
      private.housing_link(v_a.chapter_id), 'room-cancel:' || v_a.id::text);
    perform private.write_audit(v_a.chapter_id, 'housing.assignment_cancelled', 'room_assignment', v_a.id::text, jsonb_build_object('reason', p_reason));
    return;
  end if;
  update public.room_assignments
  set ends_on = p_ends_on, ended_by = auth.uid(), end_reason = nullif(left(btrim(coalesce(p_reason, '')), 200), '')
  where id = v_a.id;
  perform private.notify(v_user, v_a.chapter_id, 'housing_update', 'Move-out date set', 'Your last night in ' || v_room || ' is ' || to_char(p_ends_on, 'Mon DD, YYYY') || '.',
    private.housing_link(v_a.chapter_id), 'room-end:' || v_a.id::text || ':' || p_ends_on::text);
  perform private.write_audit(v_a.chapter_id, 'housing.assignment_ended', 'room_assignment', v_a.id::text, jsonb_build_object('ends_on', p_ends_on, 'reason', p_reason));
end;
$$;

create or replace function public.submit_housing_request(
  p_chapter uuid,
  p_term text,
  p_rooms uuid[],
  p_roommates uuid[],
  p_single boolean,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.active_membership_id(p_chapter);
  v_rooms uuid[] := coalesce((select array_agg(distinct r) from unnest(p_rooms) r where r is not null), '{}');
  v_mates uuid[] := coalesce((select array_agg(distinct r) from unnest(p_roommates) r where r is not null), '{}');
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_term, ''))) not between 2 and 40 then
    raise exception 'name the term you are requesting housing for' using errcode = '22023';
  end if;
  if cardinality(v_rooms) > 3 or cardinality(v_mates) > 3 then
    raise exception 'pick up to three rooms and three roommates' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_rooms) r where not exists (select 1 from public.housing_rooms h where h.id = r and h.chapter_id = p_chapter and h.archived_at is null)) then
    raise exception 'unknown room' using errcode = '22023';
  end if;
  if v_me = any (v_mates) or exists (select 1 from unnest(v_mates) r where not exists (select 1 from public.memberships m where m.id = r and m.chapter_id = p_chapter and m.status = 'active')) then
    raise exception 'roommates must be other active members' using errcode = '22023';
  end if;
  select id into v_id from public.housing_requests
  where membership_id = v_me and lower(term_label) = lower(btrim(p_term)) and status <> 'withdrawn'
  for update;
  if v_id is not null then
    if exists (select 1 from public.housing_requests where id = v_id and status in ('placed', 'declined')) then
      raise exception 'your request for this term was already answered' using errcode = '22023';
    end if;
    update public.housing_requests
    set preferred_room_ids = v_rooms, roommate_membership_ids = v_mates, wants_single = coalesce(p_single, false), notes = nullif(btrim(p_notes), '')
    where id = v_id;
    return v_id;
  end if;
  insert into public.housing_requests (chapter_id, membership_id, term_label, preferred_room_ids, roommate_membership_ids, wants_single, notes)
  values (p_chapter, v_me, btrim(p_term), v_rooms, v_mates, coalesce(p_single, false), nullif(btrim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.withdraw_housing_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.housing_requests set status = 'withdrawn'
  where id = p_request and status in ('submitted', 'waitlisted')
    and membership_id = private.active_membership_id(chapter_id);
  if not found then
    raise exception 'request not found' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.respond_housing_request(p_request uuid, p_status text, p_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.housing_requests;
  v_user uuid;
begin
  select * into v_r from public.housing_requests where id = p_request for update;
  if v_r.id is null or not private.has_permission(v_r.chapter_id, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('waitlisted', 'placed', 'declined') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if v_r.status = 'withdrawn' then
    raise exception 'this request was withdrawn' using errcode = '22023';
  end if;
  update public.housing_requests
  set status = p_status, response = nullif(left(btrim(coalesce(p_response, '')), 500), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = v_r.id;
  select user_id into v_user from public.memberships where id = v_r.membership_id;
  perform private.notify(
    v_user, v_r.chapter_id, 'housing_update',
    'Housing request for ' || v_r.term_label || ': ' || case p_status when 'placed' then 'placed' when 'waitlisted' then 'waitlisted' else 'not placed' end,
    coalesce(nullif(btrim(p_response), ''), 'Open housing for details.'),
    private.housing_link(v_r.chapter_id),
    'housing-request:' || v_r.id::text || ':' || p_status
  );
end;
$$;

create or replace function public.bill_room_rent(p_chapter uuid, p_title text, p_due_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members uuid[];
  v_amounts jsonb;
  v_max bigint;
  v_id uuid;
  v_count int;
begin
  if not private.has_permission(p_chapter, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then
    raise exception 'give the charge a title' using errcode = '22023';
  end if;
  if p_due_date is null or p_due_date < current_date - 1 then
    raise exception 'due date cannot be in the past' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.dues_assessments
    where chapter_id = p_chapter and category = 'housing' and lower(title) = lower(btrim(p_title)) and status <> 'cancelled'
  ) then
    raise exception 'a rent charge with this title already exists' using errcode = '23505';
  end if;
  select array_agg(a.membership_id), jsonb_object_agg(a.membership_id::text, r.rent_cents), max(r.rent_cents)
  into v_members, v_amounts, v_max
  from public.room_assignments a
  join public.housing_rooms r on r.id = a.room_id
  join public.memberships m on m.id = a.membership_id and m.status in ('active', 'inactive')
  where a.chapter_id = p_chapter and a.starts_on <= current_date and (a.ends_on is null or a.ends_on >= current_date)
    and r.rent_cents >= 50;
  if coalesce(cardinality(v_members), 0) = 0 then
    raise exception 'no current residents live in a room with rent set' using errcode = '22023';
  end if;
  insert into public.dues_assessments (chapter_id, title, description, category, default_amount_cents, due_date, created_by)
  values (p_chapter, btrim(p_title), 'Room rent for current residents', 'housing', v_max, p_due_date, auth.uid())
  returning id into v_id;
  v_count := public.issue_dues_assessment(v_id, v_members, v_amounts);
  return jsonb_build_object('assessment_id', v_id, 'count', v_count);
end;
$$;

revoke execute on function public.save_housing_room(uuid, uuid, text, text, int, bigint, text[], text) from public, anon;
grant execute on function public.save_housing_room(uuid, uuid, text, text, int, bigint, text[], text) to authenticated;
revoke execute on function public.set_housing_room_archived(uuid, boolean) from public, anon;
grant execute on function public.set_housing_room_archived(uuid, boolean) to authenticated;
revoke execute on function public.assign_room(uuid, uuid, date, date, text) from public, anon;
grant execute on function public.assign_room(uuid, uuid, date, date, text) to authenticated;
revoke execute on function public.end_room_assignment(uuid, date, text) from public, anon;
grant execute on function public.end_room_assignment(uuid, date, text) to authenticated;
revoke execute on function public.submit_housing_request(uuid, text, uuid[], uuid[], boolean, text) from public, anon;
grant execute on function public.submit_housing_request(uuid, text, uuid[], uuid[], boolean, text) to authenticated;
revoke execute on function public.withdraw_housing_request(uuid) from public, anon;
grant execute on function public.withdraw_housing_request(uuid) to authenticated;
revoke execute on function public.respond_housing_request(uuid, text, text) from public, anon;
grant execute on function public.respond_housing_request(uuid, text, text) to authenticated;
revoke execute on function public.bill_room_rent(uuid, text, date) from public, anon;
grant execute on function public.bill_room_rent(uuid, text, date) to authenticated;

update public.permissions set description = 'Manage rooms, residents, maintenance, chores, and inventory' where key = 'housing.manage';
