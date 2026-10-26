create or replace function private.guard_message_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.archived_at is not null) then
    raise exception 'this conversation is archived' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger messages_guard_insert before insert on public.messages
  for each row execute function private.guard_message_insert();

create or replace function private.guard_conversation_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() and new.archived_at is distinct from old.archived_at and old.kind in ('chapter_main', 'announcement', 'exec', 'direct') then
    raise exception 'this conversation cannot be archived' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger conversations_guard_archive before update of archived_at on public.conversations
  for each row execute function private.guard_conversation_archive();
