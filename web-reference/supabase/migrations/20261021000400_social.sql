create table public.achievement_badges (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  icon text not null default 'award' check (icon ~ '^[a-z0-9-]{2,40}$'),
  category text not null default 'achievement' check (category in ('achievement', 'service', 'academic', 'leadership')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, name),
  unique (chapter_id, id)
);

create table public.member_achievements (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  membership_id uuid not null,
  badge_id uuid not null,
  note text check (char_length(note) <= 300),
  awarded_by uuid not null references public.profiles (id),
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id),
  foreign key (chapter_id, badge_id) references public.achievement_badges (chapter_id, id)
);

create unique index member_achievements_active on public.member_achievements (membership_id, badge_id) where revoked_at is null;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  kind text not null check (kind in ('chapter_main', 'announcement', 'exec', 'channel', 'committee', 'recruitment', 'event', 'alumni', 'direct', 'group')),
  name text check (char_length(name) <= 80),
  topic text check (char_length(topic) <= 300),
  visibility text not null default 'restricted' check (visibility in ('open', 'restricted')),
  posting_policy text not null default 'all' check (posting_policy in ('all', 'moderators')),
  auto_membership text not null default 'none' check (auto_membership in ('none', 'all_members', 'officers', 'alumni')),
  dm_key text,
  event_id uuid,
  created_by uuid references public.profiles (id),
  archived_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chapter_id, id),
  unique (chapter_id, dm_key),
  check ((kind = 'direct') = (dm_key is not null)),
  check (kind in ('direct', 'group') or name is not null)
);

create index conversations_chapter_idx on public.conversations (chapter_id, last_message_at desc nulls last);

create table public.conversation_members (
  conversation_id uuid not null,
  chapter_id uuid not null,
  user_id uuid not null references public.profiles (id),
  role text not null default 'member' check (role in ('member', 'moderator')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  last_read_at timestamptz not null default now(),
  notify text not null default 'mentions' check (notify in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  posting_restricted_until timestamptz,
  primary key (conversation_id, user_id),
  foreign key (chapter_id, conversation_id) references public.conversations (chapter_id, id)
);

create index conversation_members_user_idx on public.conversation_members (user_id) where removed_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  chapter_id uuid not null,
  sender_id uuid not null references public.profiles (id),
  parent_id uuid references public.messages (id),
  body text not null check (char_length(body) <= 4000),
  mentions uuid[] not null default '{}',
  mention_role_ids uuid[] not null default '{}',
  mention_all boolean not null default false,
  reply_count int not null default 0,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  pinned_at timestamptz,
  pinned_by uuid references public.profiles (id),
  search tsvector generated always as (to_tsvector('english', body)) stored,
  created_at timestamptz not null default now(),
  foreign key (chapter_id, conversation_id) references public.conversations (chapter_id, id)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_parent_idx on public.messages (parent_id, created_at) where parent_id is not null;
create index messages_search_idx on public.messages using gin (search);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null,
  user_id uuid not null references public.profiles (id),
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id),
  conversation_id uuid not null,
  chapter_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes int not null check (size_bytes between 1 and 15728640),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index message_attachments_message_idx on public.message_attachments (message_id);

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  message_id uuid not null references public.messages (id),
  conversation_id uuid not null,
  reporter_id uuid not null references public.profiles (id),
  reported_user_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('harassment', 'spam', 'hazing', 'threat', 'privacy', 'other')),
  details text check (char_length(details) <= 1000),
  message_snapshot text not null,
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  action text,
  resolution_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  author_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 2 and 140),
  body text not null check (char_length(body) between 1 and 8000),
  audience text not null default 'all' check (audience in ('all', 'officers')),
  pinned boolean not null default false,
  requires_ack boolean not null default false,
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_chapter_idx on public.announcements (chapter_id, published_at desc);

create table public.announcement_acks (
  announcement_id uuid not null references public.announcements (id),
  user_id uuid not null references public.profiles (id),
  acked_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create or replace function private.is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.memberships m on m.chapter_id = cm.chapter_id and m.user_id = cm.user_id and m.status = 'active'
    join public.chapters c on c.id = cm.chapter_id and c.status in ('verified', 'suspended')
    join public.conversations cv on cv.id = cm.conversation_id and cv.archived_at is null
    where cm.conversation_id = p_conversation and cm.user_id = auth.uid() and cm.removed_at is null
  )
$$;

create or replace function private.is_conversation_moderator(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_conversation_member(p_conversation) and (
    exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = auth.uid() and role = 'moderator')
    or exists (select 1 from public.conversations c where c.id = p_conversation and c.kind not in ('direct', 'group') and private.has_permission(c.chapter_id, 'chat.moderate'))
  )
$$;

create or replace function private.sync_member_conversations(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_officer boolean;
begin
  select * into v_m from public.memberships where id = p_membership;
  if v_m.id is null then
    return;
  end if;
  if v_m.status <> 'active' then
    update public.conversation_members set removed_at = now()
    where chapter_id = v_m.chapter_id and user_id = v_m.user_id and removed_at is null;
    return;
  end if;
  v_officer := exists (
    select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id and r.is_officer
    where ra.membership_id = v_m.id and ra.ends_at is null
  );
  insert into public.conversation_members (conversation_id, chapter_id, user_id, role)
  select c.id, c.chapter_id, v_m.user_id, 'member'
  from public.conversations c
  where c.chapter_id = v_m.chapter_id and c.archived_at is null
    and (
      c.auto_membership = 'all_members'
      or (c.auto_membership = 'officers' and v_officer)
      or (c.auto_membership = 'alumni' and v_m.member_class = 'alumni')
    )
  on conflict (conversation_id, user_id) do update set removed_at = null;
  update public.conversation_members cm set removed_at = now()
  from public.conversations c
  where c.id = cm.conversation_id and cm.user_id = v_m.user_id and cm.chapter_id = v_m.chapter_id and cm.removed_at is null
    and ((c.auto_membership = 'officers' and not v_officer) or (c.auto_membership = 'alumni' and v_m.member_class <> 'alumni'));
  update public.conversation_members cm set role = 'moderator'
  from public.conversations c
  where c.id = cm.conversation_id and cm.user_id = v_m.user_id and c.chapter_id = v_m.chapter_id
    and c.kind in ('chapter_main', 'announcement') and private.user_has_permission(v_m.user_id, v_m.chapter_id, 'chat.moderate');
end;
$$;

revoke execute on function private.sync_member_conversations(uuid) from public, anon, authenticated;

create or replace function private.on_membership_change_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_member_conversations(new.id);
  return new;
end;
$$;

create trigger memberships_sync_conversations after insert or update of status, member_class on public.memberships
  for each row execute function private.on_membership_change_sync();

create or replace function private.on_role_change_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_member_conversations(new.membership_id);
  return new;
end;
$$;

create trigger role_assignments_sync_conversations after insert or update of ends_at on public.role_assignments
  for each row execute function private.on_role_change_sync();

create or replace function private.provision_chapter_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    if not exists (select 1 from public.conversations where chapter_id = new.id and kind = 'chapter_main') then
      insert into public.conversations (chapter_id, kind, name, topic, visibility, posting_policy, auto_membership)
      values
        (new.id, 'chapter_main', 'General', 'Chapter-wide conversation', 'open', 'all', 'all_members'),
        (new.id, 'announcement', 'Announcements', 'Officer updates for the whole chapter', 'open', 'moderators', 'all_members'),
        (new.id, 'exec', 'Executive board', 'Officers only', 'restricted', 'all', 'officers');
    end if;
  end if;
  return new;
end;
$$;

create trigger chapters_provision_conversations after insert or update of status on public.chapters
  for each row execute function private.provision_chapter_conversations();

create or replace function public.create_conversation(
  p_chapter uuid,
  p_kind text,
  p_name text,
  p_topic text,
  p_visibility text,
  p_posting_policy text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid;
begin
  if not private.is_member(p_chapter) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_kind not in ('channel', 'committee', 'recruitment', 'event', 'alumni', 'group') then
    raise exception 'unsupported conversation type' using errcode = '22023';
  end if;
  if p_kind = 'recruitment' and not private.has_permission(p_chapter, 'recruitment.manage') then
    raise exception 'recruitment channels are created by recruitment officers' using errcode = '42501';
  end if;
  if p_kind not in ('group', 'recruitment') and not private.has_permission(p_chapter, 'chat.manage') then
    raise exception 'only chat managers can create channels' using errcode = '42501';
  end if;
  if p_kind = 'group' and coalesce(cardinality(p_member_ids), 0) not between 2 and 30 then
    raise exception 'group conversations need 3 to 31 people' using errcode = '22023';
  end if;
  insert into public.conversations (chapter_id, kind, name, topic, visibility, posting_policy, auto_membership, created_by)
  values (
    p_chapter, p_kind, nullif(btrim(p_name), ''), nullif(btrim(p_topic), ''),
    case when p_kind = 'group' then 'restricted' else coalesce(p_visibility, 'restricted') end,
    coalesce(p_posting_policy, 'all'),
    case when p_kind = 'alumni' then 'alumni' else 'none' end,
    auth.uid()
  )
  returning id into v_id;
  insert into public.conversation_members (conversation_id, chapter_id, user_id, role)
  values (v_id, p_chapter, auth.uid(), case when p_kind = 'group' then 'member' else 'moderator' end);
  foreach v_uid in array coalesce(p_member_ids, '{}') loop
    if v_uid <> auth.uid() and exists (select 1 from public.memberships where chapter_id = p_chapter and user_id = v_uid and status = 'active') then
      insert into public.conversation_members (conversation_id, chapter_id, user_id) values (v_id, p_chapter, v_uid)
      on conflict do nothing;
    end if;
  end loop;
  if p_kind = 'alumni' then
    insert into public.conversation_members (conversation_id, chapter_id, user_id)
    select v_id, p_chapter, m.user_id from public.memberships m
    where m.chapter_id = p_chapter and m.status = 'active' and m.member_class = 'alumni'
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.create_conversation(uuid, text, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.create_conversation(uuid, text, text, text, text, text, uuid[]) to authenticated;

create or replace function public.start_direct_conversation(p_chapter uuid, p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_id uuid;
begin
  if not private.is_member(p_chapter) or p_other = auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships where chapter_id = p_chapter and user_id = p_other and status = 'active') then
    raise exception 'that person is not an active member' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_blocks where blocker_id = p_other and blocked_id = auth.uid()) then
    raise exception 'you cannot message this member' using errcode = '42501';
  end if;
  v_key := least(auth.uid()::text, p_other::text) || ':' || greatest(auth.uid()::text, p_other::text);
  select id into v_id from public.conversations where chapter_id = p_chapter and dm_key = v_key;
  if v_id is null then
    insert into public.conversations (chapter_id, kind, dm_key, visibility, created_by)
    values (p_chapter, 'direct', v_key, 'restricted', auth.uid())
    returning id into v_id;
    insert into public.conversation_members (conversation_id, chapter_id, user_id, notify)
    values (v_id, p_chapter, auth.uid(), 'all'), (v_id, p_chapter, p_other, 'all');
  else
    update public.conversation_members set removed_at = null
    where conversation_id = v_id and user_id in (auth.uid(), p_other);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.start_direct_conversation(uuid, uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid, uuid) to authenticated;

create or replace function public.join_open_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.conversations;
begin
  select * into v_c from public.conversations where id = p_conversation;
  if v_c.id is null or v_c.visibility <> 'open' or v_c.archived_at is not null or not private.is_member(v_c.chapter_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.conversation_members (conversation_id, chapter_id, user_id)
  values (v_c.id, v_c.chapter_id, auth.uid())
  on conflict (conversation_id, user_id) do update set removed_at = null;
end;
$$;

revoke execute on function public.join_open_conversation(uuid) from public, anon;
grant execute on function public.join_open_conversation(uuid) to authenticated;

create or replace function public.manage_conversation_member(p_conversation uuid, p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.conversations;
begin
  select * into v_c from public.conversations where id = p_conversation;
  if v_c.id is null or v_c.kind = 'direct' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_user = auth.uid() and p_action = 'remove' and v_c.auto_membership = 'none' then
    update public.conversation_members set removed_at = now() where conversation_id = v_c.id and user_id = auth.uid();
    return;
  end if;
  if not (private.is_conversation_moderator(v_c.id) or private.has_permission(v_c.chapter_id, 'chat.manage')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action = 'add' then
    if not exists (select 1 from public.memberships where chapter_id = v_c.chapter_id and user_id = p_user and status = 'active') then
      raise exception 'that person is not an active member' using errcode = '22023';
    end if;
    insert into public.conversation_members (conversation_id, chapter_id, user_id) values (v_c.id, v_c.chapter_id, p_user)
    on conflict (conversation_id, user_id) do update set removed_at = null;
  elsif p_action = 'remove' then
    update public.conversation_members set removed_at = now() where conversation_id = v_c.id and user_id = p_user;
  elsif p_action = 'promote' then
    update public.conversation_members set role = 'moderator' where conversation_id = v_c.id and user_id = p_user;
  elsif p_action = 'demote' then
    update public.conversation_members set role = 'member' where conversation_id = v_c.id and user_id = p_user;
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  perform private.write_audit(v_c.chapter_id, 'conversation.member_' || p_action, 'conversation', v_c.id::text, jsonb_build_object('user_id', p_user));
end;
$$;

revoke execute on function public.manage_conversation_member(uuid, uuid, text) from public, anon;
grant execute on function public.manage_conversation_member(uuid, uuid, text) to authenticated;

create or replace function public.send_message(
  p_conversation uuid,
  p_body text,
  p_parent uuid,
  p_mentions uuid[],
  p_mention_roles uuid[],
  p_mention_all boolean,
  p_attachments jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.conversations;
  v_cm public.conversation_members;
  v_msg public.messages;
  v_recent int;
  v_other uuid;
  a jsonb;
  v_prefix text;
begin
  select * into v_c from public.conversations where id = p_conversation;
  if v_c.id is null or not private.is_conversation_member(v_c.id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_cm from public.conversation_members where conversation_id = v_c.id and user_id = auth.uid();
  if v_cm.posting_restricted_until is not null and v_cm.posting_restricted_until > now() then
    raise exception 'posting is temporarily restricted for you in this conversation' using errcode = '42501';
  end if;
  if v_c.posting_policy = 'moderators' and not private.is_conversation_moderator(v_c.id) then
    raise exception 'only moderators can post here' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' and coalesce(jsonb_array_length(p_attachments), 0) = 0 then
    raise exception 'message is empty' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.messages where sender_id = auth.uid() and created_at > now() - interval '10 seconds';
  if v_recent >= 8 then
    raise exception 'you are sending messages too quickly' using errcode = '53400';
  end if;
  if v_c.kind = 'direct' then
    select user_id into v_other from public.conversation_members where conversation_id = v_c.id and user_id <> auth.uid();
    if exists (select 1 from public.user_blocks where blocker_id = v_other and blocked_id = auth.uid()) then
      raise exception 'you cannot message this member' using errcode = '42501';
    end if;
  end if;
  if p_parent is not null and not exists (select 1 from public.messages where id = p_parent and conversation_id = v_c.id and parent_id is null) then
    raise exception 'invalid thread' using errcode = '22023';
  end if;
  if coalesce(p_mention_all, false) and not private.is_conversation_moderator(v_c.id) then
    raise exception 'only moderators can notify everyone' using errcode = '42501';
  end if;
  insert into public.messages (conversation_id, chapter_id, sender_id, parent_id, body, mentions, mention_role_ids, mention_all)
  values (
    v_c.id, v_c.chapter_id, auth.uid(), p_parent, coalesce(btrim(p_body), ''),
    coalesce((select array_agg(distinct u) from unnest(coalesce(p_mentions, '{}')) u
      where exists (select 1 from public.conversation_members cm where cm.conversation_id = v_c.id and cm.user_id = u and cm.removed_at is null)), '{}'),
    coalesce((select array_agg(distinct r) from unnest(coalesce(p_mention_roles, '{}')) r
      where exists (select 1 from public.roles ro where ro.id = r and ro.chapter_id = v_c.chapter_id)), '{}'),
    coalesce(p_mention_all, false)
  )
  returning * into v_msg;
  v_prefix := v_c.chapter_id::text || '/' || v_c.id::text || '/';
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if left(a ->> 'path', length(v_prefix)) <> v_prefix then
      raise exception 'attachment path is outside this conversation' using errcode = '42501';
    end if;
    insert into public.message_attachments (message_id, conversation_id, chapter_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values (v_msg.id, v_c.id, v_c.chapter_id, a ->> 'path', a ->> 'name', a ->> 'type', (a ->> 'size')::int, auth.uid());
  end loop;
  update public.conversations set last_message_at = v_msg.created_at where id = v_c.id;
  update public.conversation_members set last_read_at = now() where conversation_id = v_c.id and user_id = auth.uid();
  if p_parent is not null then
    update public.messages set reply_count = reply_count + 1 where id = p_parent;
  end if;
  return v_msg;
end;
$$;

revoke execute on function public.send_message(uuid, text, uuid, uuid[], uuid[], boolean, jsonb) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid[], uuid[], boolean, jsonb) to authenticated;

create or replace function private.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.conversations;
  v_slug text;
  v_sender text;
  r record;
begin
  select * into v_c from public.conversations where id = new.conversation_id;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  select coalesce(nullif(display_name, ''), full_name) into v_sender from public.profiles where id = new.sender_id;
  for r in
    select cm.user_id, cm.notify, cm.muted_until
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.removed_at is null and cm.user_id <> new.sender_id
      and not exists (select 1 from public.user_blocks b where b.blocker_id = cm.user_id and b.blocked_id = new.sender_id)
  loop
    if r.muted_until is not null and r.muted_until > now() then
      continue;
    end if;
    if r.user_id = any (new.mentions) or new.mention_all or exists (
      select 1 from public.role_assignments ra join public.memberships m on m.id = ra.membership_id
      where m.user_id = r.user_id and m.chapter_id = new.chapter_id and ra.role_id = any (new.mention_role_ids) and ra.ends_at is null
    ) then
      if r.notify <> 'none' then
        perform private.notify(r.user_id, new.chapter_id, 'chat_mention', v_sender || ' mentioned you',
          case when v_c.kind = 'direct' then 'In a direct message' else 'In ' || coalesce(v_c.name, 'a conversation') end,
          '/c/' || v_slug || '/chat/' || v_c.id::text, 'mention:' || new.id::text);
      end if;
    elsif r.notify = 'all' then
      perform private.notify(r.user_id, new.chapter_id, 'chat_message',
        case when v_c.kind = 'direct' then 'New message from ' || v_sender else 'New message in ' || coalesce(v_c.name, 'a group') end,
        null, '/c/' || v_slug || '/chat/' || v_c.id::text, 'conv:' || v_c.id::text || ':' || to_char(date_trunc('hour', new.created_at), 'YYYYMMDDHH24'));
    end if;
  end loop;
  return new;
end;
$$;

create trigger messages_notify after insert on public.messages
  for each row execute function private.notify_message();

create or replace function private.guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return new;
  end if;
  if new.sender_id <> auth.uid() or old.deleted_at is not null then
    raise exception 'you can only edit your own messages' using errcode = '42501';
  end if;
  if new.conversation_id is distinct from old.conversation_id or new.chapter_id is distinct from old.chapter_id
    or new.sender_id is distinct from old.sender_id or new.parent_id is distinct from old.parent_id
    or new.created_at is distinct from old.created_at or new.pinned_at is distinct from old.pinned_at
    or new.pinned_by is distinct from old.pinned_by or new.reply_count is distinct from old.reply_count
    or new.mentions is distinct from old.mentions or new.mention_all is distinct from old.mention_all
    or new.mention_role_ids is distinct from old.mention_role_ids or new.deleted_by is distinct from old.deleted_by then
    raise exception 'only the message text can be edited' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'use delete_message to remove a message' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if old.created_at < now() - interval '24 hours' then
      raise exception 'messages can be edited for 24 hours' using errcode = '22023';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_guard before update on public.messages
  for each row execute function private.guard_message_update();

create or replace function public.moderate_message(p_message uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.messages;
  v_allowed boolean;
begin
  select * into v_m from public.messages where id = p_message;
  if v_m.id is null then
    raise exception 'not found' using errcode = '22023';
  end if;
  v_allowed := private.is_conversation_moderator(v_m.conversation_id)
    or (p_action = 'delete' and exists (
      select 1 from public.message_reports r where r.message_id = v_m.id and private.has_permission(r.chapter_id, 'chat.moderate')
    ));
  if not v_allowed then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action = 'pin' then
    update public.messages set pinned_at = now(), pinned_by = auth.uid() where id = v_m.id;
  elsif p_action = 'unpin' then
    update public.messages set pinned_at = null, pinned_by = null where id = v_m.id;
  elsif p_action = 'delete' then
    update public.messages set deleted_at = now(), deleted_by = auth.uid(), body = '' where id = v_m.id;
    delete from public.message_attachments where message_id = v_m.id;
    perform private.write_audit(v_m.chapter_id, 'message.removed_by_moderator', 'message', v_m.id::text,
      jsonb_build_object('conversation_id', v_m.conversation_id, 'sender_id', v_m.sender_id));
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.moderate_message(uuid, text) from public, anon;
grant execute on function public.moderate_message(uuid, text) to authenticated;

create or replace function public.delete_message(p_message uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.messages;
  v_paths text[];
begin
  select * into v_m from public.messages where id = p_message for update;
  if v_m.id is null or v_m.sender_id <> auth.uid() or not private.is_conversation_member(v_m.conversation_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_m.deleted_at is not null then
    return '{}';
  end if;
  select coalesce(array_agg(storage_path), '{}') into v_paths from public.message_attachments where message_id = v_m.id;
  delete from public.message_attachments where message_id = v_m.id;
  delete from public.message_reactions where message_id = v_m.id;
  update public.messages set deleted_at = now(), deleted_by = auth.uid(), body = '', mentions = '{}', pinned_at = null, pinned_by = null where id = v_m.id;
  return v_paths;
end;
$$;

revoke execute on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;

create or replace function public.report_message(p_message uuid, p_reason text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.messages;
  v_id uuid;
begin
  select * into v_m from public.messages where id = p_message;
  if v_m.id is null or not private.is_conversation_member(v_m.conversation_id) or v_m.sender_id = auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.message_reports (chapter_id, message_id, conversation_id, reporter_id, reported_user_id, reason, details, message_snapshot)
  values (v_m.chapter_id, v_m.id, v_m.conversation_id, auth.uid(), v_m.sender_id, p_reason, nullif(btrim(p_details), ''), v_m.body)
  on conflict (message_id, reporter_id) do update set details = excluded.details
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.report_message(uuid, text, text) from public, anon;
grant execute on function public.report_message(uuid, text, text) to authenticated;

create or replace function public.resolve_message_report(p_report uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.message_reports;
begin
  select * into v_r from public.message_reports where id = p_report for update;
  if v_r.id is null or not private.has_permission(v_r.chapter_id, 'chat.moderate') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_r.reported_user_id = auth.uid() then
    raise exception 'another moderator must review reports about you' using errcode = '42501';
  end if;
  if p_action = 'remove_message' then
    perform public.moderate_message(v_r.message_id, 'delete');
  elsif p_action = 'restrict_sender' then
    perform public.moderate_message(v_r.message_id, 'delete');
    update public.conversation_members set posting_restricted_until = now() + interval '7 days'
    where conversation_id = v_r.conversation_id and user_id = v_r.reported_user_id;
  elsif p_action <> 'dismiss' then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  update public.message_reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
      action = p_action, resolution_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = v_r.id;
  perform private.write_audit(v_r.chapter_id, 'moderation.report_resolved', 'message_report', v_r.id::text, jsonb_build_object('action', p_action));
end;
$$;

revoke execute on function public.resolve_message_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_message_report(uuid, text, text) to authenticated;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid() and removed_at is null
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.update_conversation_settings(p_conversation uuid, p_notify text, p_muted_until timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members set notify = p_notify, muted_until = p_muted_until
  where conversation_id = p_conversation and user_id = auth.uid() and removed_at is null and p_notify in ('all', 'mentions', 'none')
$$;

revoke execute on function public.update_conversation_settings(uuid, text, timestamptz) from public, anon;
grant execute on function public.update_conversation_settings(uuid, text, timestamptz) to authenticated;

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
  order by case c.kind when 'chapter_main' then 0 when 'announcement' then 1 when 'exec' then 2 else 3 end, c.last_message_at desc nulls last
$$;

revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;

create or replace function public.chapter_unread_total(p_chapter uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(unread_count), 0)::bigint from public.my_conversations(p_chapter) where coalesce(muted_until, now() - interval '1 second') < now()
$$;

revoke execute on function public.chapter_unread_total(uuid) from public, anon;
grant execute on function public.chapter_unread_total(uuid) to authenticated;

create or replace function public.member_profile(p_chapter uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_self boolean := p_user = auth.uid();
  v_officer boolean;
  v_m public.memberships;
  v_p public.profiles;
  v_d public.profile_details;
  v_vis jsonb;
  v_details jsonb := '{}'::jsonb;
  k text;
begin
  if not private.is_member(p_chapter) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_m from public.memberships where chapter_id = p_chapter and user_id = p_user;
  if v_m.id is null then
    return null;
  end if;
  v_officer := private.has_permission(p_chapter, 'members.manage');
  select * into v_p from public.profiles where id = p_user;
  select * into v_d from public.profile_details where user_id = p_user;
  v_vis := coalesce(v_d.visibility, '{}'::jsonb);
  foreach k in array array['pronouns', 'major', 'hometown', 'bio', 'interests', 'social_links', 'phone'] loop
    if v_self or coalesce(v_vis ->> k, 'chapter') = 'chapter' or (coalesce(v_vis ->> k, 'chapter') = 'officers' and v_officer) then
      v_details := v_details || jsonb_build_object(k, to_jsonb(v_d) -> k);
    end if;
  end loop;
  return jsonb_build_object(
    'user_id', v_p.id,
    'display_name', v_p.display_name,
    'full_name', v_p.full_name,
    'avatar_path', v_p.avatar_path,
    'graduation_year', v_p.graduation_year,
    'membership_id', v_m.id,
    'member_class', v_m.member_class,
    'status', v_m.status,
    'joined_at', v_m.joined_at,
    'details', v_details,
    'visibility', case when v_self then v_vis else null end,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name, 'tone', r.badge_tone, 'is_officer', r.is_officer, 'is_owner', r.is_owner, 'since', ra.starts_at) order by r.sort_order)
      from public.role_assignments ra join public.roles r on r.id = ra.role_id
      where ra.membership_id = v_m.id and ra.ends_at is null
    ), '[]'::jsonb),
    'role_history', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.name, 'started', ra.starts_at, 'ended', ra.ends_at) order by ra.starts_at desc)
      from public.role_assignments ra join public.roles r on r.id = ra.role_id
      where ra.membership_id = v_m.id and ra.ends_at is not null
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'icon', b.icon, 'category', b.category, 'awarded_at', ma.awarded_at, 'note', ma.note) order by ma.awarded_at desc)
      from public.member_achievements ma join public.achievement_badges b on b.id = ma.badge_id
      where ma.membership_id = v_m.id and ma.revoked_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.member_profile(uuid, uuid) from public, anon;
grant execute on function public.member_profile(uuid, uuid) to authenticated;

create or replace function public.chapter_directory(
  p_chapter uuid,
  p_search text,
  p_class public.member_class,
  p_role uuid,
  p_status public.membership_status,
  p_limit int,
  p_offset int
)
returns table (
  membership_id uuid, user_id uuid, display_name text, full_name text, avatar_path text, graduation_year int,
  member_class public.member_class, status public.membership_status, joined_at timestamptz, roles jsonb, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_chapter) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  with base as (
    select m.id as mid, m.user_id as uid, p.display_name as dn, p.full_name as fn, p.avatar_path as av, p.graduation_year as gy,
      m.member_class as mc, m.status as st, m.joined_at as ja
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.chapter_id = p_chapter
      and (p_status is null and m.status in ('active', 'inactive') or m.status = p_status)
      and (p_status is distinct from 'ended' or private.has_permission(p_chapter, 'members.manage'))
      and (p_class is null or m.member_class = p_class)
      and (p_role is null or exists (select 1 from public.role_assignments ra where ra.membership_id = m.id and ra.role_id = p_role and ra.ends_at is null))
      and (coalesce(btrim(p_search), '') = '' or p.full_name ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
  )
  select b.mid, b.uid, b.dn, b.fn, b.av, b.gy, b.mc, b.st, b.ja,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name, 'tone', r.badge_tone, 'is_officer', r.is_officer, 'is_owner', r.is_owner) order by r.sort_order)
      from public.role_assignments ra join public.roles r on r.id = ra.role_id
      where ra.membership_id = b.mid and ra.ends_at is null
    ), '[]'::jsonb),
    count(*) over ()
  from base b
  order by (select min(r.sort_order) from public.role_assignments ra join public.roles r on r.id = ra.role_id where ra.membership_id = b.mid and ra.ends_at is null and r.is_officer) nulls last,
    b.fn, b.dn
  limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.chapter_directory(uuid, text, public.member_class, uuid, public.membership_status, int, int) from public, anon;
grant execute on function public.chapter_directory(uuid, text, public.member_class, uuid, public.membership_status, int, int) to authenticated;

create or replace function private.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  r record;
begin
  select slug into v_slug from public.chapters where id = new.chapter_id;
  for r in
    select m.user_id from public.memberships m
    where m.chapter_id = new.chapter_id and m.status = 'active' and m.user_id <> new.author_id
      and (new.audience = 'all' or private.user_has_permission(m.user_id, new.chapter_id, 'announcements.officers'))
  loop
    perform private.notify(r.user_id, new.chapter_id, 'announcement', new.title, left(new.body, 160),
      '/c/' || v_slug || '/announcements#' || new.id::text, 'announcement:' || new.id::text);
  end loop;
  return new;
end;
$$;

create trigger announcements_notify after insert on public.announcements
  for each row execute function private.notify_announcement();

create or replace function private.guard_announcement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() then
    if tg_op = 'INSERT' then
      new.author_id := auth.uid();
      new.published_at := now();
      if new.audience = 'officers' and not private.has_permission(new.chapter_id, 'announcements.officers') then
        raise exception 'not authorized for officer announcements' using errcode = '42501';
      end if;
    elsif new.chapter_id is distinct from old.chapter_id or new.author_id is distinct from old.author_id or new.published_at is distinct from old.published_at then
      raise exception 'protected announcement fields' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger announcements_guard before insert or update on public.announcements
  for each row execute function private.guard_announcement();

alter table public.achievement_badges enable row level security;
alter table public.member_achievements enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_acks enable row level security;

create policy badges_read on public.achievement_badges for select to authenticated using (private.is_member(chapter_id));
create policy badges_write on public.achievement_badges for all to authenticated
  using (private.has_permission(chapter_id, 'members.manage')) with check (private.has_permission(chapter_id, 'members.manage'));

create policy achievements_read on public.member_achievements for select to authenticated using (private.is_member(chapter_id));
create policy achievements_insert on public.member_achievements for insert to authenticated
  with check (
    private.has_permission(chapter_id, 'members.manage') and awarded_by = auth.uid()
    and not exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid())
  );
create policy achievements_revoke on public.member_achievements for update to authenticated
  using (private.has_permission(chapter_id, 'members.manage')) with check (private.has_permission(chapter_id, 'members.manage'));

create policy conversations_read on public.conversations for select to authenticated
  using (private.is_conversation_member(id) or (visibility = 'open' and kind not in ('direct', 'group') and private.is_member(chapter_id)));
create policy conversations_update on public.conversations for update to authenticated
  using (kind not in ('direct') and (private.is_conversation_moderator(id) or private.has_permission(chapter_id, 'chat.manage')))
  with check (kind not in ('direct') and (private.is_conversation_moderator(id) or private.has_permission(chapter_id, 'chat.manage')));

create or replace function private.guard_conversation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() and (
    new.kind is distinct from old.kind or new.chapter_id is distinct from old.chapter_id or new.dm_key is distinct from old.dm_key
    or new.auto_membership is distinct from old.auto_membership or new.created_by is distinct from old.created_by
    or new.last_message_at is distinct from old.last_message_at
  ) then
    raise exception 'protected conversation fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger conversations_guard before update on public.conversations
  for each row execute function private.guard_conversation_update();

create policy conversation_members_read on public.conversation_members for select to authenticated
  using (private.is_conversation_member(conversation_id));

create policy messages_read on public.messages for select to authenticated
  using (private.is_conversation_member(conversation_id));
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = auth.uid() and private.is_conversation_member(conversation_id))
  with check (sender_id = auth.uid());

create policy reactions_read on public.message_reactions for select to authenticated
  using (private.is_conversation_member(conversation_id));
create policy reactions_insert on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid() and private.is_conversation_member(conversation_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.conversation_id = message_reactions.conversation_id and m.deleted_at is null)
  );
create policy reactions_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid());

create policy attachments_read on public.message_attachments for select to authenticated
  using (private.is_conversation_member(conversation_id));

create policy reports_read on public.message_reports for select to authenticated
  using (reporter_id = auth.uid() or (private.has_permission(chapter_id, 'chat.moderate') and reported_user_id <> auth.uid()));

create policy blocks_own_read on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_own_insert on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_own_delete on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

create policy announcements_read on public.announcements for select to authenticated
  using (private.is_member(chapter_id) and (audience = 'all' or author_id = auth.uid() or private.has_permission(chapter_id, 'announcements.officers')));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (private.has_permission(chapter_id, 'announcements.publish'));
create policy announcements_update on public.announcements for update to authenticated
  using (private.has_permission(chapter_id, 'announcements.publish')) with check (private.has_permission(chapter_id, 'announcements.publish'));

create policy acks_read on public.announcement_acks for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.announcements a where a.id = announcement_id and private.has_permission(a.chapter_id, 'announcements.publish')));
create policy acks_insert on public.announcement_acks for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.announcements a where a.id = announcement_id and private.is_member(a.chapter_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-attachments', 'chat-attachments', false, 15728640, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy chat_attachments_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[2] and c.chapter_id::text = (storage.foldername(name))[1]
        and private.is_conversation_member(c.id)
    )
  );

create policy chat_attachments_read on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.message_attachments a
      where a.storage_path = name and private.is_conversation_member(a.conversation_id)
    )
  );

create policy chat_attachments_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and owner_id = auth.uid()::text);

create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.message_reactions, public.notifications;
  end if;
end;
$$;
