alter table public.outreach_autopilot
  add column if not exists skip_recent boolean not null default true;

update public.outreach_autopilot
set status = 'idle',
  started_by = null,
  started_at = null,
  finished_at = null,
  state_index = 0,
  school_offset = 0,
  current_state = null,
  schools_total = 0,
  schools_read = 0,
  schools_skipped = 0,
  schools_failed = 0,
  contacts_added = 0,
  emails_sent = 0,
  emails_failed = 0,
  send_runs = 0,
  last_tick_at = null,
  lease_until = null,
  send_paused_until = null,
  last_message = null,
  updated_at = now()
where id = 1;
