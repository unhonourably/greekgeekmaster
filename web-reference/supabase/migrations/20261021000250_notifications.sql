create table public.notification_kinds (
  kind text primary key check (kind ~ '^[a-z_]{3,40}$'),
  label text not null,
  description text not null,
  default_in_app boolean not null default true,
  default_email boolean not null default false,
  required boolean not null default false
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  chapter_id uuid references public.chapters (id),
  kind text not null references public.notification_kinds (kind),
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 500),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  dedupe_key text not null,
  read_at timestamptz,
  email_status text not null default 'skipped' check (email_status in ('skipped', 'pending', 'sending', 'sent', 'failed')),
  email_attempts int not null default 0,
  email_next_attempt_at timestamptz,
  email_last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_queue_idx on public.notifications (email_next_attempt_at) where email_status in ('pending', 'failed');

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null references public.notification_kinds (kind),
  in_app boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

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
  v_id uuid;
begin
  select * into v_kind from public.notification_kinds where kind = p_kind;
  if v_kind.kind is null then
    raise exception 'unknown notification kind %', p_kind;
  end if;
  select * into v_pref from public.notification_preferences where user_id = p_user and kind = p_kind;
  v_in_app := coalesce(v_pref.in_app, v_kind.default_in_app) or v_kind.required;
  v_email := coalesce(v_pref.email, v_kind.default_email) or (v_kind.required and v_kind.default_email);
  if not v_in_app and not v_email then
    return null;
  end if;
  insert into public.notifications (user_id, chapter_id, kind, title, body, link, dedupe_key, email_status, email_next_attempt_at, read_at)
  values (
    p_user, p_chapter, p_kind, left(p_title, 160), left(p_body, 500), p_link, p_dedupe,
    case when v_email then 'pending' else 'skipped' end,
    case when v_email then now() else null end,
    case when v_in_app then null else now() end
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function private.notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[])
returns int
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::int from u
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.service_claim_notification_emails(p_limit int)
returns table (id uuid, user_id uuid, email text, kind text, title text, body text, link text, attempts int)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select n.id from public.notifications n
    where n.email_status in ('pending', 'failed') and n.email_attempts < 5
      and coalesce(n.email_next_attempt_at, now()) <= now()
    order by n.created_at
    limit p_limit
    for update skip locked
  )
  update public.notifications n
  set email_status = 'sending', email_attempts = n.email_attempts + 1
  from claimed, auth.users u
  where n.id = claimed.id and u.id = n.user_id
  returning n.id, n.user_id, u.email::text, n.kind, n.title, n.body, n.link, n.email_attempts;
end;
$$;

revoke execute on function public.service_claim_notification_emails(int) from public, anon, authenticated;
grant execute on function public.service_claim_notification_emails(int) to service_role;

create or replace function public.service_complete_notification_email(p_id uuid, p_ok boolean, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set email_status = case when p_ok then 'sent' else 'failed' end,
      email_last_error = case when p_ok then null else left(p_error, 500) end,
      email_next_attempt_at = case when p_ok then null else now() + (interval '1 minute' * power(4, email_attempts)) end
  where id = p_id and email_status = 'sending'
$$;

revoke execute on function public.service_complete_notification_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.service_complete_notification_email(uuid, boolean, text) to service_role;

alter table public.notification_kinds enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy notification_kinds_read on public.notification_kinds for select to authenticated using (true);
create policy notifications_read_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_own_read on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_own_insert on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy notification_prefs_own_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function private.notify_application_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applicant uuid;
begin
  if new.visibility <> 'applicant' or new.kind not in ('info_requested', 'approved', 'rejected', 'suspended') then
    return new;
  end if;
  select applicant_id into v_applicant from public.chapter_applications where id = new.application_id;
  perform private.notify(
    v_applicant, null, 'verification_update',
    case new.kind
      when 'info_requested' then 'Your chapter application needs more information'
      when 'approved' then 'Your chapter has been verified'
      when 'rejected' then 'Your chapter application was not approved'
      else 'Your chapter application was suspended'
    end,
    'Open your application to see the reviewer''s message.',
    '/onboarding/' || new.application_id::text,
    'verification:' || new.id::text
  );
  return new;
end;
$$;

create trigger verification_events_notify after insert on public.verification_events
  for each row execute function private.notify_application_event();
