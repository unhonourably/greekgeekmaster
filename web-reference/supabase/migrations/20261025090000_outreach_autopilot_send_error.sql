alter table public.outreach_autopilot
  add column if not exists send_error text check (send_error is null or char_length(send_error) <= 500);

update public.outreach_autopilot set send_paused_until = null where id = 1;
