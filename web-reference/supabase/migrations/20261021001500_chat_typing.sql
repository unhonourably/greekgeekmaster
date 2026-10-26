create or replace function private.can_use_typing_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_conversation_member(substr(p_topic, 8)::uuid);
end;
$$;

revoke execute on function private.can_use_typing_topic(text) from public, anon;
grant execute on function private.can_use_typing_topic(text) to authenticated;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists chat_typing_receive on realtime.messages';
    execute 'drop policy if exists chat_typing_send on realtime.messages';
    execute $p$
      create policy chat_typing_receive on realtime.messages for select to authenticated
      using (realtime.messages.extension = 'broadcast' and private.can_use_typing_topic((select realtime.topic())))
    $p$;
    execute $p$
      create policy chat_typing_send on realtime.messages for insert to authenticated
      with check (realtime.messages.extension = 'broadcast' and private.can_use_typing_topic((select realtime.topic())))
    $p$;
  end if;
end;
$$;
