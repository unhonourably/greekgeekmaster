alter table public.notifications drop constraint notifications_link_check;
alter table public.notifications add constraint notifications_link_check check (link is null or link ~ '^/[A-Za-z0-9/_?=&%.#-]*$');

create or replace function public.member_overview(p_chapter uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_officer boolean;
  v_year_start date := case when extract(month from current_date) >= 8
    then make_date(extract(year from current_date)::int, 8, 1)
    else make_date(extract(year from current_date)::int - 1, 8, 1) end;
begin
  select * into v_m from public.memberships where chapter_id = p_chapter and user_id = auth.uid() and status = 'active';
  if v_m.id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_officer := private.is_officer(p_chapter);

  return jsonb_build_object(
    'membership', jsonb_build_object('id', v_m.id, 'member_class', v_m.member_class, 'joined_at', v_m.joined_at),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.name, 'tone', r.badge_tone) order by r.sort_order, r.name)
      from public.role_assignments ra
      join public.roles r on r.id = ra.role_id
      where ra.membership_id = v_m.id and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
    ), '[]'::jsonb),
    'committees', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'role', cm.role) order by cm.role desc, c.name)
      from public.committee_members cm
      join public.committees c on c.id = cm.committee_id and c.archived_at is null
      where cm.membership_id = v_m.id
    ), '[]'::jsonb),
    'attendance', (
      select jsonb_build_object(
        'required', count(*),
        'attended', count(*) filter (where a.status in ('present', 'late')),
        'excused', count(*) filter (where a.status = 'excused'),
        'missed', count(*) filter (where a.status is null or a.status = 'absent')
      )
      from public.events e
      left join public.event_attendance a on a.event_id = e.id and a.membership_id = v_m.id
      where e.chapter_id = p_chapter and e.attendance_required and e.cancelled_at is null
        and (e.visibility = 'chapter' or v_officer)
        and e.starts_at >= now() - interval '90 days' and e.starts_at < now()
        and e.starts_at >= v_m.joined_at
        and (cardinality(e.required_classes) = 0 or v_m.member_class = any (e.required_classes))
    ),
    'events_attended_90d', (
      select count(*) from public.event_attendance a
      join public.events e on e.id = a.event_id
      where a.membership_id = v_m.id and a.status in ('present', 'late') and e.starts_at >= now() - interval '90 days'
    ),
    'rsvps', coalesce((
      select jsonb_object_agg(r.event_id, r.status)
      from public.event_rsvps r
      join public.events e on e.id = r.event_id
      where r.user_id = auth.uid() and e.chapter_id = p_chapter and e.ends_at >= now() and e.cancelled_at is null
    ), '{}'::jsonb),
    'acks', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title) order by x.published_at desc)
      from (
        select an.id, an.title, an.published_at
        from public.announcements an
        where an.chapter_id = p_chapter and an.requires_ack and an.archived_at is null
          and (an.audience = 'all' or v_officer)
          and an.published_at >= v_m.joined_at
          and not exists (select 1 from public.announcement_acks k where k.announcement_id = an.id and k.user_id = auth.uid())
        order by an.published_at desc
        limit 5
      ) x
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_at', t.due_at, 'module', t.module) order by t.due_at nulls last, t.created_at)
      from (
        select * from public.tasks
        where chapter_id = p_chapter and assignee_membership_id = v_m.id and status = 'open'
        order by due_at nulls last, created_at
        limit 5
      ) t
    ), '[]'::jsonb),
    'open_tasks', (select count(*) from public.tasks where chapter_id = p_chapter and assignee_membership_id = v_m.id and status = 'open'),
    'chores', coalesce((
      select jsonb_agg(jsonb_build_object('id', ch.id, 'title', ch.title, 'due_on', ch.due_on) order by ch.due_on)
      from public.chores ch
      where ch.chapter_id = p_chapter and ch.assigned_membership_id = v_m.id and ch.status = 'pending' and ch.due_on <= current_date + 7
    ), '[]'::jsonb),
    'policies_due', (
      select count(*)
      from public.policy_documents d
      join public.policy_versions pv on pv.policy_id = d.id and pv.version = d.current_version
      where d.chapter_id = p_chapter and d.requires_ack and d.current_version > 0
        and not exists (select 1 from public.policy_acknowledgments pa where pa.policy_version_id = pv.id and pa.user_id = auth.uid())
    ),
    'trainings_due', (
      select jsonb_build_object('count', count(*), 'next_due', min(tr.due_on))
      from public.training_requirements tr
      where tr.chapter_id = p_chapter and v_m.member_class = any (tr.applies_to)
        and not exists (select 1 from public.training_completions tc where tc.requirement_id = tr.id and tc.user_id = auth.uid())
    ),
    'service', (
      select jsonb_build_object(
        'approved_hours', coalesce(sum(hours) filter (where status = 'approved'), 0),
        'pending_hours', coalesce(sum(hours) filter (where status = 'submitted'), 0),
        'since', v_year_start
      )
      from public.service_hours
      where chapter_id = p_chapter and user_id = auth.uid() and served_on >= v_year_start
    ),
    'badges', jsonb_build_object(
      'count', (select count(*) from public.member_achievements where membership_id = v_m.id and revoked_at is null),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object('name', x.name, 'icon', x.icon, 'awarded_at', x.awarded_at) order by x.awarded_at desc)
        from (
          select b.name, b.icon, ma.awarded_at
          from public.member_achievements ma
          join public.achievement_badges b on b.id = ma.badge_id
          where ma.membership_id = v_m.id and ma.revoked_at is null
          order by ma.awarded_at desc
          limit 4
        ) x
      ), '[]'::jsonb)
    ),
    'goals_active', (select count(*) from public.academic_goals where chapter_id = p_chapter and user_id = auth.uid() and status = 'active'),
    'mentorship', jsonb_build_object(
      'mentors', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Member')))
        from public.mentorship_pairs mp
        join public.memberships m on m.id = mp.mentor_membership_id and m.status = 'active'
        join public.profiles p on p.id = m.user_id
        where mp.mentee_membership_id = v_m.id and mp.status = 'active'
      ), '[]'::jsonb),
      'mentees', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Member')))
        from public.mentorship_pairs mp
        join public.memberships m on m.id = mp.mentee_membership_id and m.status = 'active'
        join public.profiles p on p.id = m.user_id
        where mp.mentor_membership_id = v_m.id and mp.status = 'active'
      ), '[]'::jsonb)
    ),
    'chapter', jsonb_build_object(
      'active_members', (select count(*) from public.memberships where chapter_id = p_chapter and status = 'active'),
      'joined_30d', (select count(*) from public.memberships where chapter_id = p_chapter and status = 'active' and joined_at >= now() - interval '30 days'),
      'events_7d', (select count(*) from public.events where chapter_id = p_chapter and cancelled_at is null and (visibility = 'chapter' or v_officer)
        and starts_at >= now() and starts_at < now() + interval '7 days'),
      'newest', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.name, 'joined_at', x.joined_at) order by x.joined_at desc)
        from (
          select m.user_id, m.joined_at, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Member') name
          from public.memberships m
          join public.profiles p on p.id = m.user_id
          where m.chapter_id = p_chapter and m.status = 'active' and m.joined_at >= now() - interval '30 days' and m.user_id <> auth.uid()
          order by m.joined_at desc
          limit 5
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.member_overview(uuid) from public, anon;
grant execute on function public.member_overview(uuid) to authenticated;
