create table public.chapter_closure_requests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  requested_by uuid not null references public.profiles (id),
  reason text not null check (char_length(btrim(reason)) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000)
);

create unique index chapter_closure_requests_one_pending
  on public.chapter_closure_requests (chapter_id)
  where status = 'pending';

create index chapter_closure_requests_status_idx
  on public.chapter_closure_requests (status, created_at);

create table public.account_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  purpose text not null check (purpose in ('password_change', 'email_current', 'email_new')),
  email text not null,
  new_email text,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index account_challenges_user_idx
  on public.account_challenges (user_id, created_at desc);

alter table public.chapter_closure_requests enable row level security;
alter table public.account_challenges enable row level security;

create policy chapter_closure_requests_select on public.chapter_closure_requests
  for select to authenticated
  using (
    private.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      join public.chapters c on c.id = m.chapter_id and c.status in ('verified', 'suspended')
      join public.role_assignments ra on ra.membership_id = m.id
        and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
      join public.role_permissions rp on rp.role_id = ra.role_id and rp.permission_key = 'chapter.manage'
      where m.chapter_id = chapter_closure_requests.chapter_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create or replace function public.request_chapter_closure(p_chapter uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not private.is_member(p_chapter) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.memberships m
    join public.role_assignments ra on ra.membership_id = m.id
      and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
    join public.role_permissions rp on rp.role_id = ra.role_id and rp.permission_key = 'chapter.manage'
    where m.chapter_id = p_chapter and m.user_id = auth.uid() and m.status = 'active'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.chapters
    where id = p_chapter and status in ('verified', 'suspended')
  ) then
    raise exception 'this chapter cannot be closed from here' using errcode = '22023';
  end if;
  if char_length(v_reason) < 20 or char_length(v_reason) > 2000 then
    raise exception 'explain the closure in 20 to 2000 characters' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.chapter_closure_requests
    where chapter_id = p_chapter and status = 'pending'
  ) then
    raise exception 'a closure request is already waiting for review' using errcode = '23505';
  end if;
  insert into public.chapter_closure_requests (chapter_id, requested_by, reason)
  values (p_chapter, auth.uid(), v_reason)
  returning id into v_id;
  perform private.write_audit(
    p_chapter,
    'chapter.closure_requested',
    'chapter_closure_request',
    v_id::text,
    jsonb_build_object('reason', v_reason)
  );
  return v_id;
end;
$$;

revoke execute on function public.request_chapter_closure(uuid, text) from public, anon;
grant execute on function public.request_chapter_closure(uuid, text) to authenticated;

create or replace function public.review_chapter_closure(p_request uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.chapter_closure_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_old public.chapter_status;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_decision not in ('accepted', 'declined') then
    raise exception 'choose a decision' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'keep the note under 2000 characters' using errcode = '22023';
  end if;
  select * into v from public.chapter_closure_requests where id = p_request for update;
  if not found or v.status <> 'pending' then
    raise exception 'that request is no longer open' using errcode = '22023';
  end if;
  if p_decision = 'accepted' then
    select status into v_old from public.chapters where id = v.chapter_id for update;
    update public.chapters
    set status = 'closed', suspended_reason = null
    where id = v.chapter_id;
    perform private.write_audit(
      v.chapter_id,
      'chapter.status_changed',
      'chapter',
      v.chapter_id::text,
      jsonb_build_object('from', v_old, 'to', 'closed', 'reason', coalesce(v_note, v.reason), 'request', v.id)
    );
  end if;
  update public.chapter_closure_requests
  set status = p_decision,
      decided_at = now(),
      decided_by = auth.uid(),
      decision_note = v_note
  where id = p_request;
  perform private.write_audit(
    v.chapter_id,
    'chapter.closure_reviewed',
    'chapter_closure_request',
    v.id::text,
    jsonb_build_object('decision', p_decision, 'note', v_note)
  );
end;
$$;

revoke execute on function public.review_chapter_closure(uuid, text, text) from public, anon;
grant execute on function public.review_chapter_closure(uuid, text, text) to authenticated;

create or replace function public.chapter_manager_emails(p_chapter uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct u.email), '{}')
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.chapter_id = p_chapter
    and m.status = 'active'
    and u.email is not null
    and exists (
      select 1
      from public.role_assignments ra
      join public.role_permissions rp on rp.role_id = ra.role_id
      where ra.membership_id = m.id
        and ra.starts_at <= now()
        and (ra.ends_at is null or ra.ends_at > now())
        and rp.permission_key = 'chapter.manage'
    )
$$;

create or replace function public.platform_admin_emails()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct u.email), '{}')
  from public.platform_staff s
  join auth.users u on u.id = s.user_id
  where s.role = 'admin'
    and s.revoked_at is null
    and u.email is not null
$$;

create or replace function public.email_is_taken(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(btrim(coalesce(p_email, '')))
  )
$$;

revoke execute on function public.chapter_manager_emails(uuid) from public, anon, authenticated;
revoke execute on function public.platform_admin_emails() from public, anon, authenticated;
revoke execute on function public.email_is_taken(text) from public, anon, authenticated;
grant execute on function public.chapter_manager_emails(uuid) to service_role;
grant execute on function public.platform_admin_emails() to service_role;
grant execute on function public.email_is_taken(text) to service_role;

create or replace function private.clear_account_challenges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    delete from public.account_challenges where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_clear_account_challenges
before update on public.profiles
for each row execute function private.clear_account_challenges();
