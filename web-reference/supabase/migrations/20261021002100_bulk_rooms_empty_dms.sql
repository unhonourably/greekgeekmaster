create or replace function public.my_conversations(p_chapter uuid)
returns table (
  id uuid, kind text, name text, topic text, visibility text, posting_policy text, last_message_at timestamptz,
  unread_count bigint, notify text, muted_until timestamptz, is_moderator boolean, other_user_id uuid, other_display_name text, member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.kind, c.name, c.topic, c.visibility, c.posting_policy, c.last_message_at,
    (select count(*) from public.messages m where m.conversation_id = c.id and m.created_at > cm.last_read_at and m.sender_id <> auth.uid() and m.deleted_at is null and m.parent_id is null),
    cm.notify, cm.muted_until,
    private.is_conversation_moderator(c.id),
    o.user_id,
    (select coalesce(nullif(p.display_name, ''), p.full_name) from public.profiles p where p.id = o.user_id),
    (select count(*) from public.conversation_members x where x.conversation_id = c.id and x.removed_at is null)
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id and c.archived_at is null
  left join lateral (
    select x.user_id from public.conversation_members x where c.kind = 'direct' and x.conversation_id = c.id and x.user_id <> auth.uid() limit 1
  ) o on true
  where cm.user_id = auth.uid() and cm.removed_at is null and c.chapter_id = p_chapter and private.is_member(p_chapter)
    and (c.kind <> 'direct' or exists (select 1 from public.messages m where m.conversation_id = c.id))
  order by case c.kind when 'chapter_main' then 0 when 'announcement' then 1 when 'exec' then 2 else 3 end, c.last_message_at desc nulls last
$$;

revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;

create or replace function public.bulk_create_housing_rooms(p_chapter uuid, p_rooms jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_name text;
  v_floor text;
  v_capacity int;
  v_rent bigint;
  v_features text[];
  v_created text[] := '{}';
  v_skipped text[] := '{}';
  v_seen text[] := '{}';
begin
  if not private.has_permission(p_chapter, 'housing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rooms) is distinct from 'array' or jsonb_array_length(p_rooms) = 0 then
    raise exception 'add at least one room' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rooms) > 200 then
    raise exception 'you can add up to 200 rooms at a time' using errcode = '22023';
  end if;
  if (select count(*) from public.housing_rooms where chapter_id = p_chapter and archived_at is null) + jsonb_array_length(p_rooms) > 500 then
    raise exception 'a chapter can have up to 500 active rooms' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rooms) loop
    v_name := btrim(coalesce(r ->> 'name', ''));
    if char_length(v_name) not between 1 and 60 then
      raise exception 'room names must be 1 to 60 characters' using errcode = '22023';
    end if;
    v_floor := nullif(left(btrim(coalesce(r ->> 'floor', '')), 40), '');
    v_capacity := coalesce((r ->> 'capacity')::int, 2);
    if v_capacity not between 1 and 12 then
      raise exception 'rooms sleep between 1 and 12 people' using errcode = '22023';
    end if;
    v_rent := nullif(r ->> 'rent_cents', '')::bigint;
    if v_rent is not null and v_rent not between 0 and 10000000 then
      raise exception 'rent must be between $0 and $100,000' using errcode = '22023';
    end if;
    v_features := coalesce((
      select array_agg(distinct left(btrim(f), 40)) from jsonb_array_elements_text(coalesce(r -> 'features', '[]'::jsonb)) f where btrim(f) <> ''
    ), '{}');
    if cardinality(v_features) > 12 then
      raise exception 'rooms can have up to 12 features' using errcode = '22023';
    end if;
    if lower(v_name) = any (v_seen) or exists (
      select 1 from public.housing_rooms where chapter_id = p_chapter and archived_at is null and lower(name) = lower(v_name)
    ) then
      v_skipped := v_skipped || v_name;
      continue;
    end if;
    v_seen := v_seen || lower(v_name);
    insert into public.housing_rooms (chapter_id, name, floor, capacity, rent_cents, features, created_by)
    values (p_chapter, v_name, v_floor, v_capacity, v_rent, v_features, auth.uid());
    v_created := v_created || v_name;
  end loop;
  if cardinality(v_created) > 0 then
    perform private.write_audit(p_chapter, 'housing.rooms_bulk_created', 'housing_room', null,
      jsonb_build_object('count', cardinality(v_created), 'names', to_jsonb(v_created[1:50])));
  end if;
  return jsonb_build_object('created', cardinality(v_created), 'skipped', to_jsonb(v_skipped));
end;
$$;

revoke execute on function public.bulk_create_housing_rooms(uuid, jsonb) from public, anon;
grant execute on function public.bulk_create_housing_rooms(uuid, jsonb) to authenticated;
