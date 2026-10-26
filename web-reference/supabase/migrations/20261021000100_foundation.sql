create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create type public.member_class as enum ('new_member', 'active', 'associate', 'alumni');
create type public.membership_status as enum ('active', 'inactive', 'suspended', 'ended');
create type public.chapter_status as enum ('unclaimed', 'verified', 'suspended', 'closed');
create type public.platform_staff_role as enum ('admin', 'reviewer', 'support', 'finance');

create or replace function private.normalize_name(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(coalesce(p_value, ''));
  pairs text[][] := array[
    ['α','alpha'],['β','beta'],['γ','gamma'],['δ','delta'],['ε','epsilon'],['ζ','zeta'],
    ['η','eta'],['θ','theta'],['ι','iota'],['κ','kappa'],['λ','lambda'],['μ','mu'],
    ['ν','nu'],['ξ','xi'],['ο','omicron'],['π','pi'],['ρ','rho'],['σ','sigma'],['ς','sigma'],
    ['τ','tau'],['υ','upsilon'],['φ','phi'],['χ','chi'],['ψ','psi'],['ω','omega']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    v := replace(v, pairs[i][1], ' ' || pairs[i][2] || ' ');
  end loop;
  v := regexp_replace(v, '&', ' and ', 'g');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := regexp_replace(v, '\m(the|chapter|of|at|fraternity|sorority|inc|incorporated|colony)\M', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  return btrim(v);
end;
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.is_api_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon')
$$;

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  short_name text check (char_length(short_name) <= 40),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  email_domains text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.national_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  normalized_name text not null unique,
  greek_letters text,
  kind text not null default 'fraternity' check (kind in ('fraternity', 'sorority', 'coed', 'professional', 'service', 'other')),
  council text,
  website text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_path text,
  graduation_year int check (graduation_year between 1950 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.profile_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pronouns text check (char_length(pronouns) <= 40),
  major text check (char_length(major) <= 120),
  hometown text check (char_length(hometown) <= 120),
  bio text check (char_length(bio) <= 1000),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  phone text check (phone is null or phone ~ '^[0-9+() .-]{7,24}$'),
  visibility jsonb not null default '{"pronouns":"chapter","major":"chapter","hometown":"chapter","bio":"chapter","interests":"chapter","social_links":"chapter","phone":"officers"}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger profile_details_touch before update on public.profile_details
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (id) do nothing;
  insert into public.profile_details (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.platform_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.platform_staff_role not null,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id),
  organization_id uuid references public.national_organizations (id),
  organization_name text not null check (char_length(organization_name) between 2 and 120),
  designation text check (char_length(designation) <= 120),
  greek_letters text check (char_length(greek_letters) <= 24),
  normalized_key text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  status public.chapter_status not null default 'unclaimed',
  verified_at timestamptz,
  verification_method text,
  suspended_reason text,
  pricing_rule_id uuid,
  timezone text not null default 'America/New_York',
  currency char(3) not null default 'usd' check (currency = lower(currency)),
  description text check (char_length(description) <= 2000),
  founded_year int check (founded_year between 1776 and 2100),
  modules jsonb not null default '{"recruitment":true,"philanthropy":true,"housing":false,"standards":true,"academics":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index chapters_identity_unique on public.chapters (university_id, normalized_key) where status <> 'closed';
create index chapters_university_idx on public.chapters (university_id);

create or replace function private.chapters_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_key := private.normalize_name(new.organization_name || ' ' || coalesce(new.designation, ''));
  if tg_op = 'UPDATE' and private.is_api_role() then
    if new.status is distinct from old.status
      or new.verified_at is distinct from old.verified_at
      or new.verification_method is distinct from old.verification_method
      or new.pricing_rule_id is distinct from old.pricing_rule_id
      or new.slug is distinct from old.slug
      or new.university_id is distinct from old.university_id
      or new.organization_name is distinct from old.organization_name
      or new.designation is distinct from old.designation
      or new.suspended_reason is distinct from old.suspended_reason
      or new.currency is distinct from old.currency then
      raise exception 'protected chapter fields cannot be changed directly' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger chapters_before_write before insert or update on public.chapters
  for each row execute function private.chapters_before_write();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  user_id uuid not null references public.profiles (id),
  member_class public.member_class not null default 'active',
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (chapter_id, user_id),
  unique (chapter_id, id)
);

create index memberships_user_idx on public.memberships (user_id) where status = 'active';

create table public.membership_history (
  id bigint generated always as identity primary key,
  membership_id uuid not null references public.memberships (id),
  chapter_id uuid not null references public.chapters (id),
  from_class public.member_class,
  to_class public.member_class,
  from_status public.membership_status,
  to_status public.membership_status,
  changed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index membership_history_membership_idx on public.membership_history (membership_id, created_at desc);

create or replace function private.record_membership_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.membership_history (membership_id, chapter_id, to_class, to_status, changed_by, reason)
    values (new.id, new.chapter_id, new.member_class, new.status, auth.uid(), 'joined');
  elsif new.member_class is distinct from old.member_class or new.status is distinct from old.status then
    insert into public.membership_history (membership_id, chapter_id, from_class, to_class, from_status, to_status, changed_by, reason)
    values (new.id, new.chapter_id, old.member_class, new.member_class, old.status, new.status, auth.uid(), new.end_reason);
  end if;
  return new;
end;
$$;

create trigger memberships_history after insert or update on public.memberships
  for each row execute function private.record_membership_history();

create table public.permissions (
  key text primary key check (key ~ '^[a-z]+\.[a-z_]+$'),
  category text not null,
  description text not null,
  sensitive boolean not null default false
);

create table public.role_templates (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  name text not null,
  description text not null,
  is_officer boolean not null default true,
  is_owner boolean not null default false,
  badge_tone text not null default 'neutral',
  sort_order int not null default 100,
  permission_keys text[] not null default '{}'
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  kind text not null default 'custom' check (kind in ('system', 'custom')),
  is_officer boolean not null default true,
  is_owner boolean not null default false,
  badge_tone text not null default 'neutral' check (badge_tone in ('neutral', 'accent', 'gold', 'slate', 'green', 'rose')),
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique (chapter_id, key),
  unique (chapter_id, id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key),
  primary key (role_id, permission_key)
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by uuid references public.profiles (id),
  ended_by uuid references public.profiles (id),
  end_reason text,
  created_at timestamptz not null default now(),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id),
  foreign key (chapter_id, role_id) references public.roles (chapter_id, id),
  check (ends_at is null or ends_at >= starts_at)
);

create unique index role_assignments_active_unique on public.role_assignments (membership_id, role_id) where ends_at is null;
create index role_assignments_chapter_idx on public.role_assignments (chapter_id) where ends_at is null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  chapter_id uuid references public.chapters (id),
  actor_id uuid,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'platform_staff', 'system', 'stripe')),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_chapter_idx on public.audit_logs (chapter_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

create or replace function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.prevent_mutation();
create trigger membership_history_append_only before update or delete on public.membership_history
  for each row execute function private.prevent_mutation();

create or replace function private.active_membership_id(p_chapter uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.memberships m
  join public.chapters c on c.id = m.chapter_id and c.status in ('verified', 'suspended')
  where m.chapter_id = p_chapter and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function private.is_member(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.active_membership_id(p_chapter) is not null
$$;

create or replace function private.has_permission(p_chapter uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.chapters c on c.id = m.chapter_id and c.status = 'verified'
    join public.role_assignments ra on ra.membership_id = m.id
      and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
    join public.role_permissions rp on rp.role_id = ra.role_id
    where m.chapter_id = p_chapter
      and m.user_id = auth.uid()
      and m.status = 'active'
      and rp.permission_key = p_permission
  )
$$;

create or replace function private.user_has_permission(p_user uuid, p_chapter uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.chapters c on c.id = m.chapter_id and c.status = 'verified'
    join public.role_assignments ra on ra.membership_id = m.id
      and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
    join public.role_permissions rp on rp.role_id = ra.role_id
    where m.chapter_id = p_chapter
      and m.user_id = p_user
      and m.status = 'active'
      and rp.permission_key = p_permission
  )
$$;

create or replace function private.is_platform_staff(p_roles public.platform_staff_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid()
      and s.revoked_at is null
      and (p_roles is null or s.role = 'admin' or s.role = any (p_roles))
  )
$$;

create or replace function private.shares_chapter(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.chapter_id = mine.chapter_id
    join public.chapters c on c.id = mine.chapter_id and c.status in ('verified', 'suspended')
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = p_user and theirs.status in ('active', 'inactive')
  )
$$;

create or replace function private.write_audit(
  p_chapter uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := 'user';
begin
  if auth.uid() is null then
    v_kind := 'system';
  elsif private.is_platform_staff() then
    v_kind := 'platform_staff';
  end if;
  insert into public.audit_logs (chapter_id, actor_id, actor_kind, action, target_type, target_id, metadata)
  values (p_chapter, auth.uid(), v_kind, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke execute on function private.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function private.user_has_permission(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.guard_membership_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() then
    raise exception 'memberships are changed through update_membership' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger memberships_guard before insert or update or delete on public.memberships
  for each row execute function private.guard_membership_update();

create or replace function private.guard_role_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target_user uuid;
  v_is_owner boolean;
  v_remaining_owners int;
begin
  if not private.is_api_role() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'role assignments are ended, not deleted' using errcode = '42501';
  end if;
  select m.user_id into v_target_user from public.memberships m where m.id = new.membership_id;
  select r.is_owner into v_is_owner from public.roles r where r.id = new.role_id;
  if tg_op = 'INSERT' then
    if v_target_user = auth.uid() then
      raise exception 'you cannot change your own roles' using errcode = '42501';
    end if;
    if new.ends_at is not null then
      raise exception 'new assignments must be open-ended' using errcode = '22023';
    end if;
    if v_is_owner and not private.has_permission(new.chapter_id, 'chapter.ownership') then
      raise exception 'only chapter administrators can grant administrator roles' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.role_permissions rp
      where rp.role_id = new.role_id and not private.has_permission(new.chapter_id, rp.permission_key)
    ) then
      raise exception 'you cannot grant permissions you do not hold' using errcode = '42501';
    end if;
    new.assigned_by := auth.uid();
    new.starts_at := now();
    return new;
  end if;
  if new.membership_id is distinct from old.membership_id
    or new.role_id is distinct from old.role_id
    or new.chapter_id is distinct from old.chapter_id
    or new.starts_at is distinct from old.starts_at
    or new.assigned_by is distinct from old.assigned_by then
    raise exception 'only the end of an assignment can be changed' using errcode = '42501';
  end if;
  if old.ends_at is not null then
    raise exception 'assignment already ended' using errcode = '22023';
  end if;
  if v_is_owner and v_target_user <> auth.uid() and not private.has_permission(new.chapter_id, 'chapter.ownership') then
    raise exception 'only chapter administrators can remove administrator roles' using errcode = '42501';
  end if;
  if v_is_owner and new.ends_at is not null then
    select count(*) into v_remaining_owners
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id and r.is_owner
    join public.memberships m on m.id = ra.membership_id and m.status = 'active'
    where ra.chapter_id = new.chapter_id and ra.ends_at is null and ra.id <> new.id;
    if v_remaining_owners = 0 then
      raise exception 'a chapter must keep at least one administrator' using errcode = '22023';
    end if;
  end if;
  new.ended_by := auth.uid();
  return new;
end;
$$;

create trigger role_assignments_guard before insert or update or delete on public.role_assignments
  for each row execute function private.guard_role_assignment();

create or replace function private.guard_role_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  if not private.is_api_role() then
    return coalesce(new, old);
  end if;
  select * into v_role from public.roles where id = coalesce(new.role_id, old.role_id);
  if v_role.is_owner then
    raise exception 'administrator role permissions are fixed' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not private.has_permission(v_role.chapter_id, new.permission_key) then
    raise exception 'you cannot grant permissions you do not hold' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'role permissions are added or removed, not updated' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function private.guard_role_permissions();

create or replace function private.guard_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.kind := 'custom';
    new.is_owner := false;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.kind = 'system' then
      raise exception 'system roles cannot be deleted' using errcode = '42501';
    end if;
    if exists (select 1 from public.role_assignments where role_id = old.id) then
      raise exception 'roles with assignment history cannot be deleted' using errcode = '22023';
    end if;
    return old;
  end if;
  if new.kind is distinct from old.kind or new.is_owner is distinct from old.is_owner
    or new.key is distinct from old.key or new.chapter_id is distinct from old.chapter_id then
    raise exception 'protected role fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function private.guard_roles();

alter table public.universities enable row level security;
alter table public.national_organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_details enable row level security;
alter table public.platform_staff enable row level security;
alter table public.chapters enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_history enable row level security;
alter table public.permissions enable row level security;
alter table public.role_templates enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignments enable row level security;
alter table public.audit_logs enable row level security;

create policy universities_read on public.universities for select to anon, authenticated using (true);
create policy universities_staff_write on public.universities for all to authenticated
  using (private.is_platform_staff(array['reviewer']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['reviewer']::public.platform_staff_role[]));

create policy national_orgs_read on public.national_organizations for select to anon, authenticated using (true);
create policy national_orgs_staff_write on public.national_organizations for all to authenticated
  using (private.is_platform_staff(array['reviewer']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['reviewer']::public.platform_staff_role[]));

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_chapter(id) or private.is_platform_staff(array['support','reviewer']::public.platform_staff_role[]));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy profile_details_self on public.profile_details for select to authenticated using (user_id = auth.uid());
create policy profile_details_update_self on public.profile_details for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy platform_staff_read on public.platform_staff for select to authenticated
  using (user_id = auth.uid() or private.is_platform_staff(array['admin']::public.platform_staff_role[]));

create policy chapters_read on public.chapters for select to authenticated
  using (status in ('verified', 'unclaimed') or private.is_member(id) or private.is_platform_staff());
create policy chapters_update on public.chapters for update to authenticated
  using (private.has_permission(id, 'chapter.manage'))
  with check (private.has_permission(id, 'chapter.manage'));

create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or private.is_member(chapter_id));

create policy membership_history_read on public.membership_history for select to authenticated
  using (private.has_permission(chapter_id, 'members.manage') or exists (
    select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()
  ));

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_templates_read on public.role_templates for select to authenticated using (true);

create policy roles_read on public.roles for select to authenticated using (private.is_member(chapter_id));
create policy roles_insert on public.roles for insert to authenticated with check (private.has_permission(chapter_id, 'roles.manage'));
create policy roles_update on public.roles for update to authenticated
  using (private.has_permission(chapter_id, 'roles.manage')) with check (private.has_permission(chapter_id, 'roles.manage'));
create policy roles_delete on public.roles for delete to authenticated using (private.has_permission(chapter_id, 'roles.manage'));

create policy role_permissions_read on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and private.is_member(r.chapter_id)));
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (exists (select 1 from public.roles r where r.id = role_id and private.has_permission(r.chapter_id, 'roles.manage')));
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and private.has_permission(r.chapter_id, 'roles.manage')));

create policy role_assignments_read on public.role_assignments for select to authenticated using (private.is_member(chapter_id));
create policy role_assignments_insert on public.role_assignments for insert to authenticated
  with check (private.has_permission(chapter_id, 'roles.manage'));
create policy role_assignments_update on public.role_assignments for update to authenticated
  using (private.has_permission(chapter_id, 'roles.manage') or exists (
    select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()
  ))
  with check (private.has_permission(chapter_id, 'roles.manage') or exists (
    select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()
  ));

create policy audit_logs_read on public.audit_logs for select to authenticated
  using (
    (chapter_id is not null and private.has_permission(chapter_id, 'audit.view'))
    or private.is_platform_staff(array['admin']::public.platform_staff_role[])
  );

create or replace function public.my_permissions(p_chapter uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission_key order by rp.permission_key), '{}')
  from public.memberships m
  join public.chapters c on c.id = m.chapter_id and c.status = 'verified'
  join public.role_assignments ra on ra.membership_id = m.id
    and ra.starts_at <= now() and (ra.ends_at is null or ra.ends_at > now())
  join public.role_permissions rp on rp.role_id = ra.role_id
  where m.chapter_id = p_chapter and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.my_staff_role()
returns public.platform_staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.platform_staff where user_id = auth.uid() and revoked_at is null
$$;

create or replace function private.provision_chapter_roles(p_chapter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.roles (chapter_id, key, name, description, kind, is_officer, is_owner, badge_tone, sort_order)
  select p_chapter, t.key, t.name, t.description, 'system', t.is_officer, t.is_owner, t.badge_tone, t.sort_order
  from public.role_templates t
  on conflict (chapter_id, key) do nothing;
  insert into public.role_permissions (role_id, permission_key)
  select r.id, unnest(t.permission_keys)
  from public.roles r
  join public.role_templates t on t.key = r.key
  where r.chapter_id = p_chapter and r.kind = 'system'
  on conflict do nothing;
end;
$$;

revoke execute on function private.provision_chapter_roles(uuid) from public, anon, authenticated;

create or replace function private.grant_role(p_membership uuid, p_role_key text, p_granted_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter uuid;
  v_role uuid;
begin
  select chapter_id into v_chapter from public.memberships where id = p_membership;
  select id into v_role from public.roles where chapter_id = v_chapter and key = p_role_key;
  if v_role is null then
    raise exception 'unknown role %', p_role_key using errcode = '22023';
  end if;
  insert into public.role_assignments (chapter_id, membership_id, role_id, assigned_by)
  values (v_chapter, p_membership, v_role, p_granted_by)
  on conflict (membership_id, role_id) where ends_at is null do nothing;
end;
$$;

revoke execute on function private.grant_role(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.update_membership(
  p_membership uuid,
  p_member_class public.member_class,
  p_status public.membership_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null or not private.has_permission(v_m.chapter_id, 'members.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_m.user_id = auth.uid() then
    raise exception 'you cannot change your own membership' using errcode = '42501';
  end if;
  if v_m.status = 'ended' then
    raise exception 'ended memberships cannot be changed' using errcode = '22023';
  end if;
  if p_status = 'ended' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required to end a membership' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id and r.is_owner
    where ra.membership_id = v_m.id and ra.ends_at is null
  ) and p_status <> 'active' and not private.has_permission(v_m.chapter_id, 'chapter.ownership') then
    raise exception 'only administrators can deactivate another administrator' using errcode = '42501';
  end if;
  update public.memberships
  set member_class = p_member_class,
      status = p_status,
      ended_at = case when p_status = 'ended' then now() else null end,
      end_reason = nullif(btrim(p_reason), '')
  where id = v_m.id;
  if p_status in ('ended', 'suspended') then
    update public.role_assignments
    set ends_at = now(), ended_by = auth.uid(), end_reason = 'membership ' || p_status::text
    where membership_id = v_m.id and ends_at is null;
  end if;
  perform private.write_audit(v_m.chapter_id, 'membership.updated', 'membership', v_m.id::text,
    jsonb_build_object('from_class', v_m.member_class, 'to_class', p_member_class, 'from_status', v_m.status, 'to_status', p_status, 'reason', p_reason));
end;
$$;

revoke execute on function public.update_membership(uuid, public.member_class, public.membership_status, text) from public, anon;
grant execute on function public.update_membership(uuid, public.member_class, public.membership_status, text) to authenticated;
