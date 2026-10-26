create or replace function private.is_officer(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.chapters c on c.id = m.chapter_id and c.status = 'verified'
    join public.role_assignments ra on ra.membership_id = m.id
      and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
    join public.roles r on r.id = ra.role_id and r.is_officer
    where m.chapter_id = p_chapter and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create table public.membership_recruiters (
  membership_id uuid primary key,
  chapter_id uuid not null references public.chapters (id),
  recruiter_membership_id uuid,
  source text not null check (source in ('self_reported', 'officer')),
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  constraint membership_recruiters_member_fkey foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id),
  constraint membership_recruiters_recruiter_fkey foreign key (chapter_id, recruiter_membership_id) references public.memberships (chapter_id, id),
  check (recruiter_membership_id is distinct from membership_id)
);

create index membership_recruiters_recruiter_idx on public.membership_recruiters (chapter_id, recruiter_membership_id);

alter table public.membership_recruiters enable row level security;

create policy membership_recruiters_officers_read on public.membership_recruiters for select to authenticated
  using (private.is_officer(chapter_id));

create or replace function private.recruiter_role_holder(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    where ra.membership_id = p_membership
      and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
      and (r.key in ('recruitment_chair', 'recruitment_team') or r.name ~* '(rush|recruit)')
  )
$$;

create or replace function public.invitation_recruiter_options(p_token_hash text)
returns table (membership_id uuid, name text, recruitment_role boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.chapter_invitations;
  v_email text;
begin
  select * into v_inv from public.chapter_invitations where token_hash = p_token_hash;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_inv.id is null or v_inv.status <> 'pending' or v_email is distinct from lower(v_inv.email) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select m.id,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Member'),
      private.recruiter_role_holder(m.id)
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.chapter_id = v_inv.chapter_id and m.status = 'active' and m.user_id <> auth.uid()
    order by private.recruiter_role_holder(m.id) desc, 2;
end;
$$;

revoke execute on function public.invitation_recruiter_options(text) from public, anon;
grant execute on function public.invitation_recruiter_options(text) to authenticated;

drop function public.accept_chapter_invitation(text);

create function public.accept_chapter_invitation(p_token_hash text, p_recruited_by uuid default null, p_recruiter_answered boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter uuid;
  v_membership uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_chapter := private.accept_invitation_as(p_token_hash, auth.uid());
  select id into v_membership from public.memberships where chapter_id = v_chapter and user_id = auth.uid();
  if p_recruited_by is not null then
    if p_recruited_by = v_membership or not exists (
      select 1 from public.memberships where id = p_recruited_by and chapter_id = v_chapter and status = 'active'
    ) then
      raise exception 'choose a current member of this chapter as your recruiter' using errcode = '22023';
    end if;
  end if;
  if p_recruited_by is not null or coalesce(p_recruiter_answered, false) then
    insert into public.membership_recruiters (membership_id, chapter_id, recruiter_membership_id, source, recorded_by)
    values (v_membership, v_chapter, p_recruited_by, 'self_reported', auth.uid())
    on conflict (membership_id) do update
      set recruiter_membership_id = excluded.recruiter_membership_id, source = excluded.source, recorded_by = excluded.recorded_by, recorded_at = now();
  end if;
  return v_chapter;
end;
$$;

revoke execute on function public.accept_chapter_invitation(text, uuid, boolean) from public, anon;
grant execute on function public.accept_chapter_invitation(text, uuid, boolean) to authenticated;

create or replace function public.set_member_recruiter(p_membership uuid, p_recruiter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership;
  if v_m.id is null or not (private.has_permission(v_m.chapter_id, 'members.manage') or private.has_permission(v_m.chapter_id, 'recruitment.manage')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_recruiter is not null and (p_recruiter = p_membership or not exists (select 1 from public.memberships where id = p_recruiter and chapter_id = v_m.chapter_id)) then
    raise exception 'choose a member of this chapter' using errcode = '22023';
  end if;
  insert into public.membership_recruiters (membership_id, chapter_id, recruiter_membership_id, source, recorded_by)
  values (v_m.id, v_m.chapter_id, p_recruiter, 'officer', auth.uid())
  on conflict (membership_id) do update
    set recruiter_membership_id = excluded.recruiter_membership_id, source = 'officer', recorded_by = auth.uid(), recorded_at = now();
  perform private.write_audit(v_m.chapter_id, 'membership.recruiter_set', 'membership', v_m.id::text, jsonb_build_object('recruiter_membership_id', p_recruiter));
end;
$$;

revoke execute on function public.set_member_recruiter(uuid, uuid) from public, anon;
grant execute on function public.set_member_recruiter(uuid, uuid) to authenticated;

create or replace function public.chapter_officer_dashboard(p_chapter uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz := date_trunc('month', now());
  v_active int;
  v_finance jsonb := null;
begin
  if not private.is_officer(p_chapter) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select count(*) into v_active from public.memberships where chapter_id = p_chapter and status = 'active';
  if private.has_permission(p_chapter, 'finance.view') then
    select jsonb_build_object(
      'billed_cents', coalesce(sum(b.amount_cents), 0),
      'outstanding_cents', coalesce(sum(greatest(b.outstanding_cents, 0)), 0),
      'overdue_members', count(distinct b.membership_id) filter (where b.outstanding_cents > 0 and b.due_date < current_date),
      'members_with_balance', count(distinct b.membership_id) filter (where b.outstanding_cents > 0)
    ) into v_finance
    from public.member_assessment_balances b
    where b.chapter_id = p_chapter and b.status <> 'voided';
  end if;
  return jsonb_build_object(
    'members', jsonb_build_object(
      'active', v_active,
      'inactive', (select count(*) from public.memberships where chapter_id = p_chapter and status in ('inactive', 'suspended')),
      'by_class', coalesce((select jsonb_object_agg(member_class, n) from (
        select member_class::text, count(*) n from public.memberships where chapter_id = p_chapter and status = 'active' group by member_class) s), '{}'::jsonb),
      'officers', (select count(distinct ra.membership_id) from public.role_assignments ra
        join public.roles r on r.id = ra.role_id and r.is_officer
        join public.memberships m on m.id = ra.membership_id and m.status = 'active'
        where ra.chapter_id = p_chapter and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())),
      'joined_30d', (select count(*) from public.memberships where chapter_id = p_chapter and joined_at >= now() - interval '30 days'),
      'departed_30d', (select count(*) from public.memberships where chapter_id = p_chapter and ended_at >= now() - interval '30 days'),
      'pending_invitations', (select count(*) from public.chapter_invitations where chapter_id = p_chapter and status = 'pending' and expires_at > now())
    ),
    'growth', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'), 'joined',
        (select count(*) from public.memberships where chapter_id = p_chapter and joined_at >= g.m and joined_at < g.m + interval '1 month')) order by g.m)
      from generate_series(v_month_start - interval '5 months', v_month_start, interval '1 month') g(m)), '[]'::jsonb),
    'events', jsonb_build_object(
      'upcoming_7d', (select count(*) from public.events where chapter_id = p_chapter and cancelled_at is null and starts_at >= now() and starts_at < now() + interval '7 days'),
      'held_30d', (select count(*) from public.events where chapter_id = p_chapter and cancelled_at is null and starts_at >= now() - interval '30 days' and starts_at < now()),
      'required_attendance_rate_30d', (
        select case when count(*) = 0 then null else round(100.0 * count(*) filter (where a.status in ('present', 'late', 'excused')) / count(*), 1) end
        from public.events e
        cross join public.memberships m
        left join public.event_attendance a on a.event_id = e.id and a.membership_id = m.id
        where e.chapter_id = p_chapter and m.chapter_id = p_chapter and m.status = 'active' and e.attendance_required and e.cancelled_at is null
          and e.starts_at >= now() - interval '30 days' and e.starts_at < now()
          and (cardinality(e.required_classes) = 0 or m.member_class = any (e.required_classes))
          and m.joined_at <= e.starts_at
      )
    ),
    'engagement', jsonb_build_object(
      'messages_7d', (select count(*) from public.messages where chapter_id = p_chapter and created_at >= now() - interval '7 days' and deleted_at is null),
      'active_chatters_7d', (select count(distinct msg.sender_id) from public.messages msg
        join public.memberships m on m.chapter_id = msg.chapter_id and m.user_id = msg.sender_id and m.status = 'active'
        where msg.chapter_id = p_chapter and msg.created_at >= now() - interval '7 days'),
      'ack_rate_30d', (
        select case when count(*) = 0 then null else round(100.0 * count(k.user_id) / count(*), 1) end
        from public.announcements an
        cross join public.memberships m
        left join public.announcement_acks k on k.announcement_id = an.id and k.user_id = m.user_id
        where an.chapter_id = p_chapter and an.requires_ack and an.archived_at is null and an.published_at >= now() - interval '30 days'
          and m.chapter_id = p_chapter and m.status = 'active' and m.joined_at <= an.published_at
      )
    ),
    'recruitment', jsonb_build_object(
      'active_prospects', (select count(*) from public.prospects where chapter_id = p_chapter and status = 'active'),
      'follow_ups_due', (select count(*) from public.prospects where chapter_id = p_chapter and status = 'active' and next_follow_up_at <= now()),
      'credited_30d', (select count(*) from public.membership_recruiters where chapter_id = p_chapter and recruiter_membership_id is not null and recorded_at >= now() - interval '30 days'),
      'top_recruiters', coalesce((select jsonb_agg(jsonb_build_object('membership_id', t.rid, 'name', t.name, 'count', t.n) order by t.n desc, t.name)
        from (
          select mr.recruiter_membership_id rid, count(*) n,
            coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Member') name
          from public.membership_recruiters mr
          join public.memberships rm on rm.id = mr.recruiter_membership_id
          join public.profiles p on p.id = rm.user_id
          where mr.chapter_id = p_chapter and mr.recruiter_membership_id is not null
          group by mr.recruiter_membership_id, p.full_name, p.display_name
          order by n desc
          limit 5
        ) t), '[]'::jsonb)
    ),
    'finance', v_finance
  );
end;
$$;

revoke execute on function public.chapter_officer_dashboard(uuid) from public, anon;
grant execute on function public.chapter_officer_dashboard(uuid) to authenticated;
