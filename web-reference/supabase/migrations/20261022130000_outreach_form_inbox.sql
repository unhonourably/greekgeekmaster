alter table public.intro_responses
  add column if not exists status text not null default 'new' check (status in ('new', 'contacted', 'meeting', 'signed_up', 'not_a_fit', 'archived')),
  add column if not exists read_at timestamptz,
  add column if not exists admin_notes text check (admin_notes is null or char_length(admin_notes) <= 4000),
  add column if not exists status_changed_at timestamptz,
  add column if not exists contact_id uuid references public.outreach_contacts (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists intro_responses_inbox_idx on public.intro_responses (status, created_at desc);
create index if not exists intro_responses_unread_idx on public.intro_responses (created_at desc) where read_at is null;

drop trigger if exists intro_responses_touch on public.intro_responses;
create trigger intro_responses_touch before update on public.intro_responses
  for each row execute function private.touch_updated_at();

drop policy if exists intro_responses_admin_update on public.intro_responses;
create policy intro_responses_admin_update on public.intro_responses for update to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));

revoke insert, update, delete on public.intro_responses from anon, authenticated;
grant update (status, read_at, admin_notes, status_changed_at, contact_id) on public.intro_responses to authenticated;

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
      '/admin/outreach/forms/' || v_id::text,
      'intro:' || v_id::text
    );
  end loop;
  return v_id;
end;
$$;

revoke execute on function public.submit_intro(text, text, text, text, text, int, int, int, text, text, text, boolean, boolean, boolean, text, text, text[], text) from public;
grant execute on function public.submit_intro(text, text, text, text, text, int, int, int, text, text, text, boolean, boolean, boolean, text, text, text[], text) to anon, authenticated;

update public.notifications
set link = '/admin/outreach/forms/' || substring(dedupe_key from 7)
where dedupe_key ~ '^intro:[0-9a-f-]{36}$';
