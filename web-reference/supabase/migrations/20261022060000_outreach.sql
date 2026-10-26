drop table if exists
  public.marketing_events,
  public.marketing_notes,
  public.marketing_spend,
  public.marketing_suppressions,
  public.marketing_jobs,
  public.marketing_messages,
  public.marketing_prospects,
  public.marketing_campaigns,
  public.marketing_settings
cascade;

drop function if exists public.claim_marketing_sends(int);
drop function if exists public.ingest_marketing_reply(text, text, text, text, text, text);
drop function if exists public.record_marketing_provider_event(text, text, text, timestamptz);
drop function if exists public.marketing_metrics(timestamptz, timestamptz);
drop function if exists private.marketing_stage_rank(text);
drop function if exists private.advance_marketing_stage(uuid, text);
drop function if exists private.marketing_message_guard();
drop function if exists private.marketing_message_effects();
drop function if exists private.marketing_prospect_effects();
drop function if exists private.audit_marketing_message();
drop function if exists private.audit_marketing_settings();

update public.notification_kinds
set label = 'Outreach replies', description = 'A college contact replied to an outreach email.'
where kind = 'marketing_alert';

update public.notifications set link = '/admin/outreach' where kind = 'marketing_alert';

create table public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  university text not null check (char_length(university) between 2 and 160),
  organization text not null default 'IFC' check (char_length(organization) between 2 and 120),
  role text not null default 'President' check (char_length(role) between 2 and 80),
  full_name text check (full_name is null or char_length(full_name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  notes text check (notes is null or char_length(notes) <= 4000),
  do_not_contact boolean not null default false,
  emails_sent int not null default 0,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  last_status text,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  last_reply_at timestamptz,
  replies int not null default 0,
  unread_replies int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index outreach_contacts_email_uidx on public.outreach_contacts (email_normalized);
create index outreach_contacts_university_idx on public.outreach_contacts (lower(university));
create index outreach_contacts_activity_idx on public.outreach_contacts (coalesce(last_reply_at, last_sent_at, created_at) desc);

create table public.outreach_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.outreach_contacts (id) on delete cascade,
  direction text not null check (direction in ('sent', 'reply')),
  subject text not null default '' check (char_length(subject) <= 300),
  body text not null check (char_length(body) between 1 and 50000),
  status text not null check (status in ('sending', 'sent', 'delivered', 'bounced', 'failed', 'received')),
  provider_id text,
  from_email text,
  to_email text,
  error text,
  logged_by_hand boolean not null default false,
  sent_by uuid,
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  open_count int not null default 0,
  clicked_at timestamptz,
  click_count int not null default 0,
  bounced_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((direction = 'reply') = (status = 'received'))
);

create unique index outreach_emails_provider_uidx on public.outreach_emails (provider_id);
create index outreach_emails_contact_idx on public.outreach_emails (contact_id, occurred_at);
create index outreach_emails_replies_idx on public.outreach_emails (occurred_at desc) where direction = 'reply';

create trigger outreach_contacts_touch before update on public.outreach_contacts
  for each row execute function private.touch_updated_at();

create or replace function private.refresh_outreach_contact(p_contact uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.outreach_contacts c
  set
    emails_sent = s.sent,
    first_sent_at = s.first_sent,
    last_sent_at = s.last_sent,
    last_status = s.last_status,
    delivered_at = s.delivered,
    opened_at = s.opened,
    clicked_at = s.clicked,
    bounced_at = s.bounced,
    replies = s.replies,
    replied_at = s.first_reply,
    last_reply_at = s.last_reply,
    unread_replies = s.unread
  from (
    select
      count(*) filter (where direction = 'sent' and status not in ('failed', 'sending'))::int as sent,
      min(occurred_at) filter (where direction = 'sent' and status not in ('failed', 'sending')) as first_sent,
      max(occurred_at) filter (where direction = 'sent' and status not in ('failed', 'sending')) as last_sent,
      (select e.status from public.outreach_emails e where e.contact_id = p_contact and e.direction = 'sent' order by e.occurred_at desc limit 1) as last_status,
      max(delivered_at) as delivered,
      min(opened_at) as opened,
      min(clicked_at) as clicked,
      max(bounced_at) as bounced,
      count(*) filter (where direction = 'reply')::int as replies,
      min(occurred_at) filter (where direction = 'reply') as first_reply,
      max(occurred_at) filter (where direction = 'reply') as last_reply,
      count(*) filter (where direction = 'reply' and read_at is null)::int as unread
    from public.outreach_emails
    where contact_id = p_contact
  ) s
  where c.id = p_contact;
end;
$$;

create or replace function private.outreach_email_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_contact public.outreach_contacts;
begin
  if tg_op = 'DELETE' then
    perform private.refresh_outreach_contact(old.contact_id);
    return old;
  end if;
  perform private.refresh_outreach_contact(new.contact_id);
  if tg_op = 'UPDATE' and new.status = 'bounced' and old.status is distinct from 'bounced' then
    update public.outreach_contacts set do_not_contact = true where id = new.contact_id;
  end if;
  if tg_op = 'INSERT' and new.direction = 'reply' and not new.logged_by_hand then
    select * into v_contact from public.outreach_contacts where id = new.contact_id;
    for v_admin in
      select s.user_id from public.platform_staff s where s.revoked_at is null and s.role = 'admin'
    loop
      perform private.notify(
        v_admin,
        null,
        'marketing_alert',
        'Reply from ' || coalesce(v_contact.full_name, v_contact.email),
        left(v_contact.organization || ', ' || v_contact.university, 160),
        '/admin/outreach/' || new.contact_id::text,
        'outreach-reply:' || new.id::text
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger outreach_emails_effects
  after insert or update or delete on public.outreach_emails
  for each row execute function private.outreach_email_effects();

revoke execute on function private.refresh_outreach_contact(uuid) from public, anon, authenticated;
revoke execute on function private.outreach_email_effects() from public, anon, authenticated;

alter table public.outreach_contacts enable row level security;
alter table public.outreach_emails enable row level security;

create policy outreach_contacts_admin on public.outreach_contacts for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));

create policy outreach_emails_admin on public.outreach_emails for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
