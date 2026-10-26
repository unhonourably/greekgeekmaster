alter table public.notification_kinds
  add column if not exists default_sms boolean not null default false;

alter table public.notification_preferences
  add column if not exists sms boolean not null default false;

alter table public.notifications
  add column if not exists sms_status text not null default 'skipped'
    check (sms_status in ('skipped', 'pending', 'sending', 'sent', 'failed')),
  add column if not exists sms_attempts int not null default 0,
  add column if not exists sms_next_attempt_at timestamptz,
  add column if not exists sms_last_error text;

create index if not exists notifications_sms_queue_idx
  on public.notifications (sms_next_attempt_at)
  where sms_status in ('pending', 'failed');

insert into public.notification_kinds (kind, label, description, default_in_app, default_email, default_sms, required) values
  ('event_posted', 'New events', 'When an officer publishes a chapter event', true, false, true, false)
on conflict (kind) do update
  set label = excluded.label, description = excluded.description;

update public.notification_kinds
set default_sms = true
where kind in ('announcement', 'chat_mention', 'chat_message', 'event_reminder', 'event_posted', 'dues_reminder', 'payment_failed', 'verification_update');

create or replace function private.notify(
  p_user uuid,
  p_chapter uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.notification_kinds;
  v_pref public.notification_preferences;
  v_in_app boolean;
  v_email boolean;
  v_sms boolean;
  v_id uuid;
begin
  select * into v_kind from public.notification_kinds where kind = p_kind;
  if v_kind.kind is null then
    raise exception 'unknown notification kind %', p_kind;
  end if;
  select * into v_pref from public.notification_preferences where user_id = p_user and kind = p_kind;
  v_in_app := coalesce(v_pref.in_app, v_kind.default_in_app) or v_kind.required;
  v_email := coalesce(v_pref.email, v_kind.default_email) or (v_kind.required and v_kind.default_email);
  v_sms := coalesce(v_pref.sms, v_kind.default_sms);
  if not v_in_app and not v_email and not v_sms then
    return null;
  end if;
  insert into public.notifications (
    user_id, chapter_id, kind, title, body, link, dedupe_key,
    email_status, email_next_attempt_at,
    sms_status, sms_next_attempt_at,
    read_at
  )
  values (
    p_user, p_chapter, p_kind, left(p_title, 160), left(p_body, 500), p_link, p_dedupe,
    case when v_email then 'pending' else 'skipped' end,
    case when v_email then now() else null end,
    case when v_sms then 'pending' else 'skipped' end,
    case when v_sms then now() else null end,
    case when v_in_app then null else now() end
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.notify_event_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  r record;
begin
  if new.cancelled_at is not null then
    return new;
  end if;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  for r in
    select m.user_id from public.memberships m
    where m.chapter_id = new.chapter_id and m.status = 'active' and m.user_id <> new.created_by
      and (new.visibility = 'chapter' or private.user_has_permission(m.user_id, new.chapter_id, 'events.manage'))
  loop
    perform private.notify(
      r.user_id,
      new.chapter_id,
      'event_posted',
      new.title,
      case
        when new.location is not null then left(new.location, 160)
        else 'A new event was added to the chapter calendar.'
      end,
      '/c/' || v_slug || '/events/' || new.id::text,
      'event:' || new.id::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists events_notify on public.events;
create trigger events_notify after insert on public.events
  for each row execute function private.notify_event_posted();
