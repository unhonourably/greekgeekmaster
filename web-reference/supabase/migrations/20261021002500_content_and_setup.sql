create or replace function private.valid_image_paths(p_paths text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_paths) <= 6
    and not exists (
      select 1
      from unnest(p_paths) as path
      where path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$'
    )
$$;

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'events' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%description%';
  if cname is not null then
    execute format('alter table public.events drop constraint %I', cname);
  end if;
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'announcements' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%body%';
  if cname is not null then
    execute format('alter table public.announcements drop constraint %I', cname);
  end if;
end $$;

alter table public.events
  add constraint events_description_check check (description is null or char_length(description) <= 20000);

alter table public.events
  add column image_paths text[] not null default '{}',
  add constraint events_image_paths_check check (private.valid_image_paths(image_paths));

alter table public.announcements
  add constraint announcements_body_check check (char_length(body) between 1 and 20000);

alter table public.announcements
  add column comments_enabled boolean not null default true,
  add column image_paths text[] not null default '{}',
  add constraint announcements_image_paths_check check (private.valid_image_paths(image_paths));

alter table public.chapters
  add column setup_skipped text[] not null default '{}',
  add constraint chapters_setup_skipped_check check (
    setup_skipped <@ array['housing', 'events', 'recruitment', 'philanthropy', 'academics', 'standards']::text[]
  );

create table public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id),
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index announcement_comments_announcement_idx on public.announcement_comments (announcement_id, created_at);

create or replace function private.guard_announcement_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.announcements;
begin
  select * into parent from public.announcements where id = new.announcement_id;
  if parent.id is null or parent.chapter_id <> new.chapter_id then
    raise exception 'announcement not found' using errcode = 'P0001';
  end if;
  if private.is_api_role() then
    if parent.archived_at is not null or not parent.comments_enabled then
      raise exception 'comments are turned off' using errcode = 'P0001';
    end if;
    if new.author_id is distinct from auth.uid() then
      raise exception 'not authorized' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger announcement_comments_guard
  before insert on public.announcement_comments
  for each row execute function private.guard_announcement_comment();

create or replace function private.guard_announcement_comment_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role()
    and old.author_id is distinct from auth.uid()
    and not private.has_permission(old.chapter_id, 'announcements.officers') then
    raise exception 'not authorized' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger announcement_comments_delete_guard
  before delete on public.announcement_comments
  for each row execute function private.guard_announcement_comment_delete();

create or replace function private.guard_announcement_comments_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role()
    and new.comments_enabled is distinct from old.comments_enabled
    and old.author_id is distinct from auth.uid() then
    raise exception 'only the author can change comments' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger announcements_comments_flag
  before update on public.announcements
  for each row execute function private.guard_announcement_comments_flag();

create or replace function private.can_read_announcement(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.announcements a
    where a.id = p_announcement
      and private.is_member(a.chapter_id)
      and (a.audience = 'all' or a.author_id = auth.uid() or private.has_permission(a.chapter_id, 'announcements.officers'))
  )
$$;

grant execute on function private.can_read_announcement(uuid) to authenticated;

alter table public.announcement_comments enable row level security;

create policy announcement_comments_read on public.announcement_comments for select to authenticated
  using (private.can_read_announcement(announcement_id));

create policy announcement_comments_insert on public.announcement_comments for insert to authenticated
  with check (author_id = auth.uid());

create policy announcement_comments_delete on public.announcement_comments for delete to authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chapter-media', 'chapter-media', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy chapter_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'chapter-media'
    and private.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy chapter_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chapter-media'
    and (
      private.has_permission(((storage.foldername(name))[1])::uuid, 'events.manage')
      or private.has_permission(((storage.foldername(name))[1])::uuid, 'announcements.publish')
    )
  );
