create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_name text check (reporter_name is null or char_length(reporter_name) <= 160),
  reporter_email text check (reporter_email is null or char_length(reporter_email) <= 254),
  chapter_id uuid references public.chapters (id) on delete set null,
  page text not null check (char_length(page) between 1 and 300),
  message text not null check (char_length(message) between 10 and 4000),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  viewport text check (viewport is null or viewport ~ '^[0-9]{2,5}x[0-9]{2,5}$'),
  build text check (build is null or build ~ '^[A-Za-z0-9._-]{1,60}$'),
  status text not null default 'new' check (status in ('new', 'triaged', 'in_progress', 'fixed', 'wont_fix', 'duplicate', 'cant_reproduce')),
  severity text check (severity is null or severity in ('critical', 'high', 'medium', 'low')),
  area text check (area is null or area in ('payments', 'dues', 'chat', 'events', 'recruitment', 'directory', 'housing', 'onboarding', 'account', 'notifications', 'admin', 'marketing', 'other')),
  assignee_id uuid references public.profiles (id) on delete set null,
  duplicate_of uuid references public.bug_reports (id) on delete set null,
  fix_summary text check (fix_summary is null or char_length(fix_summary) <= 4000),
  fix_ref text check (fix_ref is null or char_length(fix_ref) <= 300),
  fixed_at timestamptz,
  fixed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  first_response_at timestamptz,
  reporter_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duplicate_of is null or duplicate_of <> id),
  check (status <> 'duplicate' or duplicate_of is not null)
);

create index bug_reports_queue_idx on public.bug_reports (status, created_at desc);
create index bug_reports_reporter_idx on public.bug_reports (reporter_id, created_at desc);
create index bug_reports_page_idx on public.bug_reports (page);

create table public.bug_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.bug_reports (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('created', 'comment', 'status', 'severity', 'area', 'assignee', 'duplicate', 'fix', 'reopened', 'reporter_emailed')),
  from_value text check (from_value is null or char_length(from_value) <= 120),
  to_value text check (to_value is null or char_length(to_value) <= 120),
  body text check (body is null or char_length(body) <= 4000),
  ref text check (ref is null or char_length(ref) <= 300),
  created_at timestamptz not null default now()
);

create index bug_report_events_report_idx on public.bug_report_events (report_id, created_at);

alter table public.bug_reports enable row level security;
alter table public.bug_report_events enable row level security;

create policy bug_reports_staff_read on public.bug_reports for select to authenticated
  using (private.is_platform_staff(array['support']::public.platform_staff_role[]));
create policy bug_reports_staff_update on public.bug_reports for update to authenticated
  using (private.is_platform_staff(array['support']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['support']::public.platform_staff_role[]));
create policy bug_reports_admin_delete on public.bug_reports for delete to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]));

create policy bug_report_events_staff_read on public.bug_report_events for select to authenticated
  using (private.is_platform_staff(array['support']::public.platform_staff_role[]));
create policy bug_report_events_staff_note on public.bug_report_events for insert to authenticated
  with check (
    private.is_platform_staff(array['support']::public.platform_staff_role[])
    and actor_id = auth.uid()
    and kind in ('comment', 'reporter_emailed')
  );

revoke all on public.bug_reports from anon, authenticated;
revoke all on public.bug_report_events from anon, authenticated;
grant select, delete on public.bug_reports to authenticated;
grant update (status, severity, area, assignee_id, duplicate_of, fix_summary, fix_ref, reporter_notified_at) on public.bug_reports to authenticated;
grant select, insert on public.bug_report_events to authenticated;

create or replace function private.bug_report_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null and not exists (
    select 1 from public.platform_staff s where s.user_id = new.assignee_id and s.revoked_at is null and s.role in ('admin', 'support')
  ) then
    raise exception 'assignee must be admin or support staff' using errcode = '22023';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('fixed', 'wont_fix', 'duplicate', 'cant_reproduce') then
      new.closed_at := coalesce(old.closed_at, now());
    else
      new.closed_at := null;
    end if;
    if new.status = 'fixed' then
      new.fixed_at := now();
      new.fixed_by := auth.uid();
    elsif old.status = 'fixed' then
      new.fixed_at := null;
      new.fixed_by := null;
    end if;
    if new.status <> 'duplicate' then
      new.duplicate_of := null;
    end if;
  end if;
  if old.status = 'new' and new.status <> 'new'
    or new.severity is distinct from old.severity
    or new.assignee_id is distinct from old.assignee_id then
    new.first_response_at := coalesce(old.first_response_at, now());
  end if;
  return new;
end;
$$;

create trigger bug_reports_before_update before update on public.bug_reports
  for each row execute function private.bug_report_before_update();

create or replace function private.bug_report_log_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_closed text[] := array['fixed', 'wont_fix', 'duplicate', 'cant_reproduce'];
begin
  if new.status is distinct from old.status then
    insert into public.bug_report_events (report_id, actor_id, kind, from_value, to_value, body, ref)
    values (
      new.id,
      v_actor,
      case
        when new.status = 'fixed' then 'fix'
        when old.status = any (v_closed) and not (new.status = any (v_closed)) then 'reopened'
        else 'status'
      end,
      old.status,
      new.status,
      case when new.status = 'fixed' then new.fix_summary end,
      case when new.status = 'fixed' then new.fix_ref end
    );
  elsif new.status = 'fixed' and (new.fix_summary is distinct from old.fix_summary or new.fix_ref is distinct from old.fix_ref) then
    insert into public.bug_report_events (report_id, actor_id, kind, from_value, to_value, body, ref)
    values (new.id, v_actor, 'fix', old.status, new.status, new.fix_summary, new.fix_ref);
  end if;
  if new.severity is distinct from old.severity then
    insert into public.bug_report_events (report_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'severity', old.severity, new.severity);
  end if;
  if new.area is distinct from old.area then
    insert into public.bug_report_events (report_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'area', old.area, new.area);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.bug_report_events (report_id, actor_id, kind, from_value, to_value)
    values (new.id, v_actor, 'assignee', old.assignee_id::text, new.assignee_id::text);
  end if;
  if new.duplicate_of is distinct from old.duplicate_of and new.duplicate_of is not null then
    insert into public.bug_report_events (report_id, actor_id, kind, to_value)
    values (new.id, v_actor, 'duplicate', new.duplicate_of::text);
  end if;
  return new;
end;
$$;

create trigger bug_reports_log_changes after update on public.bug_reports
  for each row execute function private.bug_report_log_changes();

create or replace function private.bug_report_event_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'comment' then
    update public.bug_reports set first_response_at = coalesce(first_response_at, now()), updated_at = now() where id = new.report_id;
  elsif new.kind = 'reporter_emailed' then
    update public.bug_reports set reporter_notified_at = now(), first_response_at = coalesce(first_response_at, now()) where id = new.report_id;
  end if;
  return new;
end;
$$;

create trigger bug_report_events_effects after insert on public.bug_report_events
  for each row execute function private.bug_report_event_effects();

insert into public.notification_kinds (kind, label, description, default_in_app, default_email)
values ('bug_report', 'Bug reports', 'New bug reports from people using GreekGeek.', true, false)
on conflict (kind) do nothing;

create or replace function public.submit_bug_report(
  p_message text,
  p_page text,
  p_user_agent text default null,
  p_viewport text default null,
  p_build text default null
)
returns table (id uuid, number bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_name text;
  v_email text;
  v_page text := left(btrim(coalesce(p_page, '')), 300);
  v_slug text;
  v_chapter uuid;
  v_id uuid;
  v_number bigint;
  v_staff uuid;
begin
  if v_user is null then
    raise exception 'sign in to report a bug' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) < 10 then
    raise exception 'describe what went wrong' using errcode = '22023';
  end if;
  if (select count(*) from public.bug_reports r where r.reporter_id = v_user and r.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many reports' using errcode = '22023';
  end if;
  if v_page = '' or left(v_page, 1) <> '/' or left(v_page, 2) = '//' then
    v_page := 'Unknown page';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), '')) into v_name from public.profiles p where p.id = v_user;
  select u.email into v_email from auth.users u where u.id = v_user;
  v_slug := substring(v_page from '^/c/([^/?#]+)');
  if v_slug is not null then
    select c.id into v_chapter from public.chapters c where c.slug = v_slug;
  end if;
  insert into public.bug_reports (reporter_id, reporter_name, reporter_email, chapter_id, page, message, user_agent, viewport, build)
  values (
    v_user,
    left(v_name, 160),
    left(v_email, 254),
    v_chapter,
    v_page,
    left(btrim(p_message), 4000),
    nullif(left(btrim(coalesce(p_user_agent, '')), 300), ''),
    case when p_viewport ~ '^[0-9]{2,5}x[0-9]{2,5}$' then p_viewport end,
    case when p_build ~ '^[A-Za-z0-9._-]{1,60}$' then p_build end
  )
  returning bug_reports.id, bug_reports.number into v_id, v_number;
  insert into public.bug_report_events (report_id, actor_id, kind) values (v_id, v_user, 'created');
  for v_staff in
    select s.user_id from public.platform_staff s where s.revoked_at is null and s.role in ('admin', 'support')
  loop
    perform private.notify(
      v_staff, null, 'bug_report', 'Bug #' || v_number || ' reported',
      left(coalesce(v_name, 'Someone') || ': ' || btrim(p_message), 500),
      '/admin/bugs/' || v_id::text,
      'bug:' || v_id::text
    );
  end loop;
  return query select v_id, v_number;
end;
$$;

revoke execute on function public.submit_bug_report(text, text, text, text, text) from public, anon;
grant execute on function public.submit_bug_report(text, text, text, text, text) to authenticated;

create or replace function public.bug_assignees()
returns table (user_id uuid, name text, role public.platform_staff_role)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Staff member'), s.role
  from public.platform_staff s
  left join public.profiles p on p.id = s.user_id
  where s.revoked_at is null
    and s.role in ('admin', 'support')
    and private.is_platform_staff(array['support']::public.platform_staff_role[])
  order by 2
$$;

revoke execute on function public.bug_assignees() from public, anon;
grant execute on function public.bug_assignees() to authenticated;
