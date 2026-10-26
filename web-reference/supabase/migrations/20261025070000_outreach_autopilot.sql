create table public.outreach_autopilot (
  id int primary key default 1 check (id = 1),
  status text not null default 'idle' check (status in ('idle', 'running', 'paused', 'done')),
  started_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  include_form boolean not null default true,
  state_index int not null default 0,
  school_offset int not null default 0,
  current_state text,
  schools_total int not null default 0,
  schools_read int not null default 0,
  schools_skipped int not null default 0,
  schools_failed int not null default 0,
  contacts_added int not null default 0,
  emails_sent int not null default 0,
  emails_failed int not null default 0,
  send_runs int not null default 0,
  last_tick_at timestamptz,
  lease_until timestamptz,
  send_paused_until timestamptz,
  last_message text check (last_message is null or char_length(last_message) <= 500),
  updated_at timestamptz not null default now()
);

insert into public.outreach_autopilot (id) values (1) on conflict (id) do nothing;

alter table public.outreach_autopilot enable row level security;

create policy outreach_autopilot_admin on public.outreach_autopilot for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
