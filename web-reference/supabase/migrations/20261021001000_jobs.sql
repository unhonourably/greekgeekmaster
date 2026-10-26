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
    where n.email_attempts < 5
      and (
        (n.email_status in ('pending', 'failed') and coalesce(n.email_next_attempt_at, now()) <= now())
        or (n.email_status = 'sending' and n.email_next_attempt_at <= now())
      )
    order by n.created_at
    limit p_limit
    for update skip locked
  )
  update public.notifications n
  set email_status = 'sending', email_attempts = n.email_attempts + 1, email_next_attempt_at = now() + interval '15 minutes'
  from claimed, auth.users u
  where n.id = claimed.id and u.id = n.user_id
  returning n.id, n.user_id, u.email::text, n.kind, n.title, n.body, n.link, n.email_attempts;
end;
$$;

revoke execute on function public.service_claim_notification_emails(int) from public, anon, authenticated;
grant execute on function public.service_claim_notification_emails(int) to service_role;

create or replace function public.service_recruitment_followups()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.id, p.chapter_id, p.full_name, m.user_id, c.slug, (now() at time zone c.timezone)::date as local_day
    from public.prospects p
    join public.memberships m on m.id = p.owner_membership_id and m.status = 'active'
    join public.chapters c on c.id = p.chapter_id and c.status = 'verified'
    where p.status = 'active' and p.next_follow_up_at is not null and p.next_follow_up_at <= now()
      and p.next_follow_up_at > now() - interval '14 days'
      and private.user_has_permission(m.user_id, p.chapter_id, 'recruitment.view')
  loop
    if private.notify(r.user_id, r.chapter_id, 'recruitment_followup', 'Follow up with ' || r.full_name,
      'You planned to follow up with this prospect.', '/c/' || r.slug || '/recruitment/' || r.id::text,
      'followup:' || r.id::text || ':' || r.local_day::text) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.service_recruitment_followups() from public, anon, authenticated;
grant execute on function public.service_recruitment_followups() to service_role;

create or replace function public.service_event_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select e.id, e.chapter_id, e.title, e.location, e.starts_at, c.slug, c.timezone, m.user_id
    from public.events e
    join public.chapters c on c.id = e.chapter_id and c.status = 'verified'
    join public.memberships m on m.chapter_id = e.chapter_id and m.status = 'active'
    where e.cancelled_at is null and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
      and (e.visibility = 'chapter' or private.user_has_permission(m.user_id, e.chapter_id, 'events.manage'))
      and (
        exists (select 1 from public.event_rsvps v where v.event_id = e.id and v.user_id = m.user_id and v.status in ('going', 'maybe'))
        or (e.attendance_required and (cardinality(e.required_classes) = 0 or m.member_class = any (e.required_classes))
            and not exists (select 1 from public.event_rsvps v where v.event_id = e.id and v.user_id = m.user_id and v.status = 'not_going'))
      )
  loop
    if private.notify(r.user_id, r.chapter_id, 'event_reminder', r.title || ' starts ' || to_char(r.starts_at at time zone r.timezone, 'FMDay at FMHH12:MI AM'),
      coalesce('Location: ' || r.location, 'Open the event for details.'), '/c/' || r.slug || '/events/' || r.id::text,
      'event_reminder:' || r.id::text) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.service_event_reminders() from public, anon, authenticated;
grant execute on function public.service_event_reminders() to service_role;

create or replace function public.service_dues_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_outstanding bigint;
begin
  for r in
    select ma.id, ma.chapter_id, ma.due_date, a.title, m.user_id, c.slug, (now() at time zone c.timezone)::date as local_day
    from public.member_assessments ma
    join public.dues_assessments a on a.id = ma.assessment_id
    join public.memberships m on m.id = ma.membership_id and m.status = 'active'
    join public.chapters c on c.id = ma.chapter_id and c.status = 'verified'
    where ma.status in ('open', 'partially_paid')
      and not exists (select 1 from public.installment_plans p where p.member_assessment_id = ma.id and p.status = 'active')
  loop
    if r.due_date - r.local_day = 3 or (r.local_day > r.due_date and (r.local_day - r.due_date) % 7 = 1 and r.local_day - r.due_date <= 60) then
      v_outstanding := private.ma_outstanding(r.id);
      if v_outstanding > 0 and private.notify(r.user_id, r.chapter_id, 'dues_reminder',
        case when r.local_day > r.due_date then r.title || ' is past due' else r.title || ' is due in 3 days' end,
        'Outstanding balance: $' || to_char(v_outstanding / 100.0, 'FM999,999,990.00') || '. Due ' || to_char(r.due_date, 'FMMonth FMDD, YYYY') || '.',
        '/c/' || r.slug || '/dues', 'dues_reminder:' || r.id::text || ':' || r.local_day::text) is not null then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.service_dues_reminders() from public, anon, authenticated;
grant execute on function public.service_dues_reminders() to service_role;
