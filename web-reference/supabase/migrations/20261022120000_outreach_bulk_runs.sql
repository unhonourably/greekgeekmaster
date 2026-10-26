create table public.outreach_bulk_runs (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  queued int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  left_waiting int not null default 0,
  stopped_reason text check (stopped_reason is null or char_length(stopped_reason) <= 500)
);

create index outreach_bulk_runs_started_idx on public.outreach_bulk_runs (started_at desc);

alter table public.outreach_emails
  add column if not exists bulk_run_id uuid references public.outreach_bulk_runs (id) on delete set null;

create index if not exists outreach_emails_bulk_run_idx on public.outreach_emails (bulk_run_id) where bulk_run_id is not null;

alter table public.outreach_bulk_runs enable row level security;

create policy outreach_bulk_runs_admin on public.outreach_bulk_runs for all to authenticated
  using (private.is_platform_staff(array['admin']::public.platform_staff_role[]))
  with check (private.is_platform_staff(array['admin']::public.platform_staff_role[]));
