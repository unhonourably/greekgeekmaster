alter table public.outreach_contacts
  add column if not exists bulk_subject text check (bulk_subject is null or char_length(bulk_subject) <= 300),
  add column if not exists bulk_body text check (bulk_body is null or char_length(bulk_body) <= 50000);
