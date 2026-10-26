insert into public.notification_kinds (kind, label, description, default_in_app, default_email, default_sms, required) values
  ('event_posted', 'Events', 'When an officer publishes, changes, or cancels a chapter event', true, false, true, false),
  ('housing_request', 'Housing requests', 'When a member submits a housing request you can review', true, true, false, false),
  ('philanthropy_update', 'Service hours', 'When your submitted hours are approved or sent back', true, false, false, false),
  ('academic_update', 'Study groups', 'When you are added to a study group', true, false, false, false)
on conflict (kind) do update
  set label = excluded.label,
      description = excluded.description,
      default_in_app = excluded.default_in_app,
      default_sms = excluded.default_sms;

update public.notification_kinds
set default_in_app = true
where kind in (
  'event_posted', 'event_reminder', 'housing_update', 'housing_request',
  'announcement', 'policy_update', 'task_assigned', 'dues_assessed', 'dues_reminder',
  'chat_mention', 'chat_message', 'reimbursement_update', 'philanthropy_update', 'academic_update'
);

create or replace function private.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_title text;
  v_body text;
  v_dedupe text;
  r record;
begin
  if tg_op = 'INSERT' and new.cancelled_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.cancelled_at is not null and old.cancelled_at is null then
      v_title := 'Cancelled: ' || new.title;
      v_body := 'This event was removed from the chapter calendar.';
      v_dedupe := 'event-cancel:' || new.id::text;
    elsif new.cancelled_at is not null then
      return new;
    elsif new.title is distinct from old.title
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.location is distinct from old.location then
      v_title := 'Updated: ' || new.title;
      v_body := coalesce(left(new.location, 160), 'Time or details changed. Open the event for the latest information.');
      v_dedupe := 'event-update:' || new.id::text || ':' || to_char(new.updated_at, 'YYYYMMDDHH24MI');
    else
      return new;
    end if;
  else
    if new.cancelled_at is not null then
      return new;
    end if;
    v_title := new.title;
    v_body := coalesce(left(new.location, 160), 'A new event was added to the chapter calendar.');
    v_dedupe := 'event:' || new.id::text;
  end if;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  for r in
    select m.user_id from public.memberships m
    where m.chapter_id = new.chapter_id and m.status = 'active' and m.user_id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
      and (new.visibility = 'chapter' or private.user_has_permission(m.user_id, new.chapter_id, 'events.manage'))
  loop
    perform private.notify(
      r.user_id,
      new.chapter_id,
      'event_posted',
      v_title,
      v_body,
      '/c/' || v_slug || '/events/' || new.id::text,
      v_dedupe
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists events_notify on public.events;
drop trigger if exists events_notify_change on public.events;
create trigger events_notify_change after insert or update on public.events
  for each row execute function private.notify_event_change();

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
  v_slug text;
  v_name text;
  r record;
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
  if exists (select 1 from unnest(v_rooms) x where not exists (select 1 from public.housing_rooms h where h.id = x and h.chapter_id = p_chapter and h.archived_at is null)) then
    raise exception 'unknown room' using errcode = '22023';
  end if;
  if v_me = any (v_mates) or exists (select 1 from unnest(v_mates) x where not exists (select 1 from public.memberships m where m.id = x and m.chapter_id = p_chapter and m.status = 'active')) then
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
  select slug into v_slug from public.chapters where id = p_chapter;
  select coalesce(nullif(display_name, ''), full_name, 'A member') into v_name from public.profiles where id = auth.uid();
  for r in
    select m.user_id from public.memberships m
    where m.chapter_id = p_chapter and m.status = 'active' and m.user_id <> auth.uid()
      and private.user_has_permission(m.user_id, p_chapter, 'housing.manage')
  loop
    perform private.notify(
      r.user_id,
      p_chapter,
      'housing_request',
      'Housing request from ' || v_name,
      btrim(p_term),
      '/c/' || v_slug || '/housing',
      'housing-submitted:' || v_id::text
    );
  end loop;
  return v_id;
end;
$$;

create or replace function private.notify_service_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  perform private.notify(
    new.user_id,
    new.chapter_id,
    'philanthropy_update',
    case when new.status = 'approved' then 'Service hours approved' else 'Service hours need a look' end,
    trim(to_char(new.hours, 'FM9990.99')) || ' hours at ' || new.organization,
    '/c/' || v_slug || '/philanthropy',
    'hours:' || new.id::text || ':' || new.status
  );
  return new;
end;
$$;

drop trigger if exists service_hours_notify on public.service_hours;
create trigger service_hours_notify after update of status on public.service_hours
  for each row execute function private.notify_service_hours();

create or replace function private.notify_study_group_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_name text;
begin
  if new.user_id = auth.uid() then
    return new;
  end if;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  select name into v_name from public.study_groups where id = new.group_id;
  perform private.notify(
    new.user_id,
    new.chapter_id,
    'academic_update',
    'Added to ' || coalesce(v_name, 'a study group'),
    'Open academics for meeting details.',
    '/c/' || v_slug || '/academics',
    'study:' || new.group_id::text || ':' || new.user_id::text
  );
  return new;
end;
$$;

drop trigger if exists study_group_members_notify on public.study_group_members;
create trigger study_group_members_notify after insert on public.study_group_members
  for each row execute function private.notify_study_group_member();
