create or replace function public.add_application_note(p_application uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['reviewer']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'write a note' using errcode = '22023';
  end if;
  if not exists (select 1 from public.chapter_applications where id = p_application) then
    raise exception 'application not found' using errcode = '22023';
  end if;
  insert into public.verification_events (application_id, actor_id, kind, message, visibility)
  values (p_application, auth.uid(), 'note', left(p_note, 4000), 'internal');
end;
$$;

revoke execute on function public.add_application_note(uuid, text) from public, anon;
grant execute on function public.add_application_note(uuid, text) to authenticated;

create or replace function public.platform_chapter_overview(p_search text, p_status public.chapter_status, p_limit int, p_offset int)
returns table (
  id uuid,
  slug text,
  organization_name text,
  designation text,
  university text,
  status public.chapter_status,
  verified_at timestamptz,
  active_members bigint,
  subscription_status text,
  payments_enabled boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['support', 'reviewer', 'finance']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select c.id, c.slug, c.organization_name, c.designation, u.name, c.status, c.verified_at,
    (select count(*) from public.memberships m where m.chapter_id = c.id and m.status = 'active'),
    (select s.status from public.chapter_subscriptions s where s.chapter_id = c.id order by s.updated_at desc limit 1),
    coalesce((select a.card_payments_status = 'active' and a.payouts_status = 'active' from public.connected_accounts a where a.chapter_id = c.id), false),
    count(*) over ()
  from public.chapters c
  join public.universities u on u.id = c.university_id
  where (p_status is null or c.status = p_status)
    and (p_search is null or c.organization_name ilike '%' || p_search || '%' or u.name ilike '%' || p_search || '%' or c.slug ilike '%' || p_search || '%')
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.platform_chapter_overview(text, public.chapter_status, int, int) from public, anon;
grant execute on function public.platform_chapter_overview(text, public.chapter_status, int, int) to authenticated;
