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
  if exists (
    select 1 from public.room_assignments a
    where a.membership_id = v_me and (a.ends_on is null or a.ends_on >= current_date)
  ) then
    raise exception 'you already have a room assignment' using errcode = '22023';
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

create or replace function public.delete_housing_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.housing_requests;
begin
  select * into v_r from public.housing_requests where id = p_request for update;
  if v_r.id is null then
    raise exception 'request not found' using errcode = '22023';
  end if;
  if v_r.membership_id is distinct from private.active_membership_id(v_r.chapter_id)
     and not private.has_permission(v_r.chapter_id, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.housing_requests where id = v_r.id;
end;
$$;

revoke execute on function public.delete_housing_request(uuid) from public, anon;
grant execute on function public.delete_housing_request(uuid) to authenticated;

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
  if p_status = 'placed' and not exists (
    select 1 from public.room_assignments a
    where a.membership_id = v_r.membership_id and (a.ends_on is null or a.ends_on >= current_date)
  ) then
    raise exception 'assign them a room before marking this request placed' using errcode = '22023';
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
  v_closed int;
  v_replaced int;
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
  if exists (
    select 1 from public.room_assignments a
    where a.membership_id = p_membership and a.room_id = p_room
      and daterange(a.starts_on, a.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    raise exception 'this member is already assigned to this room for those dates' using errcode = '22023';
  end if;
  update public.room_assignments
  set ends_on = p_starts_on - 1, ended_by = auth.uid(), end_reason = left('Moved to ' || v_room.name, 200)
  where membership_id = p_membership and starts_on < p_starts_on and (ends_on is null or ends_on >= p_starts_on);
  get diagnostics v_closed = row_count;
  delete from public.room_assignments
  where membership_id = p_membership and starts_on >= p_starts_on
    and daterange(starts_on, ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]');
  get diagnostics v_replaced = row_count;
  v_moved := v_closed + v_replaced;
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

create or replace function public.rsvp_event(p_event uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.events;
  v_going int;
begin
  select * into v_e from public.events where id = p_event for update;
  if v_e.id is null or not private.is_member(v_e.chapter_id) or (v_e.visibility = 'officers' and not private.has_permission(v_e.chapter_id, 'events.manage')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if v_e.cancelled_at is not null then
    raise exception 'event was cancelled' using errcode = '22023';
  end if;
  if v_e.ends_at <= now() then
    raise exception 'this event has ended' using errcode = '22023';
  end if;
  if v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then
    raise exception 'RSVPs are closed' using errcode = '22023';
  end if;
  if p_status = 'going' and v_e.capacity is not null then
    select count(*) into v_going from public.event_rsvps where event_id = v_e.id and status = 'going' and user_id <> auth.uid();
    if v_going >= v_e.capacity then
      raise exception 'this event is at capacity' using errcode = '22023';
    end if;
  end if;
  insert into public.event_rsvps (event_id, chapter_id, user_id, status)
  values (v_e.id, v_e.chapter_id, auth.uid(), p_status)
  on conflict (event_id, user_id) do update set status = excluded.status, responded_at = now();
end;
$$;

create or replace function public.signup_volunteer_shift(p_shift uuid, p_join boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.volunteer_shifts;
  v_taken int;
begin
  select * into v_s from public.volunteer_shifts where id = p_shift for update;
  if v_s.id is null or not private.is_member(v_s.chapter_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not p_join then
    delete from public.volunteer_signups where shift_id = v_s.id and user_id = auth.uid();
    return;
  end if;
  if v_s.ends_at <= now() then
    raise exception 'this shift has ended' using errcode = '22023';
  end if;
  if exists (select 1 from public.volunteer_signups where shift_id = v_s.id and user_id = auth.uid()) then
    return;
  end if;
  select count(*) into v_taken from public.volunteer_signups where shift_id = v_s.id;
  if v_taken >= v_s.slots then
    raise exception 'this shift is full' using errcode = '22023';
  end if;
  insert into public.volunteer_signups (shift_id, chapter_id, user_id) values (v_s.id, v_s.chapter_id, auth.uid())
  on conflict do nothing;
end;
$$;

create unique index mentorship_one_active_mentee
  on public.mentorship_pairs (mentee_membership_id)
  where status = 'active';
