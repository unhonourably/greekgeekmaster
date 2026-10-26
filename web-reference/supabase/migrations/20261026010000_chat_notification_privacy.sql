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
  select coalesce(nullif(display_name, ''), full_name, 'Someone') into v_sender from public.profiles where id = new.sender_id;
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
        perform private.notify(
          r.user_id,
          new.chapter_id,
          'chat_mention',
          v_sender || ' mentioned you',
          null,
          '/c/' || v_slug || '/chat/' || v_c.id::text,
          'mention:' || new.id::text
        );
      end if;
    elsif r.notify = 'all' then
      perform private.notify(
        r.user_id,
        new.chapter_id,
        'chat_message',
        v_sender || ' sent a message',
        null,
        '/c/' || v_slug || '/chat/' || v_c.id::text,
        'conv:' || v_c.id::text || ':' || to_char(date_trunc('hour', new.created_at), 'YYYYMMDDHH24')
      );
    end if;
  end loop;
  return new;
end;
$$;

update public.notifications
set body = null
where kind in ('chat_message', 'chat_mention')
  and body is not null;
