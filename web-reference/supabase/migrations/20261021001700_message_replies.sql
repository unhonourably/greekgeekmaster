alter table public.messages add column reply_to_id uuid references public.messages (id);

create index messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;

create or replace function private.guard_message_reply_to()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() and new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'only the message text can be edited' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_guard_reply_to before update on public.messages
  for each row execute function private.guard_message_reply_to();

drop function public.send_message(uuid, text, uuid, uuid[], uuid[], boolean, jsonb);

create function public.send_message(
  p_conversation uuid,
  p_body text,
  p_parent uuid,
  p_mentions uuid[],
  p_mention_roles uuid[],
  p_mention_all boolean,
  p_attachments jsonb,
  p_reply_to uuid default null
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
  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and conversation_id = v_c.id and parent_id is not distinct from p_parent and deleted_at is null
  ) then
    raise exception 'the message you are replying to is not available' using errcode = '22023';
  end if;
  if coalesce(p_mention_all, false) and not private.is_conversation_moderator(v_c.id) then
    raise exception 'only moderators can notify everyone' using errcode = '42501';
  end if;
  insert into public.messages (conversation_id, chapter_id, sender_id, parent_id, reply_to_id, body, mentions, mention_role_ids, mention_all)
  values (
    v_c.id, v_c.chapter_id, auth.uid(), p_parent, p_reply_to, coalesce(btrim(p_body), ''),
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

revoke execute on function public.send_message(uuid, text, uuid, uuid[], uuid[], boolean, jsonb, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid[], uuid[], boolean, jsonb, uuid) to authenticated;
