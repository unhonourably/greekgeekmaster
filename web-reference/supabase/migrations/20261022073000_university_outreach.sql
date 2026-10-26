alter table public.outreach_contacts
  add column if not exists university_id uuid references public.universities (id);

create index if not exists outreach_contacts_university_id_idx on public.outreach_contacts (university_id);

create table public.university_outreach (
  university_id uuid primary key references public.universities (id) on delete cascade,
  image_url text,
  image_page text,
  image_checked_at timestamptz,
  research_status text not null default 'idle' check (research_status in ('idle', 'running', 'done', 'failed')),
  research_started_at timestamptz,
  research_finished_at timestamptz,
  research_error text,
  pages jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  chapters_found int not null default 0,
  emails_found int not null default 0,
  facts_found int not null default 0,
  intro_code text unique,
  updated_at timestamptz not null default now()
);

create trigger university_outreach_touch before update on public.university_outreach
  for each row execute function private.touch_updated_at();

create table public.intro_responses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id),
  full_name text not null check (char_length(full_name) between 2 and 120),
  role text not null check (char_length(role) between 2 and 80),
  organization text not null check (char_length(organization) between 2 and 120),
  council text check (council is null or council in ('IFC', 'Panhellenic', 'MGC', 'NPHC', 'Other')),
  member_count int check (member_count is null or member_count between 0 and 5000),
  in_house int check (in_house is null or in_house between 0 and 5000),
  out_of_house int check (out_of_house is null or out_of_house between 0 and 5000),
  dues text check (dues is null or char_length(dues) <= 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) between 7 and 40),
  prefer_email boolean not null default false,
  prefer_text boolean not null default false,
  prefer_call boolean not null default false,
  best_time text check (best_time is null or char_length(best_time) <= 120),
  interest text not null check (interest in ('demo', 'learn_more', 'later')),
  help text[] not null default '{}',
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  check (prefer_email or prefer_text or prefer_call)
);

create or replace function private.outreach_email_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_contact public.outreach_contacts;
begin
  if tg_op = 'DELETE' then
    perform private.refresh_outreach_contact(old.contact_id);
    return old;
  end if;
  perform private.refresh_outreach_contact(new.contact_id);
  if tg_op = 'UPDATE' and new.status = 'bounced' and old.status is distinct from 'bounced' then
    update public.outreach_contacts set do_not_contact = true where id = new.contact_id;
  end if;
  if tg_op = 'INSERT' and new.direction = 'reply' and not new.logged_by_hand then
    select * into v_contact from public.outreach_contacts where id = new.contact_id;
    for v_admin in
      select s.user_id from public.platform_staff s where s.revoked_at is null and s.role = 'admin'
    loop
      perform private.notify(
        v_admin,
        null,
        'marketing_alert',
        'Reply from ' || coalesce(v_contact.full_name, v_contact.email),
        left(v_contact.organization || ', ' || v_contact.university, 160),
        '/admin/outreach/contacts/' || new.contact_id::text,
        'outreach-reply:' || new.id::text
      );
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.intro_university(p_code text)
returns table (university_name text, city text, state text, image_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.name, u.city, u.state, o.image_url
  from public.university_outreach o
  join public.universities u on u.id = o.university_id
  where o.intro_code = p_code
$$;

create or replace function public.submit_intro(
  p_code text,
  p_full_name text,
  p_role text,
  p_organization text,
  p_council text,
  p_member_count int,
  p_in_house int,
  p_out_of_house int,
  p_dues text,
  p_email text,
  p_phone text,
  p_prefer_email boolean,
  p_prefer_text boolean,
  p_prefer_call boolean,
  p_best_time text,
  p_interest text,
  p_help text[],
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university uuid;
  v_id uuid;
  v_admin uuid;
  v_help text[] := '{}';
begin
  select o.university_id into v_university from public.university_outreach o where o.intro_code = p_code;
  if v_university is null then
    raise exception 'page not found' using errcode = '22023';
  end if;
  if coalesce(p_prefer_email, false) = false and coalesce(p_prefer_text, false) = false and coalesce(p_prefer_call, false) = false then
    raise exception 'choose a way to follow up' using errcode = '22023';
  end if;
  if (select count(*) from public.intro_responses r where lower(r.email) = lower(btrim(p_email)) and r.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many submissions' using errcode = '22023';
  end if;
  select coalesce(array_agg(item), '{}') into v_help
  from (
    select item from unnest(coalesce(p_help, '{}')) item
    where item in ('dues', 'directory', 'recruitment', 'events', 'announcements', 'housing')
    limit 8
  ) picked;
  if v_help is null then
    v_help := '{}';
  end if;
  insert into public.intro_responses (
    university_id, full_name, role, organization, council, member_count, in_house, out_of_house,
    dues, email, phone, prefer_email, prefer_text, prefer_call, best_time, interest, help, notes
  ) values (
    v_university, btrim(p_full_name), btrim(p_role), btrim(p_organization), nullif(btrim(coalesce(p_council, '')), ''),
    p_member_count, p_in_house, p_out_of_house, nullif(btrim(coalesce(p_dues, '')), ''), btrim(p_email),
    nullif(btrim(coalesce(p_phone, '')), ''), coalesce(p_prefer_email, false), coalesce(p_prefer_text, false),
    coalesce(p_prefer_call, false), nullif(btrim(coalesce(p_best_time, '')), ''), p_interest, v_help,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;
  for v_admin in
    select s.user_id from public.platform_staff s where s.revoked_at is null and s.role = 'admin'
  loop
    perform private.notify(
      v_admin, null, 'marketing_alert', 'A chapter wants to talk',
      left(btrim(p_organization) || ' · ' || btrim(p_full_name), 160),
      '/admin/outreach/schools/' || v_university::text,
      'intro:' || v_id::text
    );
  end loop;
  return v_id;
end;
$$;

revoke execute on function public.intro_university(text) from public;
revoke execute on function public.submit_intro(text, text, text, text, text, int, int, int, text, text, text, boolean, boolean, boolean, text, text, text[], text) from public;
grant execute on function public.intro_university(text) to anon, authenticated;
grant execute on function public.submit_intro(text, text, text, text, text, int, int, int, text, text, text, boolean, boolean, boolean, text, text, text[], text) to anon, authenticated;

alter table public.university_outreach enable row level security;
alter table public.intro_responses enable row level security;

create policy university_outreach_admin on public.university_outreach for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));

create policy intro_responses_admin on public.intro_responses for select to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]));

update public.notifications
set link = '/admin/outreach/contacts/' || substring(link from 17)
where link ~ '^/admin/outreach/[0-9a-f-]{36}$';
