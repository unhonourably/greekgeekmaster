create table public.committees (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 500),
  conversation_id uuid references public.conversations (id),
  created_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chapter_id, name),
  unique (chapter_id, id)
);

create table public.committee_members (
  committee_id uuid not null,
  chapter_id uuid not null,
  membership_id uuid not null,
  role text not null default 'member' check (role in ('member', 'chair')),
  added_at timestamptz not null default now(),
  primary key (committee_id, membership_id),
  foreign key (chapter_id, committee_id) references public.committees (chapter_id, id),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  series_id uuid,
  title text not null check (char_length(title) between 2 and 140),
  description text check (char_length(description) <= 5000),
  location text check (char_length(location) <= 200),
  category text not null default 'chapter' check (category in ('chapter', 'meeting', 'social', 'philanthropy', 'recruitment', 'academic', 'brotherhood_sisterhood', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/New_York',
  visibility text not null default 'chapter' check (visibility in ('chapter', 'officers')),
  attendance_required boolean not null default false,
  required_classes public.member_class[] not null default '{}',
  capacity int check (capacity is null or capacity between 1 and 10000),
  rsvp_deadline timestamptz,
  committee_id uuid,
  conversation_id uuid references public.conversations (id),
  risk_checklist jsonb not null default '[]'::jsonb,
  risk_reviewed_by uuid references public.profiles (id),
  risk_reviewed_at timestamptz,
  report_summary text check (char_length(report_summary) <= 5000),
  created_by uuid not null references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, committee_id) references public.committees (chapter_id, id),
  check (ends_at > starts_at)
);

create index events_chapter_time_idx on public.events (chapter_id, starts_at);

alter table public.conversations add constraint conversations_event_fk foreign key (event_id) references public.events (id);

create trigger events_touch before update on public.events for each row execute function private.touch_updated_at();

create table public.event_rsvps (
  event_id uuid not null,
  chapter_id uuid not null,
  user_id uuid not null references public.profiles (id),
  status text not null check (status in ('going', 'maybe', 'not_going')),
  responded_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (chapter_id, event_id) references public.events (chapter_id, id)
);

create table public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  chapter_id uuid not null,
  membership_id uuid not null,
  status text not null check (status in ('present', 'late', 'excused', 'absent')),
  method text not null check (method in ('qr', 'manual')),
  checked_in_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (event_id, membership_id),
  foreign key (chapter_id, event_id) references public.events (chapter_id, id),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id)
);

create table public.attendance_corrections (
  id bigint generated always as identity primary key,
  attendance_id uuid not null references public.event_attendance (id),
  chapter_id uuid not null references public.chapters (id),
  from_status text,
  to_status text not null,
  reason text not null,
  corrected_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create trigger attendance_corrections_append_only before update or delete on public.attendance_corrections
  for each row execute function private.prevent_mutation();

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
  if v_e.cancelled_at is not null then
    raise exception 'event was cancelled' using errcode = '22023';
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

revoke execute on function public.rsvp_event(uuid, text) from public, anon;
grant execute on function public.rsvp_event(uuid, text) to authenticated;

create or replace function public.service_qr_check_in(p_event uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.events;
  v_m uuid;
  v_status text;
begin
  select * into v_e from public.events where id = p_event;
  if v_e.id is null or v_e.cancelled_at is not null then
    raise exception 'event not available' using errcode = '22023';
  end if;
  if now() < v_e.starts_at - interval '60 minutes' or now() > v_e.ends_at + interval '30 minutes' then
    raise exception 'check-in is closed for this event' using errcode = '22023';
  end if;
  select id into v_m from public.memberships where chapter_id = v_e.chapter_id and user_id = p_user and status = 'active';
  if v_m is null then
    raise exception 'not a member of this chapter' using errcode = '42501';
  end if;
  v_status := case when now() > v_e.starts_at + interval '15 minutes' then 'late' else 'present' end;
  insert into public.event_attendance (event_id, chapter_id, membership_id, status, method, recorded_by)
  values (v_e.id, v_e.chapter_id, v_m, v_status, 'qr', p_user)
  on conflict (event_id, membership_id) do nothing;
  if not found then
    return 'already_checked_in';
  end if;
  return v_status;
end;
$$;

revoke execute on function public.service_qr_check_in(uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_qr_check_in(uuid, uuid) to service_role;

create or replace function public.record_attendance(p_event uuid, p_membership uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.events;
  v_a public.event_attendance;
begin
  select * into v_e from public.events where id = p_event;
  if v_e.id is null or not private.has_permission(v_e.chapter_id, 'attendance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships where id = p_membership and chapter_id = v_e.chapter_id) then
    raise exception 'member is not in this chapter' using errcode = '42501';
  end if;
  if p_status not in ('present', 'late', 'excused', 'absent') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select * into v_a from public.event_attendance where event_id = p_event and membership_id = p_membership for update;
  if v_a.id is null then
    insert into public.event_attendance (event_id, chapter_id, membership_id, status, method, recorded_by)
    values (p_event, v_e.chapter_id, p_membership, p_status, 'manual', auth.uid());
  elsif v_a.status <> p_status then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'a reason is required to correct attendance' using errcode = '22023';
    end if;
    update public.event_attendance set status = p_status, recorded_by = auth.uid(), updated_at = now() where id = v_a.id;
    insert into public.attendance_corrections (attendance_id, chapter_id, from_status, to_status, reason, corrected_by)
    values (v_a.id, v_e.chapter_id, v_a.status, p_status, p_reason, auth.uid());
  end if;
end;
$$;

revoke execute on function public.record_attendance(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_attendance(uuid, uuid, text, text) to authenticated;

create table public.recruitment_stages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 40),
  position int not null,
  outcome text not null default 'open' check (outcome in ('open', 'offered', 'joined', 'closed')),
  created_at timestamptz not null default now(),
  unique (chapter_id, name),
  unique (chapter_id, id)
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  full_name text not null check (char_length(full_name) between 2 and 120),
  preferred_name text check (char_length(preferred_name) <= 60),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9+() .-]{7,24}$'),
  class_year int check (class_year between 1990 and 2100),
  major text check (char_length(major) <= 120),
  hometown text check (char_length(hometown) <= 120),
  source text check (char_length(source) <= 80),
  interests text[] not null default '{}',
  stage_id uuid not null,
  owner_membership_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  next_follow_up_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, stage_id) references public.recruitment_stages (chapter_id, id),
  foreign key (chapter_id, owner_membership_id) references public.memberships (chapter_id, id)
);

create index prospects_chapter_idx on public.prospects (chapter_id, stage_id) where status = 'active';
create unique index prospects_email_unique on public.prospects (chapter_id, lower(email)) where email is not null and status = 'active';

create table public.prospect_stage_history (
  id bigint generated always as identity primary key,
  prospect_id uuid not null references public.prospects (id),
  chapter_id uuid not null references public.chapters (id),
  from_stage uuid references public.recruitment_stages (id),
  to_stage uuid not null references public.recruitment_stages (id),
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.prospect_notes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  prospect_id uuid not null,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 4000),
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (chapter_id, prospect_id) references public.prospects (chapter_id, id)
);

create table public.recruitment_activities (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  prospect_id uuid not null,
  kind text not null check (kind in ('event', 'meeting', 'call', 'message', 'other')),
  event_id uuid,
  occurred_at timestamptz not null default now(),
  notes text check (char_length(notes) <= 2000),
  logged_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, prospect_id) references public.prospects (chapter_id, id),
  foreign key (chapter_id, event_id) references public.events (chapter_id, id)
);

create or replace function private.prospect_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.prospect_stage_history (prospect_id, chapter_id, from_stage, to_stage, changed_by)
    values (new.id, new.chapter_id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, auth.uid());
  end if;
  return new;
end;
$$;

create trigger prospects_history after insert or update of stage_id on public.prospects
  for each row execute function private.prospect_history();
create trigger prospects_touch before update on public.prospects for each row execute function private.touch_updated_at();

create or replace function public.ensure_recruitment_stages(p_chapter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_chapter, 'recruitment.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.recruitment_stages where chapter_id = p_chapter) then
    insert into public.recruitment_stages (chapter_id, name, position, outcome) values
      (p_chapter, 'Interested', 1, 'open'),
      (p_chapter, 'Met the chapter', 2, 'open'),
      (p_chapter, 'Invited back', 3, 'open'),
      (p_chapter, 'Offer extended', 4, 'offered'),
      (p_chapter, 'Accepted', 5, 'joined'),
      (p_chapter, 'Not continuing', 6, 'closed');
  end if;
end;
$$;

revoke execute on function public.ensure_recruitment_stages(uuid) from public, anon;
grant execute on function public.ensure_recruitment_stages(uuid) to authenticated;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  module text not null default 'general' check (module in ('general', 'recruitment', 'events', 'housing', 'philanthropy', 'finance')),
  title text not null check (char_length(title) between 2 and 160),
  description text check (char_length(description) <= 2000),
  assignee_membership_id uuid,
  related_id uuid,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_by uuid not null references public.profiles (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (chapter_id, assignee_membership_id) references public.memberships (chapter_id, id)
);

create index tasks_assignee_idx on public.tasks (assignee_membership_id) where status = 'open';

create or replace function private.module_permission(p_module text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_module
    when 'recruitment' then 'recruitment.manage'
    when 'events' then 'events.manage'
    when 'housing' then 'housing.manage'
    when 'philanthropy' then 'philanthropy.manage'
    when 'finance' then 'finance.manage'
    else 'chapter.manage'
  end
$$;

create table public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  event_id uuid not null,
  name text not null check (char_length(name) between 2 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slots int not null check (slots between 1 and 500),
  created_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, event_id) references public.events (chapter_id, id),
  check (ends_at > starts_at)
);

create table public.volunteer_signups (
  shift_id uuid not null,
  chapter_id uuid not null,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (shift_id, user_id),
  foreign key (chapter_id, shift_id) references public.volunteer_shifts (chapter_id, id)
);

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
  select count(*) into v_taken from public.volunteer_signups where shift_id = v_s.id;
  if v_taken >= v_s.slots then
    raise exception 'this shift is full' using errcode = '22023';
  end if;
  insert into public.volunteer_signups (shift_id, chapter_id, user_id) values (v_s.id, v_s.chapter_id, auth.uid())
  on conflict do nothing;
end;
$$;

revoke execute on function public.signup_volunteer_shift(uuid, boolean) from public, anon;
grant execute on function public.signup_volunteer_shift(uuid, boolean) to authenticated;

create table public.service_hours (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  user_id uuid not null references public.profiles (id),
  event_id uuid,
  organization text not null check (char_length(organization) between 2 and 120),
  description text check (char_length(description) <= 1000),
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  served_on date not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  foreign key (chapter_id, event_id) references public.events (chapter_id, id)
);

create table public.fundraising_campaigns (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 120),
  beneficiary text not null check (char_length(beneficiary) between 2 and 160),
  description text check (char_length(description) <= 2000),
  goal_cents bigint check (goal_cents is null or goal_cents > 0),
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'closed')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  campaign_id uuid not null,
  donor_name text check (char_length(donor_name) <= 120),
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('cash', 'check', 'external_platform', 'other')),
  reference text check (char_length(reference) <= 120),
  received_on date not null,
  note text check (char_length(note) <= 500),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, campaign_id) references public.fundraising_campaigns (chapter_id, id)
);

create or replace function public.campaign_progress(p_chapter uuid)
returns table (campaign_id uuid, raised_cents bigint, donation_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, coalesce(sum(d.amount_cents), 0)::bigint, count(d.id)
  from public.fundraising_campaigns c
  left join public.donations d on d.campaign_id = c.id
  where c.chapter_id = p_chapter and private.is_member(p_chapter)
  group by c.id
$$;

revoke execute on function public.campaign_progress(uuid) from public, anon;
grant execute on function public.campaign_progress(uuid) to authenticated;

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 80),
  kind text not null default 'common_area' check (kind in ('house', 'room', 'common_area', 'parking', 'other')),
  reservable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  facility_id uuid,
  title text not null check (char_length(title) between 3 and 140),
  description text check (char_length(description) <= 2000),
  location text check (char_length(location) <= 120),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  submitted_by uuid not null references public.profiles (id),
  assigned_membership_id uuid,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (chapter_id, facility_id) references public.facilities (chapter_id, id),
  foreign key (chapter_id, assigned_membership_id) references public.memberships (chapter_id, id)
);

create trigger maintenance_touch before update on public.maintenance_requests for each row execute function private.touch_updated_at();

create table public.facility_reservations (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  facility_id uuid not null,
  user_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text check (char_length(purpose) <= 200),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, facility_id) references public.facilities (chapter_id, id),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);

create or replace function private.check_reservation_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then
    perform 1 from public.facilities where id = new.facility_id for update;
    if exists (
      select 1 from public.facility_reservations r
      where r.facility_id = new.facility_id and r.status = 'confirmed' and r.id <> new.id
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(new.starts_at, new.ends_at)
    ) then
      raise exception 'that time is already reserved' using errcode = '23P01';
    end if;
    if not exists (select 1 from public.facilities where id = new.facility_id and reservable) then
      raise exception 'this space is not reservable' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger facility_reservations_overlap before insert or update on public.facility_reservations
  for each row execute function private.check_reservation_overlap();

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  title text not null check (char_length(title) between 2 and 120),
  assigned_membership_id uuid not null,
  due_on date not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'missed')),
  completed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, assigned_membership_id) references public.memberships (chapter_id, id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 120),
  quantity int not null default 0 check (quantity >= 0),
  unit text check (char_length(unit) <= 20),
  reorder_level int check (reorder_level is null or reorder_level >= 0),
  location text check (char_length(location) <= 120),
  updated_at timestamptz not null default now(),
  unique (chapter_id, name)
);

create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  item_name text not null check (char_length(item_name) between 2 and 120),
  quantity int not null default 1 check (quantity between 1 and 1000),
  note text check (char_length(note) <= 500),
  requested_by uuid not null references public.profiles (id),
  status text not null default 'requested' check (status in ('requested', 'approved', 'fulfilled', 'declined')),
  created_at timestamptz not null default now()
);

create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  title text not null check (char_length(title) between 2 and 140),
  category text not null default 'general' check (category in ('general', 'risk', 'housing', 'finance', 'standards', 'bylaws')),
  requires_ack boolean not null default true,
  current_version int not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  policy_id uuid not null,
  version int not null,
  body text not null check (char_length(body) between 1 and 50000),
  change_summary text check (char_length(change_summary) <= 500),
  published_by uuid not null references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (policy_id, version),
  foreign key (chapter_id, policy_id) references public.policy_documents (chapter_id, id)
);

create trigger policy_versions_append_only before update or delete on public.policy_versions
  for each row execute function private.prevent_mutation();

create table public.policy_acknowledgments (
  policy_version_id uuid not null references public.policy_versions (id),
  chapter_id uuid not null references public.chapters (id),
  user_id uuid not null references public.profiles (id),
  acknowledged_at timestamptz not null default now(),
  primary key (policy_version_id, user_id)
);

create or replace function public.publish_policy_version(p_policy uuid, p_body text, p_summary text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.policy_documents;
  v_next int;
begin
  select * into v_p from public.policy_documents where id = p_policy for update;
  if v_p.id is null or not (private.has_permission(v_p.chapter_id, 'standards.manage') or private.has_permission(v_p.chapter_id, 'chapter.manage')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_next := v_p.current_version + 1;
  insert into public.policy_versions (chapter_id, policy_id, version, body, change_summary, published_by)
  values (v_p.chapter_id, v_p.id, v_next, p_body, nullif(btrim(p_summary), ''), auth.uid());
  update public.policy_documents set current_version = v_next where id = v_p.id;
  perform private.write_audit(v_p.chapter_id, 'policy.published', 'policy_document', v_p.id::text, jsonb_build_object('version', v_next));
  return v_next;
end;
$$;

revoke execute on function public.publish_policy_version(uuid, text, text) from public, anon;
grant execute on function public.publish_policy_version(uuid, text, text) to authenticated;

create table public.training_requirements (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  title text not null check (char_length(title) between 2 and 140),
  description text check (char_length(description) <= 2000),
  due_on date,
  applies_to public.member_class[] not null default '{new_member,active}',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create table public.training_completions (
  requirement_id uuid not null,
  chapter_id uuid not null,
  user_id uuid not null references public.profiles (id),
  completed_at timestamptz not null default now(),
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  primary key (requirement_id, user_id),
  foreign key (chapter_id, requirement_id) references public.training_requirements (chapter_id, id)
);

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  reporter_id uuid not null references public.profiles (id),
  confidential_reporter boolean not null default true,
  category text not null check (category in ('safety', 'hazing', 'harassment', 'property', 'alcohol', 'housing', 'other')),
  occurred_at timestamptz,
  location text check (char_length(location) <= 200),
  description text not null check (char_length(description) between 10 and 8000),
  people_involved text check (char_length(people_involved) <= 2000),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id),
  retention_until date not null default (current_date + interval '7 years')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create table public.incident_case_notes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  incident_id uuid not null,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, incident_id) references public.incident_reports (chapter_id, id)
);

create trigger incident_case_notes_append_only before update or delete on public.incident_case_notes
  for each row execute function private.prevent_mutation();

create or replace function public.list_incident_reports(p_chapter uuid)
returns table (
  id uuid, category text, occurred_at timestamptz, location text, description text, people_involved text, status text,
  reporter_name text, assigned_to uuid, created_at timestamptz, note_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_chapter, 'standards.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform private.write_audit(p_chapter, 'incident.list_viewed', 'chapter', p_chapter::text, '{}'::jsonb);
  return query
  select i.id, i.category, i.occurred_at, i.location, i.description, i.people_involved, i.status,
    case when i.confidential_reporter then null else (select coalesce(nullif(p.full_name, ''), p.display_name) from public.profiles p where p.id = i.reporter_id) end,
    i.assigned_to, i.created_at,
    (select count(*) from public.incident_case_notes n where n.incident_id = i.id)
  from public.incident_reports i
  where i.chapter_id = p_chapter
  order by i.created_at desc;
end;
$$;

revoke execute on function public.list_incident_reports(uuid) from public, anon;
grant execute on function public.list_incident_reports(uuid) to authenticated;

create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  course_code text check (char_length(course_code) <= 24),
  name text not null check (char_length(name) between 2 and 100),
  description text check (char_length(description) <= 1000),
  meeting_info text check (char_length(meeting_info) <= 200),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, id)
);

create table public.study_group_members (
  group_id uuid not null,
  chapter_id uuid not null,
  user_id uuid not null references public.profiles (id),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (chapter_id, group_id) references public.study_groups (chapter_id, id)
);

create table public.mentorship_pairs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  mentor_membership_id uuid not null,
  mentee_membership_id uuid not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_on date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, mentor_membership_id) references public.memberships (chapter_id, id),
  foreign key (chapter_id, mentee_membership_id) references public.memberships (chapter_id, id),
  check (mentor_membership_id <> mentee_membership_id)
);

create table public.academic_goals (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  user_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 2 and 160),
  target_date date,
  status text not null default 'active' check (status in ('active', 'achieved', 'dropped')),
  share_with_scholarship boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  term_id uuid,
  category text not null check (char_length(category) between 2 and 60),
  planned_cents bigint not null check (planned_cents >= 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, term_id) references public.academic_terms (chapter_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  budget_line_id uuid,
  description text not null check (char_length(description) between 2 and 200),
  vendor text check (char_length(vendor) <= 120),
  amount_cents bigint not null check (amount_cents > 0),
  spent_on date not null,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (chapter_id, budget_line_id) references public.budget_lines (chapter_id, id)
);

create table public.reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  user_id uuid not null references public.profiles (id),
  description text not null check (char_length(description) between 3 and 500),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 5000000),
  spent_on date not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'paid')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  paid_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.review_reimbursement(p_request uuid, p_status text, p_note text, p_paid_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reimbursement_requests;
begin
  select * into v_r from public.reimbursement_requests where id = p_request for update;
  if v_r.id is null or not private.has_permission(v_r.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_r.user_id = auth.uid() then
    raise exception 'another officer must review your reimbursement' using errcode = '42501';
  end if;
  if not ((v_r.status = 'submitted' and p_status in ('approved', 'rejected')) or (v_r.status = 'approved' and p_status = 'paid')) then
    raise exception 'invalid status change' using errcode = '22023';
  end if;
  update public.reimbursement_requests
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(nullif(btrim(p_note), ''), review_note),
      paid_reference = case when p_status = 'paid' then p_paid_reference else paid_reference end,
      paid_at = case when p_status = 'paid' then now() else paid_at end
  where id = v_r.id;
  perform private.write_audit(v_r.chapter_id, 'reimbursement.' || p_status, 'reimbursement_request', v_r.id::text, jsonb_build_object('amount_cents', v_r.amount_cents));
end;
$$;

revoke execute on function public.review_reimbursement(uuid, text, text, text) from public, anon;
grant execute on function public.review_reimbursement(uuid, text, text, text) to authenticated;

create or replace function public.chapter_engagement_summary(p_chapter uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_chapter, 'analytics.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'active_members', (select count(*) from public.memberships where chapter_id = p_chapter and status = 'active'),
    'events_held', (select count(*) from public.events where chapter_id = p_chapter and cancelled_at is null and starts_at >= p_from and starts_at < p_to and starts_at < now()),
    'required_events', (select count(*) from public.events where chapter_id = p_chapter and cancelled_at is null and attendance_required and starts_at >= p_from and starts_at < p_to and starts_at < now()),
    'attendance_records', (select count(*) from public.event_attendance a join public.events e on e.id = a.event_id
      where a.chapter_id = p_chapter and a.status in ('present', 'late') and e.starts_at >= p_from and e.starts_at < p_to),
    'required_attendance_rate', (
      select case when count(*) = 0 then null else round(100.0 * count(*) filter (where a.status in ('present', 'late', 'excused')) / count(*), 1) end
      from public.events e
      cross join public.memberships m
      left join public.event_attendance a on a.event_id = e.id and a.membership_id = m.id
      where e.chapter_id = p_chapter and m.chapter_id = p_chapter and m.status = 'active' and e.attendance_required and e.cancelled_at is null
        and e.starts_at >= p_from and e.starts_at < p_to and e.starts_at < now()
        and (cardinality(e.required_classes) = 0 or m.member_class = any (e.required_classes))
        and m.joined_at <= e.starts_at
    ),
    'service_hours', coalesce((select sum(hours) from public.service_hours where chapter_id = p_chapter and status = 'approved' and served_on >= p_from::date and served_on < p_to::date), 0),
    'service_participants', (select count(distinct user_id) from public.service_hours where chapter_id = p_chapter and status = 'approved' and served_on >= p_from::date and served_on < p_to::date),
    'messages_sent', (select count(*) from public.messages where chapter_id = p_chapter and created_at >= p_from and created_at < p_to),
    'prospects_by_stage', coalesce((select jsonb_agg(jsonb_build_object('stage', s.name, 'outcome', s.outcome, 'count',
      (select count(*) from public.prospects p where p.stage_id = s.id and p.status = 'active')) order by s.position)
      from public.recruitment_stages s where s.chapter_id = p_chapter), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.chapter_engagement_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.chapter_engagement_summary(uuid, timestamptz, timestamptz) to authenticated;

alter table public.committees enable row level security;
alter table public.committee_members enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.event_attendance enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.recruitment_stages enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_stage_history enable row level security;
alter table public.prospect_notes enable row level security;
alter table public.recruitment_activities enable row level security;
alter table public.tasks enable row level security;
alter table public.volunteer_shifts enable row level security;
alter table public.volunteer_signups enable row level security;
alter table public.service_hours enable row level security;
alter table public.fundraising_campaigns enable row level security;
alter table public.donations enable row level security;
alter table public.facilities enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.facility_reservations enable row level security;
alter table public.chores enable row level security;
alter table public.inventory_items enable row level security;
alter table public.supply_requests enable row level security;
alter table public.policy_documents enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acknowledgments enable row level security;
alter table public.training_requirements enable row level security;
alter table public.training_completions enable row level security;
alter table public.incident_reports enable row level security;
alter table public.incident_case_notes enable row level security;
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.mentorship_pairs enable row level security;
alter table public.academic_goals enable row level security;
alter table public.budget_lines enable row level security;
alter table public.expenses enable row level security;
alter table public.reimbursement_requests enable row level security;

create policy committees_read on public.committees for select to authenticated using (private.is_member(chapter_id));
create policy committees_write on public.committees for all to authenticated
  using (private.has_permission(chapter_id, 'committees.manage')) with check (private.has_permission(chapter_id, 'committees.manage'));
create policy committee_members_read on public.committee_members for select to authenticated using (private.is_member(chapter_id));
create policy committee_members_write on public.committee_members for all to authenticated
  using (private.has_permission(chapter_id, 'committees.manage')) with check (private.has_permission(chapter_id, 'committees.manage'));

create policy events_read on public.events for select to authenticated
  using (private.is_member(chapter_id) and (visibility = 'chapter' or private.has_permission(chapter_id, 'events.manage') or private.has_permission(chapter_id, 'attendance.view')));
create policy events_insert on public.events for insert to authenticated
  with check (private.has_permission(chapter_id, 'events.manage') and created_by = auth.uid());
create policy events_update on public.events for update to authenticated
  using (private.has_permission(chapter_id, 'events.manage')) with check (private.has_permission(chapter_id, 'events.manage'));

create policy rsvps_read on public.event_rsvps for select to authenticated using (private.is_member(chapter_id));

create policy attendance_read on public.event_attendance for select to authenticated
  using (private.has_permission(chapter_id, 'attendance.view') or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy attendance_corrections_read on public.attendance_corrections for select to authenticated
  using (private.has_permission(chapter_id, 'attendance.view'));

create policy stages_read on public.recruitment_stages for select to authenticated using (private.has_permission(chapter_id, 'recruitment.view'));
create policy stages_write on public.recruitment_stages for all to authenticated
  using (private.has_permission(chapter_id, 'recruitment.manage')) with check (private.has_permission(chapter_id, 'recruitment.manage'));

create policy prospects_read on public.prospects for select to authenticated using (private.has_permission(chapter_id, 'recruitment.view'));
create policy prospects_insert on public.prospects for insert to authenticated
  with check (private.has_permission(chapter_id, 'recruitment.view') and created_by = auth.uid());
create policy prospects_update on public.prospects for update to authenticated
  using (private.has_permission(chapter_id, 'recruitment.manage') or (private.has_permission(chapter_id, 'recruitment.view') and owner_membership_id = private.active_membership_id(chapter_id)))
  with check (private.has_permission(chapter_id, 'recruitment.view'));

create policy prospect_history_read on public.prospect_stage_history for select to authenticated using (private.has_permission(chapter_id, 'recruitment.view'));

create policy prospect_notes_read on public.prospect_notes for select to authenticated
  using (private.has_permission(chapter_id, 'recruitment.view') and (not restricted or private.has_permission(chapter_id, 'recruitment.manage') or author_id = auth.uid()));
create policy prospect_notes_insert on public.prospect_notes for insert to authenticated
  with check (private.has_permission(chapter_id, 'recruitment.view') and author_id = auth.uid());

create policy recruitment_activities_read on public.recruitment_activities for select to authenticated using (private.has_permission(chapter_id, 'recruitment.view'));
create policy recruitment_activities_insert on public.recruitment_activities for insert to authenticated
  with check (private.has_permission(chapter_id, 'recruitment.view') and logged_by = auth.uid());

create policy tasks_read on public.tasks for select to authenticated
  using (private.is_member(chapter_id) and (
    created_by = auth.uid()
    or assignee_membership_id = private.active_membership_id(chapter_id)
    or private.has_permission(chapter_id, private.module_permission(module))
  ));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = auth.uid() and private.has_permission(chapter_id, private.module_permission(module)));
create policy tasks_update on public.tasks for update to authenticated
  using (assignee_membership_id = private.active_membership_id(chapter_id) or private.has_permission(chapter_id, private.module_permission(module)))
  with check (private.is_member(chapter_id));

create policy shifts_read on public.volunteer_shifts for select to authenticated using (private.is_member(chapter_id));
create policy shifts_write on public.volunteer_shifts for all to authenticated
  using (private.has_permission(chapter_id, 'philanthropy.manage')) with check (private.has_permission(chapter_id, 'philanthropy.manage'));
create policy signups_read on public.volunteer_signups for select to authenticated using (private.is_member(chapter_id));

create policy service_hours_read on public.service_hours for select to authenticated
  using (user_id = auth.uid() or private.has_permission(chapter_id, 'philanthropy.manage'));
create policy service_hours_insert on public.service_hours for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id) and status = 'submitted' and reviewed_by is null);
create policy service_hours_review on public.service_hours for update to authenticated
  using (private.has_permission(chapter_id, 'philanthropy.manage') and user_id <> auth.uid())
  with check (private.has_permission(chapter_id, 'philanthropy.manage') and user_id <> auth.uid());

create policy campaigns_read on public.fundraising_campaigns for select to authenticated using (private.is_member(chapter_id));
create policy campaigns_write on public.fundraising_campaigns for all to authenticated
  using (private.has_permission(chapter_id, 'philanthropy.manage')) with check (private.has_permission(chapter_id, 'philanthropy.manage'));
create policy donations_read on public.donations for select to authenticated using (private.has_permission(chapter_id, 'philanthropy.manage'));
create policy donations_insert on public.donations for insert to authenticated
  with check (private.has_permission(chapter_id, 'philanthropy.manage') and recorded_by = auth.uid());

create policy facilities_read on public.facilities for select to authenticated using (private.is_member(chapter_id));
create policy facilities_write on public.facilities for all to authenticated
  using (private.has_permission(chapter_id, 'housing.manage')) with check (private.has_permission(chapter_id, 'housing.manage'));
create policy maintenance_read on public.maintenance_requests for select to authenticated
  using (submitted_by = auth.uid() or private.has_permission(chapter_id, 'housing.manage')
    or assigned_membership_id = private.active_membership_id(chapter_id));
create policy maintenance_insert on public.maintenance_requests for insert to authenticated
  with check (submitted_by = auth.uid() and private.is_member(chapter_id) and status = 'open');
create policy maintenance_update on public.maintenance_requests for update to authenticated
  using (private.has_permission(chapter_id, 'housing.manage')) with check (private.has_permission(chapter_id, 'housing.manage'));
create policy reservations_read on public.facility_reservations for select to authenticated using (private.is_member(chapter_id));
create policy reservations_insert on public.facility_reservations for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id) and status = 'confirmed');
create policy reservations_cancel on public.facility_reservations for update to authenticated
  using (user_id = auth.uid() or private.has_permission(chapter_id, 'housing.manage'))
  with check (status = 'cancelled');
create policy chores_read on public.chores for select to authenticated
  using (assigned_membership_id = private.active_membership_id(chapter_id) or private.has_permission(chapter_id, 'housing.manage'));
create policy chores_insert on public.chores for insert to authenticated
  with check (private.has_permission(chapter_id, 'housing.manage') and created_by = auth.uid());
create policy chores_update on public.chores for update to authenticated
  using (assigned_membership_id = private.active_membership_id(chapter_id) or private.has_permission(chapter_id, 'housing.manage'))
  with check (private.is_member(chapter_id));
create policy inventory_all on public.inventory_items for all to authenticated
  using (private.has_permission(chapter_id, 'housing.manage')) with check (private.has_permission(chapter_id, 'housing.manage'));
create policy supply_read on public.supply_requests for select to authenticated
  using (requested_by = auth.uid() or private.has_permission(chapter_id, 'housing.manage'));
create policy supply_insert on public.supply_requests for insert to authenticated
  with check (requested_by = auth.uid() and private.is_member(chapter_id) and status = 'requested');
create policy supply_update on public.supply_requests for update to authenticated
  using (private.has_permission(chapter_id, 'housing.manage')) with check (private.has_permission(chapter_id, 'housing.manage'));

create policy policies_read on public.policy_documents for select to authenticated using (private.is_member(chapter_id));
create policy policies_insert on public.policy_documents for insert to authenticated
  with check ((private.has_permission(chapter_id, 'standards.manage') or private.has_permission(chapter_id, 'chapter.manage')) and created_by = auth.uid() and current_version = 0);
create policy policy_versions_read on public.policy_versions for select to authenticated using (private.is_member(chapter_id));
create policy policy_acks_read on public.policy_acknowledgments for select to authenticated
  using (user_id = auth.uid() or private.has_permission(chapter_id, 'standards.view') or private.has_permission(chapter_id, 'standards.manage'));
create policy policy_acks_insert on public.policy_acknowledgments for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id)
    and exists (select 1 from public.policy_versions v where v.id = policy_version_id and v.chapter_id = policy_acknowledgments.chapter_id));

create policy training_read on public.training_requirements for select to authenticated using (private.is_member(chapter_id));
create policy training_write on public.training_requirements for all to authenticated
  using (private.has_permission(chapter_id, 'standards.manage')) with check (private.has_permission(chapter_id, 'standards.manage'));
create policy training_completions_read on public.training_completions for select to authenticated
  using (user_id = auth.uid() or private.has_permission(chapter_id, 'standards.view') or private.has_permission(chapter_id, 'standards.manage'));
create policy training_completions_insert on public.training_completions for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id) and verified_by is null);
create policy training_completions_verify on public.training_completions for update to authenticated
  using (private.has_permission(chapter_id, 'standards.manage') and user_id <> auth.uid())
  with check (private.has_permission(chapter_id, 'standards.manage'));

create policy incidents_read_own on public.incident_reports for select to authenticated using (reporter_id = auth.uid());
create policy incidents_insert on public.incident_reports for insert to authenticated
  with check (reporter_id = auth.uid() and private.is_member(chapter_id) and status = 'submitted' and assigned_to is null);
create policy incidents_update on public.incident_reports for update to authenticated
  using (private.has_permission(chapter_id, 'standards.manage')) with check (private.has_permission(chapter_id, 'standards.manage'));
create policy incident_notes_read on public.incident_case_notes for select to authenticated using (private.has_permission(chapter_id, 'standards.manage'));
create policy incident_notes_insert on public.incident_case_notes for insert to authenticated
  with check (private.has_permission(chapter_id, 'standards.manage') and author_id = auth.uid());

create policy study_groups_read on public.study_groups for select to authenticated using (private.is_member(chapter_id));
create policy study_groups_insert on public.study_groups for insert to authenticated with check (private.is_member(chapter_id) and created_by = auth.uid());
create policy study_groups_update on public.study_groups for update to authenticated
  using (created_by = auth.uid() or private.has_permission(chapter_id, 'academics.manage')) with check (private.is_member(chapter_id));
create policy study_group_members_read on public.study_group_members for select to authenticated using (private.is_member(chapter_id));
create policy study_group_members_join on public.study_group_members for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id)
    and exists (select 1 from public.study_groups g where g.id = group_id and g.chapter_id = study_group_members.chapter_id));
create policy study_group_members_leave on public.study_group_members for delete to authenticated using (user_id = auth.uid());

create policy mentorship_read on public.mentorship_pairs for select to authenticated
  using (private.has_permission(chapter_id, 'academics.manage')
    or mentor_membership_id = private.active_membership_id(chapter_id) or mentee_membership_id = private.active_membership_id(chapter_id));
create policy mentorship_write on public.mentorship_pairs for all to authenticated
  using (private.has_permission(chapter_id, 'academics.manage')) with check (private.has_permission(chapter_id, 'academics.manage'));

create policy goals_read on public.academic_goals for select to authenticated
  using (user_id = auth.uid() or (share_with_scholarship and private.has_permission(chapter_id, 'academics.manage')));
create policy goals_insert on public.academic_goals for insert to authenticated with check (user_id = auth.uid() and private.is_member(chapter_id));
create policy goals_update on public.academic_goals for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete on public.academic_goals for delete to authenticated using (user_id = auth.uid());

create policy budget_read on public.budget_lines for select to authenticated using (private.has_permission(chapter_id, 'finance.view'));
create policy budget_write on public.budget_lines for all to authenticated
  using (private.has_permission(chapter_id, 'finance.manage')) with check (private.has_permission(chapter_id, 'finance.manage'));
create policy expenses_read on public.expenses for select to authenticated using (private.has_permission(chapter_id, 'finance.view'));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (private.has_permission(chapter_id, 'finance.manage') and recorded_by = auth.uid());
create policy reimbursements_read on public.reimbursement_requests for select to authenticated
  using (user_id = auth.uid() or private.has_permission(chapter_id, 'finance.view'));
create policy reimbursements_insert on public.reimbursement_requests for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(chapter_id) and status = 'submitted' and reviewed_by is null);
