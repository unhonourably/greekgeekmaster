alter table public.outreach_contacts
  add column if not exists bulk_added_at timestamptz;

create index if not exists outreach_contacts_bulk_idx on public.outreach_contacts (bulk_added_at) where bulk_added_at is not null;
