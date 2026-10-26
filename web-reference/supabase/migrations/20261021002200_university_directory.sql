alter table public.universities
  add column if not exists ipeds_unitid int unique,
  add column if not exists aliases text check (char_length(aliases) <= 400),
  add column if not exists source text not null default 'manual' check (source in ('ipeds', 'directory', 'manual')),
  add column if not exists domains_checked_at timestamptz;

update public.universities set source = 'directory' where source = 'manual' and cardinality(email_domains) > 0;

alter table public.universities
  add column if not exists search_text text generated always as (
    btrim(regexp_replace(lower(name || ' ' || coalesce(short_name, '') || ' ' || coalesce(aliases, '')), '[^a-z0-9]+', ' ', 'g'))
  ) stored;

create index if not exists universities_domains_idx on public.universities using gin (email_domains);

create or replace function private.merge_university_seed()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_removed int;
  v_inserted int;
begin
  delete from public.universities u
  where u.ipeds_unitid is null and u.source = 'directory'
    and not exists (select 1 from public.chapters c where c.university_id = u.id)
    and not exists (select 1 from public.chapter_applications a where a.university_id = u.id);
  get diagnostics v_removed = row_count;

  update public.universities u
  set name = s.name, short_name = coalesce(u.short_name, s.short_name), city = s.city, state = s.state,
      email_domains = s.email_domains, aliases = s.aliases, source = 'ipeds', domains_checked_at = s.checked_at
  from pg_temp.seed_universities s
  where u.ipeds_unitid = s.unitid;

  update public.universities u
  set ipeds_unitid = s.unitid, name = s.name, short_name = coalesce(u.short_name, s.short_name), city = s.city, state = s.state,
      email_domains = s.email_domains, aliases = s.aliases, source = 'ipeds', domains_checked_at = s.checked_at
  from pg_temp.seed_universities s
  where u.ipeds_unitid is null and u.slug = s.slug
    and not exists (select 1 from public.universities x where x.ipeds_unitid = s.unitid);

  update public.universities u
  set ipeds_unitid = m.unitid, name = m.name, short_name = coalesce(u.short_name, m.short_name), city = m.city, state = m.state,
      email_domains = m.email_domains, aliases = m.aliases, source = 'ipeds', domains_checked_at = m.checked_at
  from (
    select distinct on (u2.id) u2.id as university_id, s.*
    from public.universities u2
    join pg_temp.seed_universities s on s.email_domains && u2.email_domains
    where u2.ipeds_unitid is null
      and (select count(*) from pg_temp.seed_universities s2 where s2.email_domains && u2.email_domains) = 1
    order by u2.id
  ) m
  where u.id = m.university_id
    and not exists (select 1 from public.universities x where x.ipeds_unitid = m.unitid);

  insert into public.universities (name, slug, short_name, city, state, email_domains, aliases, ipeds_unitid, source, domains_checked_at)
  select s.name,
    case when exists (select 1 from public.universities x where x.slug = s.slug) then left(s.slug, 70) || '-' || s.unitid else s.slug end,
    s.short_name, s.city, s.state, s.email_domains, s.aliases, s.unitid, 'ipeds', s.checked_at
  from pg_temp.seed_universities s
  where not exists (select 1 from public.universities x where x.ipeds_unitid = s.unitid)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('removed', v_removed, 'inserted', v_inserted);
end;
$$;

revoke execute on function private.merge_university_seed() from public, anon, authenticated;

create or replace function public.search_universities(p_query text, p_limit int default 12)
returns table (id uuid, name text, city text, state text, email_domains text[])
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      btrim(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]+', ' ', 'g')) as norm,
      regexp_replace(lower(btrim(coalesce(p_query, ''))), '[^a-z0-9.-]+', '', 'g') as dom
  ),
  t as (
    select norm, dom,
      array(select w from unnest(string_to_array(norm, ' ')) w where w <> '' and w not in ('of', 'the', 'at', 'and', 'in', 'for')) as toks
    from q
  )
  select u.id, u.name, u.city, u.state, u.email_domains
  from public.universities u, t
  where char_length(t.norm) >= 2
    and (
      (cardinality(t.toks) > 0 and not exists (select 1 from unnest(t.toks) w where position(w in u.search_text) = 0))
      or (char_length(t.dom) >= 2 and exists (
        select 1 from unnest(u.email_domains) d where d = t.dom or split_part(d, '.', 1) = t.dom or d like t.dom || '.%'
      ))
    )
  order by
    (case when btrim(regexp_replace(lower(u.name), '[^a-z0-9]+', ' ', 'g')) = t.norm then 100 else 0 end)
    + (case when ' ' || regexp_replace(lower(coalesce(u.short_name, '') || ' ' || coalesce(u.aliases, '')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% ' || t.norm || ' %' then 80 else 0 end)
    + (case when exists (select 1 from unnest(u.email_domains) d where d = t.dom or split_part(d, '.', 1) = t.dom) then 70 else 0 end)
    + (case when u.search_text like t.norm || '%' or u.search_text like 'the ' || t.norm || '%' then 40 else 0 end)
    + (case when ' ' || u.search_text like '% ' || coalesce(t.toks[1], t.norm) || '%' then 15 else 0 end)
    + (case when u.source = 'ipeds' then 5 else 0 end)
    - char_length(u.name) / 100.0 desc,
    u.name
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
$$;

revoke execute on function public.search_universities(text, int) from public;
grant execute on function public.search_universities(text, int) to anon, authenticated;
