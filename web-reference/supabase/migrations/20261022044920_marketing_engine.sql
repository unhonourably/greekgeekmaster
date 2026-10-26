create table public.marketing_settings (
  id int primary key default 1 check (id = 1),
  emergency_stop boolean not null default false,
  require_human_approval boolean not null default true,
  auto_reply_enabled boolean not null default false,
  daily_send_limit int not null default 50 check (daily_send_limit between 0 and 5000),
  follow_up_interval_days int not null default 7 check (follow_up_interval_days between 1 and 90),
  send_timezone text not null default 'America/Chicago',
  send_hour_start int not null default 9 check (send_hour_start between 0 and 23),
  send_hour_end int not null default 17 check (send_hour_end between 1 and 24),
  tracking_opens boolean not null default false,
  tracking_clicks boolean not null default false,
  retention_days int not null default 730 check (retention_days between 30 and 3650),
  postal_address text check (postal_address is null or char_length(postal_address) between 8 and 400),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (send_hour_start < send_hour_end),
  check (auto_reply_enabled = false or require_human_approval = true)
);

insert into public.marketing_settings (id) values (1);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  audience text not null default '' check (char_length(audience) <= 400),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_prospects (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities (id),
  university_name text not null check (char_length(university_name) between 2 and 160),
  chapter_name text not null check (char_length(chapter_name) between 2 and 160),
  organization_name text check (organization_name is null or char_length(organization_name) between 2 and 160),
  chapter_type text check (chapter_type is null or chapter_type in ('fraternity', 'sorority', 'council', 'national', 'other')),
  officer_name text check (officer_name is null or char_length(officer_name) between 2 and 120),
  officer_role text check (officer_role is null or char_length(officer_role) between 2 and 80),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized text generated always as (nullif(lower(btrim(email)), '')) stored,
  source_url text not null check (source_url ~ '^https://' or source_url ~ '^http://' or source_url ~ '^inbound:'),
  discovered_at timestamptz not null default now(),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected')),
  confidence smallint check (confidence is null or confidence between 0 and 100),
  qualification_score smallint check (qualification_score is null or qualification_score between 0 and 100),
  qualification_note text check (qualification_note is null or char_length(qualification_note) <= 1000),
  stage text not null default 'discovered' check (stage in (
    'discovered', 'contact_verified', 'ready', 'sent', 'responded', 'interested',
    'demo_requested', 'demo_scheduled', 'demo_completed', 'onboarding', 'paying', 'lost'
  )),
  campaign_id uuid references public.marketing_campaigns (id),
  assigned_to uuid references public.profiles (id),
  chapter_id uuid references public.chapters (id),
  attribution text not null default 'unknown' check (attribution in ('attributed', 'unknown')),
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attribution = 'unknown' or campaign_id is not null)
);

create unique index marketing_prospects_email_uidx on public.marketing_prospects (email_normalized) where email_normalized is not null;
create index marketing_prospects_stage_idx on public.marketing_prospects (stage, updated_at desc);
create index marketing_prospects_campaign_idx on public.marketing_prospects (campaign_id);
create index marketing_prospects_search_idx on public.marketing_prospects (lower(university_name), lower(chapter_name));

create table public.marketing_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.marketing_prospects (id),
  campaign_id uuid references public.marketing_campaigns (id),
  direction text not null check (direction in ('outbound', 'inbound')),
  subject text not null default '' check (char_length(subject) <= 200),
  body_text text not null check (char_length(body_text) between 1 and 20000),
  status text not null check (status in (
    'draft', 'awaiting_approval', 'approved', 'queued', 'sent', 'delivered', 'bounced', 'failed', 'suppressed', 'received'
  )),
  capture text not null default 'founder' check (capture in ('webhook', 'founder')),
  provider_id text,
  in_reply_to uuid references public.marketing_messages (id),
  intent text check (intent is null or intent in (
    'interested', 'demo_requested', 'pricing_question', 'feature_question', 'follow_up_requested',
    'referral', 'not_interested', 'wrong_contact', 'out_of_office', 'unsubscribe', 'needs_review'
  )),
  sentiment text check (sentiment is null or sentiment in ('positive', 'negative', 'neutral')),
  ai_summary text check (ai_summary is null or char_length(ai_summary) <= 2000),
  suggested_action text check (suggested_action is null or char_length(suggested_action) <= 500),
  read_at timestamptz,
  assigned_to uuid references public.profiles (id),
  conversation_status text not null default 'open' check (conversation_status in ('open', 'snoozed', 'resolved')),
  snooze_until date,
  follow_up_on date,
  resolved_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (direction = 'outbound' or status = 'received'),
  check (direction = 'inbound' or capture = 'founder')
);

create unique index marketing_messages_provider_uidx on public.marketing_messages (provider_id) where provider_id is not null;
create index marketing_messages_prospect_idx on public.marketing_messages (prospect_id, created_at);
create index marketing_messages_inbox_idx on public.marketing_messages (created_at desc) where direction = 'inbound';
create index marketing_messages_unread_idx on public.marketing_messages (created_at desc) where direction = 'inbound' and read_at is null and conversation_status <> 'resolved';
create index marketing_messages_send_idx on public.marketing_messages (created_at) where direction = 'outbound' and status = 'approved';

create table public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.marketing_prospects (id),
  message_id uuid references public.marketing_messages (id),
  campaign_id uuid references public.marketing_campaigns (id),
  kind text not null check (kind ~ '^[a-z_]{3,40}$'),
  detail text check (detail is null or char_length(detail) <= 500),
  provider_event_id text,
  occurred_at timestamptz not null default now()
);

create unique index marketing_events_provider_uidx on public.marketing_events (provider_event_id) where provider_event_id is not null;
create index marketing_events_prospect_idx on public.marketing_events (prospect_id, occurred_at);
create index marketing_events_kind_idx on public.marketing_events (kind, occurred_at desc);
create index marketing_events_campaign_idx on public.marketing_events (campaign_id, occurred_at desc);

create table public.marketing_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.marketing_prospects (id) on delete cascade,
  author_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.marketing_suppressions (
  email_normalized text primary key,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'declined', 'manual')),
  created_at timestamptz not null default now()
);

create table public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns (id),
  amount_cents bigint not null check (amount_cents >= 0),
  note text check (note is null or char_length(note) <= 300),
  spent_on date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.marketing_jobs (
  kind text primary key check (kind in ('discovery', 'verification', 'qualification', 'drafting', 'sending', 'responses', 'followups', 'attribution')),
  status text not null default 'idle' check (status in ('idle', 'running', 'paused', 'failed', 'stopped')),
  paused boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  last_success_at timestamptz,
  processed int not null default 0,
  failed_count int not null default 0,
  retry_count int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.marketing_jobs (kind) values
  ('discovery'), ('verification'), ('qualification'), ('drafting'), ('sending'), ('responses'), ('followups'), ('attribution');

insert into public.notification_kinds (kind, label, description, default_in_app, default_email)
values ('marketing_alert', 'Marketing', 'Replies, demo requests, and marketing job failures.', true, false)
on conflict (kind) do nothing;

create or replace function private.marketing_stage_rank(p_stage text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'discovered' then 1
    when 'contact_verified' then 2
    when 'ready' then 3
    when 'sent' then 4
    when 'responded' then 5
    when 'interested' then 6
    when 'demo_requested' then 7
    when 'demo_scheduled' then 8
    when 'demo_completed' then 9
    when 'onboarding' then 10
    when 'paying' then 11
    else 0
  end
$$;

create or replace function private.advance_marketing_stage(p_prospect uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
begin
  select stage into v_stage from public.marketing_prospects where id = p_prospect;
  if v_stage is null or v_stage in ('lost', 'paying') then
    return;
  end if;
  if private.marketing_stage_rank(p_stage) > private.marketing_stage_rank(v_stage) then
    update public.marketing_prospects set stage = p_stage, last_contact_at = now() where id = p_prospect;
  else
    update public.marketing_prospects set last_contact_at = now() where id = p_prospect;
  end if;
end;
$$;

create or replace function private.marketing_message_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt()->>'role', '');
begin
  if tg_op = 'INSERT' and new.direction = 'inbound' and new.capture = 'webhook' and v_role <> 'service_role' then
    raise exception 'inbound mail is recorded by the provider webhook' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.direction = 'inbound' and new.capture = 'founder' and not private.is_platform_staff(array['admin']::public.platform_staff_role[]) and v_role <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.body_text is distinct from old.body_text and old.direction = 'inbound' then
    raise exception 'the original response cannot be changed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.subject is distinct from old.subject and old.direction = 'inbound' then
    raise exception 'the original response cannot be changed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('queued', 'sent', 'delivered', 'bounced', 'failed', 'suppressed') and v_role <> 'service_role' then
    raise exception 'only the mailer can record delivery' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.direction = 'outbound' and new.status not in ('draft', 'awaiting_approval', 'approved') then
    raise exception 'a new email starts as a draft or an approval' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger marketing_messages_guard
  before insert or update on public.marketing_messages
  for each row execute function private.marketing_message_guard();

create or replace function private.marketing_message_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
begin
  if tg_op = 'INSERT' and new.direction = 'outbound' then
    insert into public.marketing_events (prospect_id, message_id, campaign_id, kind, detail)
    values (new.prospect_id, new.id, new.campaign_id, 'drafted', new.status);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status not in ('delivered', 'bounced') then
    insert into public.marketing_events (prospect_id, message_id, campaign_id, kind, detail)
    values (new.prospect_id, new.id, new.campaign_id, new.status, null);
    if new.status = 'sent' then
      perform private.advance_marketing_stage(new.prospect_id, 'sent');
    end if;
  end if;
  if tg_op = 'INSERT' and new.direction = 'inbound' then
    insert into public.marketing_events (prospect_id, message_id, campaign_id, kind, detail)
    values (new.prospect_id, new.id, new.campaign_id, 'response', new.capture);
    perform private.advance_marketing_stage(new.prospect_id, 'responded');
    if new.intent = 'interested' then
      perform private.advance_marketing_stage(new.prospect_id, 'interested');
    elsif new.intent = 'demo_requested' then
      perform private.advance_marketing_stage(new.prospect_id, 'demo_requested');
    elsif new.intent in ('not_interested', 'unsubscribe') then
      update public.marketing_prospects set stage = 'lost' where id = new.prospect_id and stage <> 'paying';
      insert into public.marketing_suppressions (email_normalized, reason)
      select p.email_normalized, case when new.intent = 'unsubscribe' then 'unsubscribe' else 'declined' end
      from public.marketing_prospects p
      where p.id = new.prospect_id and p.email_normalized is not null
      on conflict (email_normalized) do update set reason = excluded.reason;
    end if;
    for v_admin in
      select s.user_id from public.platform_staff s where s.revoked_at is null and s.role = 'admin'
    loop
      perform private.notify(
        v_admin,
        null,
        'marketing_alert',
        'New marketing reply',
        left(new.subject, 160),
        '/admin/marketing/responses/' || new.id::text,
        'marketing-reply:' || new.id::text
      );
    end loop;
  end if;
  if tg_op = 'UPDATE' and new.intent is distinct from old.intent and new.direction = 'inbound' then
    insert into public.marketing_events (prospect_id, message_id, campaign_id, kind, detail)
    values (new.prospect_id, new.id, new.campaign_id, 'classified', new.intent);
    if new.intent = 'interested' then
      perform private.advance_marketing_stage(new.prospect_id, 'interested');
    elsif new.intent = 'demo_requested' then
      perform private.advance_marketing_stage(new.prospect_id, 'demo_requested');
    elsif new.intent in ('not_interested', 'unsubscribe') then
      update public.marketing_prospects set stage = 'lost' where id = new.prospect_id and stage <> 'paying';
      insert into public.marketing_suppressions (email_normalized, reason)
      select p.email_normalized, case when new.intent = 'unsubscribe' then 'unsubscribe' else 'declined' end
      from public.marketing_prospects p
      where p.id = new.prospect_id and p.email_normalized is not null
      on conflict (email_normalized) do update set reason = excluded.reason;
    end if;
    if new.intent in ('interested', 'demo_requested', 'pricing_question') then
      for v_admin in
        select s.user_id from public.platform_staff s where s.revoked_at is null and s.role = 'admin'
      loop
        perform private.notify(
          v_admin, null, 'marketing_alert', 'Marketing reply needs you', left(coalesce(new.intent, 'reply'), 160),
          '/admin/marketing/responses/' || new.id::text, 'marketing-intent:' || new.id::text || ':' || new.intent
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;

create trigger marketing_messages_effects
  after insert or update on public.marketing_messages
  for each row execute function private.marketing_message_effects();

create or replace function private.marketing_prospect_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.marketing_events (prospect_id, campaign_id, kind, detail)
    values (new.id, new.campaign_id, 'discovered', new.source_url);
  end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into public.marketing_events (prospect_id, campaign_id, kind, detail)
    values (new.id, new.campaign_id, 'stage', new.stage);
    if new.stage = 'demo_scheduled' then
      insert into public.marketing_events (prospect_id, campaign_id, kind) values (new.id, new.campaign_id, 'demo_booked');
    elsif new.stage = 'paying' then
      insert into public.marketing_events (prospect_id, campaign_id, kind) values (new.id, new.campaign_id, 'converted');
    end if;
  end if;
  if tg_op = 'UPDATE' and new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    insert into public.marketing_events (prospect_id, campaign_id, kind) values (new.id, new.campaign_id, 'contact_verified');
    perform private.advance_marketing_stage(new.id, 'contact_verified');
  end if;
  return new;
end;
$$;

create trigger marketing_prospects_effects
  after insert or update on public.marketing_prospects
  for each row execute function private.marketing_prospect_effects();

create trigger marketing_prospects_touch before update on public.marketing_prospects
  for each row execute function private.touch_updated_at();
create trigger marketing_campaigns_touch before update on public.marketing_campaigns
  for each row execute function private.touch_updated_at();
create trigger marketing_settings_touch before update on public.marketing_settings
  for each row execute function private.touch_updated_at();
create trigger marketing_jobs_touch before update on public.marketing_jobs
  for each row execute function private.touch_updated_at();

create or replace function private.audit_marketing_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, actor_kind, action, target_type, target_id, metadata)
    values (
      auth.uid(),
      case when auth.uid() is null then 'system' else 'platform_staff' end,
      'marketing.message.' || case when tg_op = 'INSERT' then 'created' else new.status end,
      'marketing_message',
      new.id::text,
      jsonb_build_object('direction', new.direction, 'prospect_id', new.prospect_id, 'campaign_id', new.campaign_id)
    );
  end if;
  return new;
end;
$$;

create trigger marketing_messages_audit
  after insert or update on public.marketing_messages
  for each row execute function private.audit_marketing_message();

create or replace function private.audit_marketing_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, actor_kind, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'platform_staff',
    'marketing.settings',
    'marketing_settings',
    '1',
    jsonb_build_object(
      'emergency_stop', new.emergency_stop,
      'require_human_approval', new.require_human_approval,
      'daily_send_limit', new.daily_send_limit,
      'tracking_opens', new.tracking_opens,
      'tracking_clicks', new.tracking_clicks
    )
  );
  return new;
end;
$$;

create trigger marketing_settings_audit
  after update on public.marketing_settings
  for each row execute function private.audit_marketing_settings();

create or replace function public.claim_marketing_sends(p_limit int default 20)
returns table (id uuid, prospect_id uuid, campaign_id uuid, to_email text, subject text, body_text text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.marketing_settings;
  v_sent int;
  v_room int;
  v_local timestamp;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  select * into v_settings from public.marketing_settings where marketing_settings.id = 1;
  update public.marketing_messages m
  set status = 'suppressed', last_error = 'This address is on the suppression list.'
  from public.marketing_prospects p
  join public.marketing_suppressions s on s.email_normalized = p.email_normalized
  where m.prospect_id = p.id and m.direction = 'outbound' and m.status = 'approved';
  if v_settings.emergency_stop or v_settings.postal_address is null then
    return;
  end if;
  v_local := now() at time zone v_settings.send_timezone;
  if extract(hour from v_local) < v_settings.send_hour_start or extract(hour from v_local) >= v_settings.send_hour_end then
    return;
  end if;
  select count(*) into v_sent
  from public.marketing_messages
  where direction = 'outbound'
    and status in ('queued', 'sent', 'delivered', 'bounced')
    and coalesce(sent_at, created_at) >= (date_trunc('day', v_local) at time zone v_settings.send_timezone);
  v_room := greatest(v_settings.daily_send_limit - v_sent, 0);
  if v_room = 0 then
    return;
  end if;
  return query
  with picked as (
    select m.id
    from public.marketing_messages m
    join public.marketing_prospects p on p.id = m.prospect_id
    where m.direction = 'outbound'
      and m.status = 'approved'
      and p.email_normalized is not null
      and not exists (select 1 from public.marketing_suppressions s where s.email_normalized = p.email_normalized)
    order by m.created_at
    limit least(p_limit, v_room)
    for update of m skip locked
  )
  update public.marketing_messages m
  set status = 'queued', last_error = null
  from picked
  where m.id = picked.id
  returning m.id, m.prospect_id, m.campaign_id, (
    select p.email from public.marketing_prospects p where p.id = m.prospect_id
  ), m.subject, m.body_text;
end;
$$;

create or replace function public.ingest_marketing_reply(
  p_provider_id text,
  p_from_email text,
  p_from_name text,
  p_subject text,
  p_body text,
  p_in_reply_to text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_email text := nullif(lower(btrim(p_from_email)), '');
  v_prospect uuid;
  v_campaign uuid;
  v_parent uuid;
  v_id uuid;
  v_name text := nullif(btrim(p_from_name), '');
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    v_name := null;
  end if;
  if p_provider_id is null or v_email is null or p_body is null or btrim(p_body) = '' then
    raise exception 'incomplete reply' using errcode = '22023';
  end if;
  select id into v_existing from public.marketing_messages where provider_id = p_provider_id;
  if v_existing is not null then
    return v_existing;
  end if;
  if p_in_reply_to is not null then
    select id, prospect_id, campaign_id into v_parent, v_prospect, v_campaign
    from public.marketing_messages
    where provider_id = p_in_reply_to and direction = 'outbound'
    limit 1;
  end if;
  if v_prospect is null then
    select id, campaign_id into v_prospect, v_campaign
    from public.marketing_prospects
    where email_normalized = v_email
    limit 1;
  end if;
  if v_prospect is null then
    insert into public.marketing_prospects (university_name, chapter_name, officer_name, email, source_url, stage)
    values ('Not listed', 'Not listed', v_name, v_email, 'inbound:' || left(p_provider_id, 80), 'responded')
    returning id into v_prospect;
  end if;
  insert into public.marketing_messages (
    prospect_id, campaign_id, direction, subject, body_text, status, capture, provider_id, in_reply_to, intent
  ) values (
    v_prospect, v_campaign, 'inbound', left(coalesce(p_subject, ''), 200), left(p_body, 20000), 'received', 'webhook', p_provider_id, v_parent, 'needs_review'
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.record_marketing_provider_event(
  p_provider_event_id text,
  p_provider_email_id text,
  p_kind text,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.marketing_messages;
  v_settings public.marketing_settings;
  v_email text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_provider_event_id is null or p_kind not in ('delivered', 'bounced', 'opened', 'clicked', 'complained') then
    raise exception 'invalid event' using errcode = '22023';
  end if;
  if exists (select 1 from public.marketing_events where provider_event_id = p_provider_event_id) then
    return false;
  end if;
  select * into v_message from public.marketing_messages where provider_id = p_provider_email_id and direction = 'outbound';
  if v_message.id is null then
    return false;
  end if;
  select * into v_settings from public.marketing_settings where id = 1;
  if p_kind = 'opened' and not v_settings.tracking_opens then
    return false;
  end if;
  if p_kind = 'clicked' and not v_settings.tracking_clicks then
    return false;
  end if;
  insert into public.marketing_events (prospect_id, message_id, campaign_id, kind, provider_event_id, occurred_at)
  values (v_message.prospect_id, v_message.id, v_message.campaign_id, p_kind, p_provider_event_id, coalesce(p_occurred_at, now()));
  if p_kind = 'delivered' and v_message.status = 'sent' then
    update public.marketing_messages set status = 'delivered' where id = v_message.id;
  elsif p_kind = 'bounced' then
    update public.marketing_messages set status = 'bounced', last_error = 'The provider reported a bounce.' where id = v_message.id;
    select email_normalized into v_email from public.marketing_prospects where id = v_message.prospect_id;
    if v_email is not null then
      insert into public.marketing_suppressions (email_normalized, reason) values (v_email, 'bounce')
      on conflict (email_normalized) do nothing;
    end if;
  elsif p_kind = 'complained' then
    select email_normalized into v_email from public.marketing_prospects where id = v_message.prospect_id;
    if v_email is not null then
      insert into public.marketing_suppressions (email_normalized, reason) values (v_email, 'unsubscribe')
      on conflict (email_normalized) do update set reason = 'unsubscribe';
    end if;
    update public.marketing_prospects set stage = 'lost' where id = v_message.prospect_id and stage <> 'paying';
  end if;
  return true;
end;
$$;

create or replace function public.marketing_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_opens boolean;
  v_clicks boolean;
  v_universities int;
  v_chapters int;
  v_prospects int;
  v_verified int;
  v_mrr bigint;
  v_mrr_skipped int;
  v_unattributed int;
begin
  if not private.is_platform_staff(array['admin']::public.platform_staff_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  select tracking_opens, tracking_clicks into v_opens, v_clicks from public.marketing_settings where id = 1;
  select count(distinct lower(university_name)) into v_universities from public.marketing_prospects where university_name <> 'Not listed';
  select count(distinct lower(university_name) || '|' || lower(chapter_name)) into v_chapters from public.marketing_prospects where chapter_name <> 'Not listed';
  select count(*) into v_prospects from public.marketing_prospects;
  select count(*) into v_verified from public.marketing_prospects where verification_status = 'verified';
  select coalesce(sum(case when s.billing_interval = 'month' then s.unit_amount_cents when s.billing_interval = 'year' then s.unit_amount_cents / 12 else 0 end), 0),
         count(*) filter (where s.billing_interval not in ('month', 'year') or s.unit_amount_cents is null)
  into v_mrr, v_mrr_skipped
  from (
    select distinct on (s.chapter_id) s.chapter_id, s.unit_amount_cents, s.billing_interval
    from public.chapter_subscriptions s
    where s.status = 'active'
    order by s.chapter_id, s.updated_at desc
  ) s
  join public.marketing_prospects p on p.chapter_id = s.chapter_id
  where p.attribution = 'attributed' and p.campaign_id is not null;
  select count(distinct p.id) into v_unattributed
  from public.marketing_prospects p
  join public.chapter_subscriptions s on s.chapter_id = p.chapter_id and s.status = 'active'
  where p.attribution <> 'attributed' or p.campaign_id is null;
  return jsonb_build_object(
    'tracking_opens', v_opens,
    'tracking_clicks', v_clicks,
    'lifetime_universities', v_universities,
    'lifetime_chapters', v_chapters,
    'lifetime_prospects', v_prospects,
    'lifetime_verified', v_verified,
    'attributed_mrr_cents', v_mrr,
    'mrr_skipped', v_mrr_skipped,
    'unattributed_paying', v_unattributed,
    'period_drafted', (select count(*) from public.marketing_events where kind = 'drafted' and occurred_at >= p_from and occurred_at < p_to),
    'period_sent', (select count(*) from public.marketing_messages where direction = 'outbound' and status in ('sent', 'delivered', 'bounced') and sent_at >= p_from and sent_at < p_to),
    'period_delivered', (select count(*) from public.marketing_events where kind = 'delivered' and occurred_at >= p_from and occurred_at < p_to),
    'period_opened', case when v_opens then (select count(*) from public.marketing_events where kind = 'opened' and occurred_at >= p_from and occurred_at < p_to) else null end,
    'period_clicked', case when v_clicks then (select count(*) from public.marketing_events where kind = 'clicked' and occurred_at >= p_from and occurred_at < p_to) else null end,
    'period_verified', (select count(*) from public.marketing_events where kind = 'contact_verified' and occurred_at >= p_from and occurred_at < p_to),
    'period_responses', (select count(*) from public.marketing_messages where direction = 'inbound' and created_at >= p_from and created_at < p_to),
    'period_positive', (select count(*) from public.marketing_messages where direction = 'inbound' and sentiment = 'positive' and created_at >= p_from and created_at < p_to),
    'period_negative', (select count(*) from public.marketing_messages where direction = 'inbound' and sentiment = 'negative' and created_at >= p_from and created_at < p_to),
    'period_neutral', (select count(*) from public.marketing_messages where direction = 'inbound' and sentiment = 'neutral' and created_at >= p_from and created_at < p_to),
    'period_interested', (select count(distinct prospect_id) from public.marketing_events where kind = 'stage' and detail = 'interested' and occurred_at >= p_from and occurred_at < p_to),
    'period_demos', (select count(distinct prospect_id) from public.marketing_events where ((kind = 'stage' and detail = 'demo_requested') or kind = 'classified' and detail = 'demo_requested') and occurred_at >= p_from and occurred_at < p_to),
    'period_meetings', (select count(*) from public.marketing_events where kind = 'demo_booked' and occurred_at >= p_from and occurred_at < p_to),
    'period_trials', (
      select count(distinct p.id) from public.marketing_prospects p
      join public.chapter_subscriptions s on s.chapter_id = p.chapter_id
      where s.status = 'trialing' and s.created_at >= p_from and s.created_at < p_to
    ),
    'period_paying', (
      select count(distinct p.id) from public.marketing_prospects p
      join public.chapter_subscriptions s on s.chapter_id = p.chapter_id
      where s.status = 'active' and p.stage = 'paying' and s.created_at >= p_from and s.created_at < p_to
    ),
    'period_attributed_paying', (
      select count(distinct p.id) from public.marketing_prospects p
      join public.chapter_subscriptions s on s.chapter_id = p.chapter_id
      where s.status = 'active' and p.attribution = 'attributed' and p.campaign_id is not null and s.created_at >= p_from and s.created_at < p_to
    ),
    'period_unsubscribes', (select count(*) from public.marketing_suppressions where reason = 'unsubscribe' and created_at >= p_from and created_at < p_to),
    'period_bounces', (select count(*) from public.marketing_events where kind = 'bounced' and occurred_at >= p_from and occurred_at < p_to),
    'period_spend_cents', (select coalesce(sum(amount_cents), 0) from public.marketing_spend where spent_on >= p_from::date and spent_on < p_to::date),
    'snapshot_awaiting', (select count(*) from public.marketing_messages where direction = 'outbound' and status = 'awaiting_approval'),
    'snapshot_unread', (select count(*) from public.marketing_messages where direction = 'inbound' and read_at is null and conversation_status <> 'resolved'),
    'snapshot_suppressed', (select count(*) from public.marketing_suppressions)
  );
end;
$$;

revoke execute on function private.marketing_stage_rank(text) from public, anon, authenticated;
revoke execute on function private.advance_marketing_stage(uuid, text) from public, anon, authenticated;
revoke execute on function private.marketing_message_guard() from public, anon, authenticated;
revoke execute on function private.marketing_message_effects() from public, anon, authenticated;
revoke execute on function private.marketing_prospect_effects() from public, anon, authenticated;
revoke execute on function private.audit_marketing_message() from public, anon, authenticated;
revoke execute on function private.audit_marketing_settings() from public, anon, authenticated;

revoke execute on function public.claim_marketing_sends(int) from public, anon, authenticated;
revoke execute on function public.ingest_marketing_reply(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.record_marketing_provider_event(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_marketing_sends(int) to service_role;
grant execute on function public.ingest_marketing_reply(text, text, text, text, text, text) to service_role;
grant execute on function public.record_marketing_provider_event(text, text, text, timestamptz) to service_role;
grant execute on function public.marketing_metrics(timestamptz, timestamptz) to authenticated;

alter table public.marketing_settings enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_prospects enable row level security;
alter table public.marketing_messages enable row level security;
alter table public.marketing_events enable row level security;
alter table public.marketing_notes enable row level security;
alter table public.marketing_suppressions enable row level security;
alter table public.marketing_spend enable row level security;
alter table public.marketing_jobs enable row level security;

create policy marketing_settings_admin on public.marketing_settings for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_campaigns_admin on public.marketing_campaigns for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_prospects_admin on public.marketing_prospects for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_messages_admin on public.marketing_messages for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_events_admin on public.marketing_events for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_notes_admin on public.marketing_notes for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_suppressions_admin on public.marketing_suppressions for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_spend_admin on public.marketing_spend for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
create policy marketing_jobs_admin on public.marketing_jobs for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.marketing_messages;
  end if;
end $$;
