create type public.payment_status as enum ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'partially_refunded', 'refunded', 'disputed', 'dispute_lost');
create type public.ledger_account as enum ('member_receivable', 'dues_revenue', 'stripe_balance', 'cash_on_hand', 'bank_deposits', 'platform_fees', 'processing_fees', 'credits_issued', 'disputed_funds');
create type public.ledger_kind as enum ('assessment', 'assessment_void', 'payment', 'offline_payment', 'platform_fee', 'processing_fee', 'credit', 'late_fee', 'refund', 'platform_fee_refund', 'dispute_withdrawal', 'dispute_reinstatement', 'dispute_fee', 'dispute_lost', 'payout', 'payout_reversal');

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9_-]{3,40}$'),
  version int not null default 1 check (version > 0),
  name text not null,
  applies_to text not null default 'dues' check (applies_to in ('dues')),
  platform_fee_bps int not null check (platform_fee_bps between 0 and 1000),
  platform_fee_fixed_cents int not null default 0 check (platform_fee_fixed_cents between 0 and 500),
  min_fee_cents int check (min_fee_cents is null or min_fee_cents >= 0),
  max_fee_cents int check (max_fee_cents is null or max_fee_cents >= 0),
  refund_policy text not null default 'proportional' check (refund_policy in ('proportional', 'none')),
  processing_fee_payer text not null default 'chapter' check (processing_fee_payer in ('chapter')),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  is_default boolean not null default false,
  effective_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (code, version),
  check (max_fee_cents is null or min_fee_cents is null or max_fee_cents >= min_fee_cents)
);

create unique index pricing_rules_one_default on public.pricing_rules (is_default) where is_default and status = 'active';

alter table public.chapters add constraint chapters_pricing_rule_fk foreign key (pricing_rule_id) references public.pricing_rules (id);

create or replace function private.guard_pricing_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published pricing rules cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.platform_fee_bps is distinct from old.platform_fee_bps
      or new.platform_fee_fixed_cents is distinct from old.platform_fee_fixed_cents
      or new.min_fee_cents is distinct from old.min_fee_cents
      or new.max_fee_cents is distinct from old.max_fee_cents
      or new.refund_policy is distinct from old.refund_policy
      or new.processing_fee_payer is distinct from old.processing_fee_payer
      or new.code is distinct from old.code
      or new.version is distinct from old.version
      or (old.status = 'retired' and new.status <> 'retired') then
      raise exception 'published pricing rules are immutable; publish a new version' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger pricing_rules_guard before update or delete on public.pricing_rules
  for each row execute function private.guard_pricing_rules();

create or replace function private.calculate_platform_fee(p_amount bigint, p_rule public.pricing_rules)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v bigint;
begin
  if p_amount <= 0 then
    return 0;
  end if;
  v := (p_amount * p_rule.platform_fee_bps + 5000) / 10000 + p_rule.platform_fee_fixed_cents;
  if p_rule.min_fee_cents is not null then
    v := greatest(v, p_rule.min_fee_cents);
  end if;
  if p_rule.max_fee_cents is not null then
    v := least(v, p_rule.max_fee_cents);
  end if;
  return least(v, p_amount);
end;
$$;

create or replace function public.calculate_platform_fee(p_amount bigint, p_rule uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select private.calculate_platform_fee(p_amount, r) from public.pricing_rules r where r.id = p_rule
$$;

create table public.terms_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('chapter_agreement', 'terms_of_service', 'privacy_policy')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'),
  title text not null,
  summary text not null,
  body text not null,
  pricing_rule_id uuid references public.pricing_rules (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create trigger terms_documents_append_only before update or delete on public.terms_documents
  for each row when (old.published_at is not null) execute function private.prevent_mutation();

create table public.chapter_agreements (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  terms_document_id uuid not null references public.terms_documents (id),
  pricing_rule_id uuid not null references public.pricing_rules (id),
  accepted_by uuid not null references public.profiles (id),
  signer_name text not null check (char_length(signer_name) between 2 and 120),
  signer_title text not null check (char_length(signer_title) between 2 and 80),
  accepted_ip text,
  accepted_user_agent text,
  accepted_at timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index chapter_agreements_current on public.chapter_agreements (chapter_id) where superseded_at is null;

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null unique references public.chapters (id),
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null default false,
  dashboard text not null default 'full',
  card_payments_status text not null default 'pending',
  ach_payments_status text,
  payouts_status text not null default 'pending',
  requirements_due text[] not null default '{}',
  requirements_past_due text[] not null default '{}',
  disabled_reason text,
  onboarding_completed_at timestamptz,
  created_by uuid references public.profiles (id),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  name text not null check (char_length(name) between 2 and 60),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  unique (chapter_id, name),
  unique (chapter_id, id),
  check (ends_on > starts_on)
);

create table public.dues_assessments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  term_id uuid,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 2000),
  category text not null default 'dues' check (category in ('dues', 'new_member_fee', 'fine', 'housing', 'event', 'other')),
  default_amount_cents bigint not null check (default_amount_cents between 50 and 10000000),
  currency char(3) not null default 'usd',
  due_date date not null,
  late_fee_cents bigint not null default 0 check (late_fee_cents between 0 and 100000),
  late_fee_grace_days int not null default 0 check (late_fee_grace_days between 0 and 90),
  allow_installments boolean not null default false,
  max_installments int not null default 1 check (max_installments between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'issued', 'closed', 'cancelled')),
  created_by uuid not null references public.profiles (id),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, term_id) references public.academic_terms (chapter_id, id)
);

create table public.member_assessments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  assessment_id uuid not null,
  membership_id uuid not null,
  amount_cents bigint not null check (amount_cents between 50 and 10000000),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'voided')),
  late_fee_applied_at timestamptz,
  issued_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (assessment_id, membership_id),
  unique (chapter_id, id),
  foreign key (chapter_id, assessment_id) references public.dues_assessments (chapter_id, id),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id)
);

create index member_assessments_membership_idx on public.member_assessments (membership_id, due_date);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  member_assessment_id uuid not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  total_cents bigint not null check (total_cents > 0),
  consent_text text not null,
  consented_by uuid not null references public.profiles (id),
  consented_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, member_assessment_id) references public.member_assessments (chapter_id, id)
);

create unique index installment_plans_one_active on public.installment_plans (member_assessment_id) where status = 'active';

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  plan_id uuid not null,
  sequence int not null check (sequence between 1 and 12),
  amount_cents bigint not null check (amount_cents >= 50),
  due_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, sequence),
  unique (chapter_id, id),
  foreign key (chapter_id, plan_id) references public.installment_plans (chapter_id, id)
);

create sequence public.receipt_number_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  membership_id uuid not null,
  payer_id uuid references public.profiles (id),
  member_assessment_id uuid not null,
  installment_id uuid,
  kind text not null check (kind in ('stripe', 'offline')),
  method text not null default 'unknown' check (method in ('card', 'us_bank_account', 'link', 'cash', 'check', 'external_app', 'other', 'unknown')),
  status public.payment_status not null default 'pending',
  currency char(3) not null default 'usd',
  amount_cents bigint not null check (amount_cents >= 50),
  surcharge_cents bigint not null default 0 check (surcharge_cents = 0),
  pricing_rule_id uuid references public.pricing_rules (id),
  platform_fee_bps int,
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  application_fee_cents bigint check (application_fee_cents >= 0),
  application_fee_refunded_cents bigint not null default 0 check (application_fee_refunded_cents >= 0),
  processing_fee_cents bigint check (processing_fee_cents >= 0),
  net_cents bigint,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  disputed_cents bigint not null default 0 check (disputed_cents >= 0),
  stripe_account_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  stripe_application_fee_id text,
  stripe_balance_transaction_id text,
  livemode boolean not null default false,
  failure_code text,
  failure_message text,
  offline_reference text check (char_length(offline_reference) <= 120),
  received_on date,
  memo text check (char_length(memo) <= 500),
  recorded_by uuid references public.profiles (id),
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'matched', 'mismatch', 'not_applicable')),
  reconciliation_note text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  processing_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, membership_id) references public.memberships (chapter_id, id),
  foreign key (chapter_id, member_assessment_id) references public.member_assessments (chapter_id, id),
  foreign key (chapter_id, installment_id) references public.installments (chapter_id, id),
  check (refunded_cents <= amount_cents),
  check (platform_fee_cents <= amount_cents)
);

create index payments_chapter_idx on public.payments (chapter_id, created_at desc);
create index payments_membership_idx on public.payments (membership_id, created_at desc);
create index payments_assessment_idx on public.payments (member_assessment_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  payment_id uuid not null unique references public.payments (id),
  membership_id uuid not null references public.memberships (id),
  receipt_number text not null unique,
  amount_cents bigint not null,
  platform_fee_cents bigint not null,
  issued_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  payment_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  expected_fee_refund_cents bigint not null default 0 check (expected_fee_refund_cents >= 0),
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'canceled')),
  origin text not null default 'platform' check (origin in ('platform', 'stripe_dashboard')),
  stripe_refund_id text unique,
  failure_reason text,
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  succeeded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, payment_id) references public.payments (chapter_id, id)
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null,
  payment_id uuid not null,
  stripe_dispute_id text not null unique,
  amount_cents bigint not null,
  reason text,
  status text not null,
  outcome text check (outcome in ('won', 'lost')),
  evidence_due_by timestamptz,
  fee_cents bigint not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, id),
  foreign key (chapter_id, payment_id) references public.payments (chapter_id, id)
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  stripe_payout_id text not null unique,
  amount_cents bigint not null,
  currency char(3) not null,
  status text not null,
  arrival_date date,
  failure_code text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  kind public.ledger_kind not null,
  description text not null,
  membership_id uuid references public.memberships (id),
  member_assessment_id uuid references public.member_assessments (id),
  payment_id uuid references public.payments (id),
  refund_id uuid references public.refunds (id),
  dispute_id uuid references public.disputes (id),
  payout_id uuid references public.payouts (id),
  source text not null default 'app' check (source in ('app', 'stripe_webhook', 'job')),
  source_reference text,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index ledger_transactions_chapter_idx on public.ledger_transactions (chapter_id, occurred_at desc);
create index ledger_transactions_payment_idx on public.ledger_transactions (payment_id);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions (id),
  chapter_id uuid not null references public.chapters (id),
  account public.ledger_account not null,
  membership_id uuid references public.memberships (id),
  member_assessment_id uuid references public.member_assessments (id),
  amount_cents bigint not null check (amount_cents <> 0),
  created_at timestamptz not null default now(),
  check (account <> 'member_receivable' or membership_id is not null)
);

create index ledger_entries_txn_idx on public.ledger_entries (transaction_id);
create index ledger_entries_member_idx on public.ledger_entries (membership_id, account);
create index ledger_entries_assessment_idx on public.ledger_entries (member_assessment_id) where member_assessment_id is not null;
create index ledger_entries_chapter_account_idx on public.ledger_entries (chapter_id, account);

create trigger ledger_transactions_append_only before update or delete on public.ledger_transactions
  for each row execute function private.prevent_mutation();
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function private.prevent_mutation();

create or replace function private.check_ledger_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sum bigint;
begin
  select coalesce(sum(amount_cents), 0) into v_sum from public.ledger_entries where transaction_id = new.transaction_id;
  if v_sum <> 0 then
    raise exception 'ledger transaction % is unbalanced by %', new.transaction_id, v_sum using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.check_ledger_balanced();

create table public.stripe_events (
  id text primary key,
  type text not null,
  account text,
  livemode boolean not null,
  api_version text,
  stripe_created_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_events_status_idx on public.stripe_events (status, received_at);

create table public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  price_cents bigint not null check (price_cents >= 0),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  stripe_price_id text,
  features text[] not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.chapter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id),
  plan_id uuid references public.saas_plans (id),
  status text not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  unit_amount_cents bigint,
  billing_interval text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters (id),
  subscription_id uuid references public.chapter_subscriptions (id),
  stripe_invoice_id text not null unique,
  amount_paid_cents bigint not null default 0,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function private.post_ledger(
  p_chapter uuid,
  p_kind public.ledger_kind,
  p_description text,
  p_idempotency text,
  p_entries jsonb,
  p_refs jsonb default '{}'::jsonb,
  p_source text default 'app',
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn uuid;
  v_sum bigint := 0;
  e jsonb;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'a ledger transaction needs at least two entries';
  end if;
  for e in select * from jsonb_array_elements(p_entries) loop
    v_sum := v_sum + (e ->> 'amount')::bigint;
  end loop;
  if v_sum <> 0 then
    raise exception 'ledger entries must balance (off by %)', v_sum using errcode = '23514';
  end if;
  insert into public.ledger_transactions (
    chapter_id, kind, description, idempotency_key, membership_id, member_assessment_id, payment_id, refund_id, dispute_id, payout_id,
    source, source_reference, occurred_at, created_by
  )
  values (
    p_chapter, p_kind, p_description, p_idempotency,
    nullif(p_refs ->> 'membership_id', '')::uuid,
    nullif(p_refs ->> 'member_assessment_id', '')::uuid,
    nullif(p_refs ->> 'payment_id', '')::uuid,
    nullif(p_refs ->> 'refund_id', '')::uuid,
    nullif(p_refs ->> 'dispute_id', '')::uuid,
    nullif(p_refs ->> 'payout_id', '')::uuid,
    p_source, p_refs ->> 'source_reference', p_occurred_at, auth.uid()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_txn;
  if v_txn is null then
    return null;
  end if;
  insert into public.ledger_entries (transaction_id, chapter_id, account, membership_id, member_assessment_id, amount_cents)
  select v_txn, p_chapter, (x ->> 'account')::public.ledger_account,
    nullif(x ->> 'membership_id', '')::uuid, nullif(x ->> 'member_assessment_id', '')::uuid, (x ->> 'amount')::bigint
  from jsonb_array_elements(p_entries) x
  where (x ->> 'amount')::bigint <> 0;
  return v_txn;
end;
$$;

revoke execute on function private.post_ledger(uuid, public.ledger_kind, text, text, jsonb, jsonb, text, timestamptz) from public, anon, authenticated;

create or replace function private.ma_outstanding(p_member_assessment uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.ledger_entries
  where member_assessment_id = p_member_assessment and account = 'member_receivable'
$$;

create or replace function private.ma_in_flight(p_member_assessment uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.payments
  where member_assessment_id = p_member_assessment and status = 'processing'
$$;

create or replace function private.refresh_member_assessment(p_member_assessment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assessments;
  v_out bigint;
  v_paid_total bigint;
  v_plan uuid;
  v_running bigint := 0;
  r record;
begin
  select * into v_ma from public.member_assessments where id = p_member_assessment for update;
  if v_ma.status = 'voided' then
    return;
  end if;
  v_out := private.ma_outstanding(p_member_assessment);
  update public.member_assessments
  set status = case when v_out <= 0 then 'paid' when v_out < amount_cents then 'partially_paid' else 'open' end
  where id = p_member_assessment;
  select id into v_plan from public.installment_plans where member_assessment_id = p_member_assessment and status = 'active';
  if v_plan is not null then
    select coalesce(-sum(e.amount_cents), 0) into v_paid_total
    from public.ledger_entries e
    where e.member_assessment_id = p_member_assessment and e.account = 'member_receivable' and e.amount_cents < 0;
    for r in select id, amount_cents, status from public.installments where plan_id = v_plan and status <> 'cancelled' order by sequence loop
      v_running := v_running + r.amount_cents;
      if v_running <= v_paid_total and r.status <> 'paid' then
        update public.installments set status = 'paid', paid_at = now() where id = r.id;
      elsif v_running > v_paid_total and r.status = 'paid' then
        update public.installments set status = 'scheduled', paid_at = null where id = r.id;
      end if;
    end loop;
    if v_out <= 0 then
      update public.installment_plans set status = 'completed' where id = v_plan;
    end if;
  end if;
end;
$$;

revoke execute on function private.refresh_member_assessment(uuid) from public, anon, authenticated;

create or replace function private.chapter_subscription_status(p_chapter uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.status from public.chapter_subscriptions s
    where s.chapter_id = p_chapter
    order by (s.status in ('active', 'trialing', 'past_due')) desc, s.updated_at desc
    limit 1
  ), 'none')
$$;

create or replace function private.chapter_can_collect(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chapters c
    join public.chapter_agreements a on a.chapter_id = c.id and a.superseded_at is null
    join public.connected_accounts ca on ca.chapter_id = c.id
    where c.id = p_chapter and c.status = 'verified' and c.pricing_rule_id is not null
      and ca.card_payments_status = 'active'
      and private.chapter_subscription_status(c.id) in ('active', 'trialing', 'past_due')
  )
$$;

create or replace function public.chapter_payment_readiness(p_chapter uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verified', c.status = 'verified',
    'terms_accepted', exists (select 1 from public.chapter_agreements a where a.chapter_id = c.id and a.superseded_at is null),
    'account_created', ca.id is not null,
    'card_payments', coalesce(ca.card_payments_status, 'not_started'),
    'payouts', coalesce(ca.payouts_status, 'not_started'),
    'requirements_due', coalesce(to_jsonb(ca.requirements_due), '[]'::jsonb),
    'subscription', private.chapter_subscription_status(c.id),
    'can_collect', private.chapter_can_collect(c.id)
  )
  from public.chapters c
  left join public.connected_accounts ca on ca.chapter_id = c.id
  where c.id = p_chapter and private.is_member(c.id)
$$;

revoke execute on function public.chapter_payment_readiness(uuid) from public, anon;
grant execute on function public.chapter_payment_readiness(uuid) to authenticated;

create or replace function public.accept_chapter_agreement(
  p_chapter uuid,
  p_terms uuid,
  p_signer_name text,
  p_signer_title text,
  p_ip text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.terms_documents;
  v_id uuid;
begin
  if not private.has_permission(p_chapter, 'chapter.ownership') then
    raise exception 'only a chapter administrator can accept the chapter agreement' using errcode = '42501';
  end if;
  select * into v_doc from public.terms_documents where id = p_terms and kind = 'chapter_agreement' and published_at is not null;
  if v_doc.id is null or v_doc.pricing_rule_id is null then
    raise exception 'agreement version not available' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pricing_rules where id = v_doc.pricing_rule_id and status = 'active') then
    raise exception 'the pricing in this agreement is no longer offered' using errcode = '22023';
  end if;
  update public.chapter_agreements set superseded_at = now() where chapter_id = p_chapter and superseded_at is null;
  insert into public.chapter_agreements (chapter_id, terms_document_id, pricing_rule_id, accepted_by, signer_name, signer_title, accepted_ip, accepted_user_agent)
  values (p_chapter, v_doc.id, v_doc.pricing_rule_id, auth.uid(), btrim(p_signer_name), btrim(p_signer_title), left(p_ip, 64), left(p_user_agent, 300))
  returning id into v_id;
  update public.chapters set pricing_rule_id = v_doc.pricing_rule_id where id = p_chapter;
  perform private.write_audit(p_chapter, 'agreement.accepted', 'chapter_agreement', v_id::text,
    jsonb_build_object('terms_version', v_doc.version, 'pricing_rule_id', v_doc.pricing_rule_id));
  return v_id;
end;
$$;

revoke execute on function public.accept_chapter_agreement(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.accept_chapter_agreement(uuid, uuid, text, text, text, text) to authenticated;

create or replace function public.issue_dues_assessment(p_assessment uuid, p_memberships uuid[], p_amount_overrides jsonb default '{}'::jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.dues_assessments;
  v_m uuid;
  v_amount bigint;
  v_ma uuid;
  v_count int := 0;
begin
  select * into v_a from public.dues_assessments where id = p_assessment for update;
  if v_a.id is null or not private.has_permission(v_a.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_a.status not in ('draft', 'issued') then
    raise exception 'assessment is closed' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_memberships), 0) = 0 then
    raise exception 'select at least one member' using errcode = '22023';
  end if;
  foreach v_m in array p_memberships loop
    if not exists (select 1 from public.memberships where id = v_m and chapter_id = v_a.chapter_id and status in ('active', 'inactive')) then
      raise exception 'member % is not in this chapter', v_m using errcode = '42501';
    end if;
    v_amount := coalesce((p_amount_overrides ->> v_m::text)::bigint, v_a.default_amount_cents);
    if v_amount < 50 then
      raise exception 'amount must be at least $0.50' using errcode = '22023';
    end if;
    insert into public.member_assessments (chapter_id, assessment_id, membership_id, amount_cents, due_date, issued_by)
    values (v_a.chapter_id, v_a.id, v_m, v_amount, v_a.due_date, auth.uid())
    on conflict (assessment_id, membership_id) do nothing
    returning id into v_ma;
    if v_ma is not null then
      perform private.post_ledger(
        v_a.chapter_id, 'assessment', v_a.title, 'assessment:' || v_ma::text,
        jsonb_build_array(
          jsonb_build_object('account', 'member_receivable', 'amount', v_amount, 'membership_id', v_m, 'member_assessment_id', v_ma),
          jsonb_build_object('account', 'dues_revenue', 'amount', -v_amount)
        ),
        jsonb_build_object('membership_id', v_m, 'member_assessment_id', v_ma)
      );
      perform private.notify(
        (select user_id from public.memberships where id = v_m), v_a.chapter_id, 'dues_assessed',
        'New balance: ' || v_a.title, 'Due ' || to_char(v_a.due_date, 'Mon DD, YYYY') || '. Open your billing page for details.',
        '/c/' || (select slug from public.chapters where id = v_a.chapter_id) || '/billing',
        'assessment:' || v_ma::text
      );
      v_count := v_count + 1;
    end if;
  end loop;
  update public.dues_assessments set status = 'issued', issued_at = coalesce(issued_at, now()) where id = v_a.id;
  perform private.write_audit(v_a.chapter_id, 'assessment.issued', 'dues_assessment', v_a.id::text, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

revoke execute on function public.issue_dues_assessment(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.issue_dues_assessment(uuid, uuid[], jsonb) to authenticated;

create or replace function public.void_member_assessment(p_member_assessment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assessments;
  v_out bigint;
begin
  select * into v_ma from public.member_assessments where id = p_member_assessment for update;
  if v_ma.id is null or not private.has_permission(v_ma.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if v_ma.status = 'voided' then
    return;
  end if;
  if exists (select 1 from public.payments where member_assessment_id = v_ma.id and status in ('pending', 'processing')) then
    raise exception 'wait for in-flight payments to settle before voiding' using errcode = '22023';
  end if;
  v_out := private.ma_outstanding(v_ma.id);
  if v_out > 0 then
    perform private.post_ledger(
      v_ma.chapter_id, 'assessment_void', 'Voided: ' || p_reason, 'void:' || v_ma.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'member_receivable', 'amount', -v_out, 'membership_id', v_ma.membership_id, 'member_assessment_id', v_ma.id),
        jsonb_build_object('account', 'dues_revenue', 'amount', v_out)
      ),
      jsonb_build_object('membership_id', v_ma.membership_id, 'member_assessment_id', v_ma.id)
    );
  end if;
  update public.member_assessments set status = 'voided' where id = v_ma.id;
  update public.installment_plans set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where member_assessment_id = v_ma.id and status = 'active';
  perform private.write_audit(v_ma.chapter_id, 'assessment.voided', 'member_assessment', v_ma.id::text,
    jsonb_build_object('reason', p_reason, 'outstanding_voided', v_out));
end;
$$;

revoke execute on function public.void_member_assessment(uuid, text) from public, anon;
grant execute on function public.void_member_assessment(uuid, text) to authenticated;

create or replace function public.issue_member_credit(p_member_assessment uuid, p_amount bigint, p_reason text, p_request_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assessments;
  v_txn uuid;
begin
  select * into v_ma from public.member_assessments where id = p_member_assessment for update;
  if v_ma.id is null or not private.has_permission(v_ma.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount <= 0 or p_amount > private.ma_outstanding(v_ma.id) then
    raise exception 'credit must be positive and no more than the outstanding balance' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m where m.id = v_ma.membership_id and m.user_id = auth.uid()) then
    raise exception 'you cannot credit your own balance' using errcode = '42501';
  end if;
  v_txn := private.post_ledger(
    v_ma.chapter_id, 'credit', 'Credit: ' || p_reason, 'credit:' || p_request_key,
    jsonb_build_array(
      jsonb_build_object('account', 'member_receivable', 'amount', -p_amount, 'membership_id', v_ma.membership_id, 'member_assessment_id', v_ma.id),
      jsonb_build_object('account', 'credits_issued', 'amount', p_amount)
    ),
    jsonb_build_object('membership_id', v_ma.membership_id, 'member_assessment_id', v_ma.id)
  );
  perform private.refresh_member_assessment(v_ma.id);
  perform private.write_audit(v_ma.chapter_id, 'credit.issued', 'member_assessment', v_ma.id::text,
    jsonb_build_object('amount_cents', p_amount, 'reason', p_reason));
  return v_txn;
end;
$$;

revoke execute on function public.issue_member_credit(uuid, bigint, text, text) from public, anon;
grant execute on function public.issue_member_credit(uuid, bigint, text, text) to authenticated;

create or replace function public.record_offline_payment(
  p_member_assessment uuid,
  p_amount bigint,
  p_method text,
  p_reference text,
  p_received_on date,
  p_memo text,
  p_request_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assessments;
  v_payment uuid;
  v_receipt text;
begin
  select * into v_ma from public.member_assessments where id = p_member_assessment for update;
  if v_ma.id is null or not private.has_permission(v_ma.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships m where m.id = v_ma.membership_id and m.user_id = auth.uid()) then
    raise exception 'another officer must record your own offline payment' using errcode = '42501';
  end if;
  if v_ma.status = 'voided' then
    raise exception 'assessment is voided' using errcode = '22023';
  end if;
  if p_method not in ('cash', 'check', 'external_app', 'other') then
    raise exception 'invalid offline method' using errcode = '22023';
  end if;
  if p_amount < 50 or p_amount > private.ma_outstanding(v_ma.id) then
    raise exception 'amount must be between $0.50 and the outstanding balance' using errcode = '22023';
  end if;
  if p_received_on is null or p_received_on > (now() at time zone (select timezone from public.chapters where id = v_ma.chapter_id))::date then
    raise exception 'received date cannot be in the future' using errcode = '22023';
  end if;
  insert into public.payments (
    chapter_id, membership_id, member_assessment_id, kind, method, status, amount_cents, platform_fee_cents,
    net_cents, offline_reference, received_on, memo, recorded_by, idempotency_key, succeeded_at, reconciliation_status
  )
  values (
    v_ma.chapter_id, v_ma.membership_id, v_ma.id, 'offline', p_method, 'succeeded', p_amount, 0,
    p_amount, nullif(btrim(p_reference), ''), p_received_on, nullif(btrim(p_memo), ''), auth.uid(), 'offline:' || p_request_key, now(), 'not_applicable'
  )
  on conflict (idempotency_key) do nothing
  returning id into v_payment;
  if v_payment is null then
    select id into v_payment from public.payments where idempotency_key = 'offline:' || p_request_key;
    return v_payment;
  end if;
  perform private.post_ledger(
    v_ma.chapter_id, 'offline_payment', 'Offline payment (' || p_method || ')', 'payment:' || v_payment::text,
    jsonb_build_array(
      jsonb_build_object('account', 'cash_on_hand', 'amount', p_amount),
      jsonb_build_object('account', 'member_receivable', 'amount', -p_amount, 'membership_id', v_ma.membership_id, 'member_assessment_id', v_ma.id)
    ),
    jsonb_build_object('membership_id', v_ma.membership_id, 'member_assessment_id', v_ma.id, 'payment_id', v_payment)
  );
  v_receipt := 'R-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
  insert into public.receipts (chapter_id, payment_id, membership_id, receipt_number, amount_cents, platform_fee_cents)
  values (v_ma.chapter_id, v_payment, v_ma.membership_id, v_receipt, p_amount, 0);
  perform private.refresh_member_assessment(v_ma.id);
  perform private.write_audit(v_ma.chapter_id, 'payment.offline_recorded', 'payment', v_payment::text,
    jsonb_build_object('amount_cents', p_amount, 'method', p_method));
  return v_payment;
end;
$$;

revoke execute on function public.record_offline_payment(uuid, bigint, text, text, date, text, text) from public, anon;
grant execute on function public.record_offline_payment(uuid, bigint, text, text, date, text, text) to authenticated;

create or replace function public.create_installment_plan(p_member_assessment uuid, p_schedule jsonb, p_consent_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assessments;
  v_a public.dues_assessments;
  v_out bigint;
  v_total bigint := 0;
  v_count int;
  v_plan uuid;
  v_prev date;
  v_is_owner boolean;
  i int := 0;
  x jsonb;
begin
  select * into v_ma from public.member_assessments where id = p_member_assessment for update;
  if v_ma.id is null then
    raise exception 'not found' using errcode = '22023';
  end if;
  select * into v_a from public.dues_assessments where id = v_ma.assessment_id;
  v_is_owner := exists (select 1 from public.memberships m where m.id = v_ma.membership_id and m.user_id = auth.uid() and m.status = 'active');
  if not v_is_owner and not private.has_permission(v_ma.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_is_owner and not v_a.allow_installments then
    raise exception 'this assessment does not allow installment plans' using errcode = '22023';
  end if;
  if exists (select 1 from public.installment_plans where member_assessment_id = v_ma.id and status = 'active') then
    raise exception 'an installment plan already exists' using errcode = '23505';
  end if;
  if exists (select 1 from public.payments where member_assessment_id = v_ma.id and status in ('pending', 'processing')) then
    raise exception 'wait for in-flight payments to settle' using errcode = '22023';
  end if;
  v_out := private.ma_outstanding(v_ma.id);
  if v_out <= 0 then
    raise exception 'nothing is owed on this assessment' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_schedule);
  if v_count < 2 or v_count > greatest(v_a.max_installments, case when v_is_owner then 0 else 12 end) then
    raise exception 'invalid number of installments' using errcode = '22023';
  end if;
  if coalesce(btrim(p_consent_text), '') = '' then
    raise exception 'consent is required' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_schedule) loop
    v_total := v_total + (x ->> 'amount_cents')::bigint;
    if (x ->> 'amount_cents')::bigint < 50 then
      raise exception 'each installment must be at least $0.50' using errcode = '22023';
    end if;
    if v_prev is not null and (x ->> 'due_date')::date <= v_prev then
      raise exception 'installment dates must be increasing' using errcode = '22023';
    end if;
    v_prev := (x ->> 'due_date')::date;
  end loop;
  if v_total <> v_out then
    raise exception 'installments must add up to the outstanding balance (% vs %)', v_total, v_out using errcode = '22023';
  end if;
  insert into public.installment_plans (chapter_id, member_assessment_id, total_cents, consent_text, consented_by)
  values (v_ma.chapter_id, v_ma.id, v_total, p_consent_text, auth.uid())
  returning id into v_plan;
  for x in select * from jsonb_array_elements(p_schedule) loop
    i := i + 1;
    insert into public.installments (chapter_id, plan_id, sequence, amount_cents, due_date)
    values (v_ma.chapter_id, v_plan, i, (x ->> 'amount_cents')::bigint, (x ->> 'due_date')::date);
  end loop;
  perform private.write_audit(v_ma.chapter_id, 'installment_plan.created', 'installment_plan', v_plan::text,
    jsonb_build_object('count', v_count, 'total_cents', v_total));
  return v_plan;
end;
$$;

revoke execute on function public.create_installment_plan(uuid, jsonb, text) from public, anon;
grant execute on function public.create_installment_plan(uuid, jsonb, text) to authenticated;

create or replace function public.cancel_installment_plan(p_plan uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.installment_plans;
  v_is_owner boolean;
begin
  select * into v_plan from public.installment_plans where id = p_plan for update;
  if v_plan.id is null then
    raise exception 'not found' using errcode = '22023';
  end if;
  v_is_owner := exists (
    select 1 from public.member_assessments ma join public.memberships m on m.id = ma.membership_id
    where ma.id = v_plan.member_assessment_id and m.user_id = auth.uid()
  );
  if not v_is_owner and not private.has_permission(v_plan.chapter_id, 'finance.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_plan.status <> 'active' then
    raise exception 'plan is not active' using errcode = '22023';
  end if;
  update public.installment_plans set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now() where id = v_plan.id;
  update public.installments set status = 'cancelled' where plan_id = v_plan.id and status = 'scheduled';
  perform private.write_audit(v_plan.chapter_id, 'installment_plan.cancelled', 'installment_plan', v_plan.id::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.cancel_installment_plan(uuid) from public, anon;
grant execute on function public.cancel_installment_plan(uuid) to authenticated;

create or replace function private.payment_transition_allowed(p_from public.payment_status, p_to public.payment_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'pending' then p_to in ('processing', 'succeeded', 'failed', 'canceled')
    when 'processing' then p_to in ('succeeded', 'failed', 'canceled')
    when 'canceled' then p_to in ('processing', 'succeeded')
    when 'failed' then p_to in ('succeeded')
    when 'succeeded' then p_to in ('partially_refunded', 'refunded', 'disputed')
    when 'partially_refunded' then p_to in ('refunded', 'disputed')
    when 'disputed' then p_to in ('succeeded', 'partially_refunded', 'refunded', 'dispute_lost')
    else false
  end
$$;

create or replace function private.guard_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() then
    raise exception 'payments are changed by the payment processor only' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if not private.payment_transition_allowed(old.status, new.status) then
      raise exception 'invalid payment transition % -> %', old.status, new.status using errcode = '22023';
    end if;
    if new.amount_cents is distinct from old.amount_cents
      or new.chapter_id is distinct from old.chapter_id
      or new.membership_id is distinct from old.membership_id
      or new.member_assessment_id is distinct from old.member_assessment_id
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'payment amounts and ownership are immutable' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function private.guard_payment_status();

create or replace function public.create_pending_payment(p_member_assessment uuid, p_installment uuid, p_amount bigint)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ma public.member_assessments;
  v_rule public.pricing_rules;
  v_ca public.connected_accounts;
  v_inst public.installments;
  v_out bigint;
  v_amount bigint;
  v_payment public.payments;
begin
  select * into v_ma from public.member_assessments where id = p_member_assessment for update;
  if v_ma.id is null or not exists (
    select 1 from public.memberships m where m.id = v_ma.membership_id and m.user_id = auth.uid() and m.status in ('active', 'inactive')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_ma.status in ('voided', 'paid') then
    raise exception 'nothing is due on this assessment' using errcode = '22023';
  end if;
  if not private.chapter_can_collect(v_ma.chapter_id) then
    raise exception 'this chapter is not accepting online payments yet' using errcode = '22023';
  end if;
  select r.* into v_rule from public.pricing_rules r join public.chapters c on c.pricing_rule_id = r.id where c.id = v_ma.chapter_id;
  select * into v_ca from public.connected_accounts where chapter_id = v_ma.chapter_id;
  v_out := private.ma_outstanding(v_ma.id) - private.ma_in_flight(v_ma.id);
  if v_out < 50 then
    raise exception 'a payment for this balance is already processing' using errcode = '22023';
  end if;
  if p_installment is not null then
    select i.* into v_inst from public.installments i
    join public.installment_plans p on p.id = i.plan_id and p.status = 'active'
    where i.id = p_installment and p.member_assessment_id = v_ma.id;
    if v_inst.id is null or v_inst.status <> 'scheduled' then
      raise exception 'installment is not payable' using errcode = '22023';
    end if;
    v_amount := least(v_inst.amount_cents, v_out);
  else
    v_amount := coalesce(p_amount, v_out);
  end if;
  if v_amount < 50 or v_amount > v_out then
    raise exception 'amount must be between $0.50 and the outstanding balance' using errcode = '22023';
  end if;
  update public.payments set status = 'canceled', failure_message = 'superseded by a newer checkout'
  where member_assessment_id = v_ma.id and status = 'pending' and payer_id = auth.uid();
  insert into public.payments (
    chapter_id, membership_id, payer_id, member_assessment_id, installment_id, kind, status, amount_cents,
    pricing_rule_id, platform_fee_bps, platform_fee_cents, stripe_account_id, livemode, idempotency_key
  )
  values (
    v_ma.chapter_id, v_ma.membership_id, auth.uid(), v_ma.id, v_inst.id, 'stripe', 'pending', v_amount,
    v_rule.id, v_rule.platform_fee_bps, private.calculate_platform_fee(v_amount, v_rule), v_ca.stripe_account_id, v_ca.livemode,
    'checkout:' || gen_random_uuid()::text
  )
  returning * into v_payment;
  return v_payment;
end;
$$;

revoke execute on function public.create_pending_payment(uuid, uuid, bigint) from public, anon;
grant execute on function public.create_pending_payment(uuid, uuid, bigint) to authenticated;

create or replace function public.service_attach_checkout_session(p_payment uuid, p_session text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set stripe_checkout_session_id = p_session where id = p_payment and status = 'pending' and stripe_checkout_session_id is null
$$;

create or replace function public.service_mark_payment_processing(p_payment uuid, p_payment_intent text, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
  set status = 'processing', processing_at = coalesce(processing_at, now()),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent),
      method = coalesce(nullif(p_method, ''), method)
  where id = p_payment and status in ('pending', 'canceled');
end;
$$;

create or replace function public.service_record_payment_failed(p_payment uuid, p_payment_intent text, p_code text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.id is null or v_p.status not in ('pending', 'processing') then
    return;
  end if;
  update public.payments
  set status = 'failed', failed_at = now(), failure_code = left(p_code, 80), failure_message = left(p_message, 300),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent)
  where id = v_p.id;
  if v_p.payer_id is not null then
    perform private.notify(v_p.payer_id, v_p.chapter_id, 'payment_failed', 'A payment did not go through',
      'Your bank or card issuer declined the payment. No funds were collected.',
      '/c/' || (select slug from public.chapters where id = v_p.chapter_id) || '/billing',
      'payment_failed:' || v_p.id::text);
  end if;
end;
$$;

create or replace function public.service_record_payment_canceled(p_payment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments set status = 'canceled' where id = p_payment and status = 'pending'
$$;

create or replace function public.service_record_payment_succeeded(
  p_payment uuid,
  p_payment_intent text,
  p_charge text,
  p_method text,
  p_amount_received bigint,
  p_application_fee_id text,
  p_application_fee_amount bigint,
  p_processing_fee bigint,
  p_balance_transaction text,
  p_event text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_slug text;
  v_receipt text;
  v_fee bigint;
  v_recon text := 'matched';
  v_note text;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.id is null then
    raise exception 'payment % not found', p_payment;
  end if;
  if v_p.status not in ('pending', 'processing', 'canceled', 'failed') then
    if p_processing_fee is not null and v_p.processing_fee_cents is null then
      perform public.service_record_processing_fee(v_p.id, p_processing_fee, p_balance_transaction);
    end if;
    return false;
  end if;
  if v_p.status in ('canceled', 'failed') then
    v_note := 'payment succeeded after being marked ' || v_p.status::text;
  end if;
  v_fee := coalesce(p_application_fee_amount, 0);
  if p_amount_received is distinct from v_p.amount_cents then
    v_recon := 'mismatch';
    v_note := concat_ws('; ', v_note, 'amount received ' || p_amount_received || ' differs from expected ' || v_p.amount_cents);
  end if;
  if v_fee <> v_p.platform_fee_cents then
    v_recon := 'mismatch';
    v_note := concat_ws('; ', v_note, 'application fee ' || v_fee || ' differs from expected ' || v_p.platform_fee_cents);
  end if;
  update public.payments
  set status = 'succeeded',
      succeeded_at = now(),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent),
      stripe_charge_id = coalesce(stripe_charge_id, p_charge),
      stripe_application_fee_id = p_application_fee_id,
      application_fee_cents = v_fee,
      processing_fee_cents = p_processing_fee,
      stripe_balance_transaction_id = p_balance_transaction,
      net_cents = case when p_processing_fee is null then null else v_p.amount_cents - v_fee - p_processing_fee end,
      method = coalesce(nullif(p_method, ''), method),
      failure_code = null,
      failure_message = null,
      reconciliation_status = v_recon,
      reconciliation_note = v_note
  where id = v_p.id;
  perform private.post_ledger(
    v_p.chapter_id, 'payment', 'Online payment', 'payment:' || v_p.id::text,
    jsonb_build_array(
      jsonb_build_object('account', 'stripe_balance', 'amount', v_p.amount_cents),
      jsonb_build_object('account', 'member_receivable', 'amount', -v_p.amount_cents, 'membership_id', v_p.membership_id, 'member_assessment_id', v_p.member_assessment_id)
    ),
    jsonb_build_object('membership_id', v_p.membership_id, 'member_assessment_id', v_p.member_assessment_id, 'payment_id', v_p.id, 'source_reference', p_event),
    'stripe_webhook'
  );
  if v_fee > 0 then
    perform private.post_ledger(
      v_p.chapter_id, 'platform_fee', 'Platform fee', 'platform_fee:' || v_p.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'platform_fees', 'amount', v_fee),
        jsonb_build_object('account', 'stripe_balance', 'amount', -v_fee)
      ),
      jsonb_build_object('payment_id', v_p.id, 'source_reference', p_application_fee_id),
      'stripe_webhook'
    );
  end if;
  if p_processing_fee is not null and p_processing_fee > 0 then
    perform private.post_ledger(
      v_p.chapter_id, 'processing_fee', 'Stripe processing fee', 'processing_fee:' || v_p.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'processing_fees', 'amount', p_processing_fee),
        jsonb_build_object('account', 'stripe_balance', 'amount', -p_processing_fee)
      ),
      jsonb_build_object('payment_id', v_p.id, 'source_reference', p_balance_transaction),
      'stripe_webhook'
    );
  end if;
  v_receipt := 'R-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
  insert into public.receipts (chapter_id, payment_id, membership_id, receipt_number, amount_cents, platform_fee_cents)
  values (v_p.chapter_id, v_p.id, v_p.membership_id, v_receipt, v_p.amount_cents, v_fee)
  on conflict (payment_id) do nothing;
  perform private.refresh_member_assessment(v_p.member_assessment_id);
  select slug into v_slug from public.chapters where id = v_p.chapter_id;
  perform private.notify(
    coalesce(v_p.payer_id, (select user_id from public.memberships where id = v_p.membership_id)), v_p.chapter_id, 'payment_receipt',
    'Payment received', 'Your receipt is ready.',
    '/c/' || v_slug || '/billing/payments/' || v_p.id::text,
    'payment_receipt:' || v_p.id::text
  );
  perform private.write_audit(v_p.chapter_id, 'payment.succeeded', 'payment', v_p.id::text,
    jsonb_build_object('amount_cents', v_p.amount_cents, 'application_fee_cents', v_fee, 'reconciliation', v_recon, 'event', p_event));
  return true;
end;
$$;

create or replace function public.service_record_processing_fee(p_payment uuid, p_processing_fee bigint, p_balance_transaction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.id is null or v_p.processing_fee_cents is not null or p_processing_fee is null then
    return;
  end if;
  update public.payments
  set processing_fee_cents = p_processing_fee,
      stripe_balance_transaction_id = coalesce(p_balance_transaction, stripe_balance_transaction_id),
      net_cents = amount_cents - coalesce(application_fee_cents, 0) - p_processing_fee
  where id = v_p.id;
  if p_processing_fee > 0 then
    perform private.post_ledger(
      v_p.chapter_id, 'processing_fee', 'Stripe processing fee', 'processing_fee:' || v_p.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'processing_fees', 'amount', p_processing_fee),
        jsonb_build_object('account', 'stripe_balance', 'amount', -p_processing_fee)
      ),
      jsonb_build_object('payment_id', v_p.id, 'source_reference', p_balance_transaction),
      'stripe_webhook'
    );
  end if;
end;
$$;

create or replace function public.request_refund(p_payment uuid, p_amount bigint, p_reason text)
returns public.refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_rule public.pricing_rules;
  v_pending bigint;
  v_fee_refund bigint := 0;
  v_refund public.refunds;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if v_p.id is null or not private.has_permission(v_p.chapter_id, 'finance.refund') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_p.kind <> 'stripe' then
    raise exception 'offline payments are refunded outside the platform' using errcode = '22023';
  end if;
  if v_p.status not in ('succeeded', 'partially_refunded') then
    raise exception 'payment is not refundable in its current state' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m where m.id = v_p.membership_id and m.user_id = auth.uid()) then
    raise exception 'another officer must refund your own payment' using errcode = '42501';
  end if;
  select coalesce(sum(amount_cents), 0) into v_pending from public.refunds where payment_id = v_p.id and status in ('pending', 'processing');
  if p_amount <= 0 or p_amount > v_p.amount_cents - v_p.refunded_cents - v_pending then
    raise exception 'refund exceeds the refundable amount' using errcode = '22023';
  end if;
  select * into v_rule from public.pricing_rules where id = v_p.pricing_rule_id;
  if v_rule.refund_policy = 'proportional' and coalesce(v_p.application_fee_cents, 0) > 0 then
    v_fee_refund := (coalesce(v_p.application_fee_cents, 0) * p_amount + v_p.amount_cents / 2) / v_p.amount_cents;
    v_fee_refund := least(v_fee_refund, coalesce(v_p.application_fee_cents, 0) - v_p.application_fee_refunded_cents);
  end if;
  insert into public.refunds (chapter_id, payment_id, amount_cents, expected_fee_refund_cents, reason, requested_by)
  values (v_p.chapter_id, v_p.id, p_amount, v_fee_refund, btrim(p_reason), auth.uid())
  returning * into v_refund;
  perform private.write_audit(v_p.chapter_id, 'refund.requested', 'refund', v_refund.id::text,
    jsonb_build_object('payment_id', v_p.id, 'amount_cents', p_amount, 'reason', p_reason));
  return v_refund;
end;
$$;

revoke execute on function public.request_refund(uuid, bigint, text) from public, anon;
grant execute on function public.request_refund(uuid, bigint, text) to authenticated;

create or replace function private.apply_refund_success(p_refund uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.refunds;
  v_p public.payments;
  v_total bigint;
begin
  select * into v_r from public.refunds where id = p_refund for update;
  select * into v_p from public.payments where id = v_r.payment_id for update;
  perform private.post_ledger(
    v_r.chapter_id, 'refund', 'Refund: ' || v_r.reason, 'refund:' || v_r.id::text,
    jsonb_build_array(
      jsonb_build_object('account', 'member_receivable', 'amount', v_r.amount_cents, 'membership_id', v_p.membership_id, 'member_assessment_id', v_p.member_assessment_id),
      jsonb_build_object('account', 'stripe_balance', 'amount', -v_r.amount_cents)
    ),
    jsonb_build_object('membership_id', v_p.membership_id, 'member_assessment_id', v_p.member_assessment_id, 'payment_id', v_p.id, 'refund_id', v_r.id, 'source_reference', p_event),
    'stripe_webhook'
  );
  select coalesce(sum(amount_cents), 0) into v_total from public.refunds where payment_id = v_p.id and status = 'succeeded';
  update public.payments
  set refunded_cents = least(v_total, amount_cents),
      status = case
        when status in ('disputed', 'dispute_lost') then status
        when v_total >= amount_cents then 'refunded'::public.payment_status
        else 'partially_refunded'::public.payment_status
      end
  where id = v_p.id;
  perform private.refresh_member_assessment(v_p.member_assessment_id);
  perform private.notify(
    coalesce(v_p.payer_id, (select user_id from public.memberships where id = v_p.membership_id)), v_p.chapter_id, 'payment_refunded',
    'A refund was issued', 'Refunds usually appear on your statement within 5 to 10 business days.',
    '/c/' || (select slug from public.chapters where id = v_p.chapter_id) || '/billing/payments/' || v_p.id::text,
    'refund:' || v_r.id::text
  );
end;
$$;

revoke execute on function private.apply_refund_success(uuid, text) from public, anon, authenticated;

create or replace function public.service_sync_refund(
  p_refund uuid,
  p_stripe_refund text,
  p_charge text,
  p_amount bigint,
  p_status text,
  p_failure_reason text,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.refunds;
  v_p public.payments;
  v_status text;
begin
  v_status := case p_status when 'succeeded' then 'succeeded' when 'failed' then 'failed' when 'canceled' then 'canceled' when 'pending' then 'processing' when 'requires_action' then 'processing' else 'processing' end;
  if p_refund is not null then
    select * into v_r from public.refunds where id = p_refund for update;
  end if;
  if v_r.id is null then
    select * into v_r from public.refunds where stripe_refund_id = p_stripe_refund for update;
  end if;
  if v_r.id is null then
    select * into v_p from public.payments where stripe_charge_id = p_charge;
    if v_p.id is null then
      raise exception 'no payment for charge %', p_charge;
    end if;
    insert into public.refunds (chapter_id, payment_id, amount_cents, reason, status, origin, stripe_refund_id)
    values (v_p.chapter_id, v_p.id, p_amount, 'Issued from the Stripe Dashboard', 'processing', 'stripe_dashboard', p_stripe_refund)
    on conflict (stripe_refund_id) do nothing;
    select * into v_r from public.refunds where stripe_refund_id = p_stripe_refund for update;
  end if;
  if v_r.status in ('succeeded', 'failed', 'canceled') and v_r.status = v_status then
    return;
  end if;
  if v_r.status = 'succeeded' then
    return;
  end if;
  update public.refunds
  set status = v_status,
      stripe_refund_id = coalesce(stripe_refund_id, p_stripe_refund),
      failure_reason = p_failure_reason,
      succeeded_at = case when v_status = 'succeeded' then now() else succeeded_at end,
      updated_at = now()
  where id = v_r.id;
  if v_status = 'succeeded' then
    perform private.apply_refund_success(v_r.id, p_event);
    perform private.write_audit(v_r.chapter_id, 'refund.succeeded', 'refund', v_r.id::text, jsonb_build_object('amount_cents', v_r.amount_cents));
  elsif v_status = 'failed' then
    perform private.write_audit(v_r.chapter_id, 'refund.failed', 'refund', v_r.id::text, jsonb_build_object('reason', p_failure_reason));
  end if;
end;
$$;

create or replace function public.service_record_application_fee_refund(p_fee_refund text, p_charge text, p_amount bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_txn uuid;
begin
  select * into v_p from public.payments where stripe_charge_id = p_charge for update;
  if v_p.id is null then
    raise exception 'no payment for charge %', p_charge;
  end if;
  v_txn := private.post_ledger(
    v_p.chapter_id, 'platform_fee_refund', 'Platform fee returned', 'fee_refund:' || p_fee_refund,
    jsonb_build_array(
      jsonb_build_object('account', 'stripe_balance', 'amount', p_amount),
      jsonb_build_object('account', 'platform_fees', 'amount', -p_amount)
    ),
    jsonb_build_object('payment_id', v_p.id, 'source_reference', p_fee_refund),
    'stripe_webhook'
  );
  if v_txn is not null then
    update public.payments set application_fee_refunded_cents = application_fee_refunded_cents + p_amount where id = v_p.id;
  end if;
end;
$$;

create or replace function public.service_sync_dispute(
  p_dispute text,
  p_charge text,
  p_amount bigint,
  p_status text,
  p_reason text,
  p_evidence_due timestamptz,
  p_balance_transactions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_d public.disputes;
  bt jsonb;
  v_amt bigint;
  v_fee bigint;
  v_total_fee bigint := 0;
  v_closed boolean := p_status in ('won', 'lost', 'warning_closed');
begin
  select * into v_p from public.payments where stripe_charge_id = p_charge for update;
  if v_p.id is null then
    raise exception 'no payment for charge %', p_charge;
  end if;
  insert into public.disputes (chapter_id, payment_id, stripe_dispute_id, amount_cents, reason, status, evidence_due_by)
  values (v_p.chapter_id, v_p.id, p_dispute, p_amount, p_reason, p_status, p_evidence_due)
  on conflict (stripe_dispute_id) do update set status = excluded.status, amount_cents = excluded.amount_cents, evidence_due_by = excluded.evidence_due_by, updated_at = now()
  returning * into v_d;
  for bt in select * from jsonb_array_elements(coalesce(p_balance_transactions, '[]'::jsonb)) loop
    v_amt := (bt ->> 'amount')::bigint;
    v_fee := coalesce((bt ->> 'fee')::bigint, 0);
    v_total_fee := v_total_fee + v_fee;
    if v_amt < 0 then
      perform private.post_ledger(
        v_p.chapter_id, 'dispute_withdrawal', 'Disputed funds withdrawn', 'dispute_bt:' || (bt ->> 'id'),
        jsonb_build_array(
          jsonb_build_object('account', 'disputed_funds', 'amount', -v_amt),
          jsonb_build_object('account', 'stripe_balance', 'amount', v_amt)
        ),
        jsonb_build_object('payment_id', v_p.id, 'dispute_id', v_d.id, 'source_reference', bt ->> 'id'),
        'stripe_webhook'
      );
    elsif v_amt > 0 then
      perform private.post_ledger(
        v_p.chapter_id, 'dispute_reinstatement', 'Disputed funds reinstated', 'dispute_bt:' || (bt ->> 'id'),
        jsonb_build_array(
          jsonb_build_object('account', 'stripe_balance', 'amount', v_amt),
          jsonb_build_object('account', 'disputed_funds', 'amount', -v_amt)
        ),
        jsonb_build_object('payment_id', v_p.id, 'dispute_id', v_d.id, 'source_reference', bt ->> 'id'),
        'stripe_webhook'
      );
    end if;
    if v_fee <> 0 then
      perform private.post_ledger(
        v_p.chapter_id, 'dispute_fee', 'Dispute fee', 'dispute_fee:' || (bt ->> 'id'),
        jsonb_build_array(
          jsonb_build_object('account', 'processing_fees', 'amount', v_fee),
          jsonb_build_object('account', 'stripe_balance', 'amount', -v_fee)
        ),
        jsonb_build_object('payment_id', v_p.id, 'dispute_id', v_d.id, 'source_reference', bt ->> 'id'),
        'stripe_webhook'
      );
    end if;
  end loop;
  update public.disputes set fee_cents = v_total_fee where id = v_d.id;
  if p_status = 'lost' then
    perform private.post_ledger(
      v_p.chapter_id, 'dispute_lost', 'Dispute lost; balance restored to member', 'dispute_lost:' || v_d.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'member_receivable', 'amount', p_amount, 'membership_id', v_p.membership_id, 'member_assessment_id', v_p.member_assessment_id),
        jsonb_build_object('account', 'disputed_funds', 'amount', -p_amount)
      ),
      jsonb_build_object('payment_id', v_p.id, 'dispute_id', v_d.id, 'membership_id', v_p.membership_id, 'member_assessment_id', v_p.member_assessment_id),
      'stripe_webhook'
    );
    update public.disputes set outcome = 'lost', closed_at = coalesce(closed_at, now()) where id = v_d.id;
    if v_p.status = 'disputed' then
      update public.payments set status = 'dispute_lost', disputed_cents = p_amount where id = v_p.id;
    end if;
    perform private.refresh_member_assessment(v_p.member_assessment_id);
  elsif p_status = 'won' or p_status = 'warning_closed' then
    update public.disputes set outcome = case when p_status = 'won' then 'won' else null end, closed_at = coalesce(closed_at, now()) where id = v_d.id;
    if v_p.status = 'disputed' then
      update public.payments
      set status = case when refunded_cents >= amount_cents then 'refunded'::public.payment_status when refunded_cents > 0 then 'partially_refunded'::public.payment_status else 'succeeded'::public.payment_status end,
          disputed_cents = 0
      where id = v_p.id;
    end if;
  elsif not v_closed and v_p.status in ('succeeded', 'partially_refunded') then
    update public.payments set status = 'disputed', disputed_cents = p_amount where id = v_p.id;
  end if;
  perform private.write_audit(v_p.chapter_id, 'dispute.synced', 'dispute', v_d.id::text, jsonb_build_object('status', p_status, 'amount_cents', p_amount));
end;
$$;

create or replace function public.service_sync_payout(
  p_account text,
  p_payout text,
  p_amount bigint,
  p_currency text,
  p_status text,
  p_arrival date,
  p_failure_code text,
  p_livemode boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter uuid;
  v_po public.payouts;
begin
  select chapter_id into v_chapter from public.connected_accounts where stripe_account_id = p_account;
  if v_chapter is null then
    return;
  end if;
  insert into public.payouts (chapter_id, stripe_payout_id, amount_cents, currency, status, arrival_date, failure_code, livemode)
  values (v_chapter, p_payout, p_amount, p_currency, p_status, p_arrival, p_failure_code, p_livemode)
  on conflict (stripe_payout_id) do update set status = excluded.status, arrival_date = excluded.arrival_date, failure_code = excluded.failure_code, updated_at = now()
  returning * into v_po;
  if p_status = 'paid' then
    perform private.post_ledger(v_chapter, 'payout', 'Payout to bank', 'payout_paid:' || p_payout,
      jsonb_build_array(
        jsonb_build_object('account', 'bank_deposits', 'amount', p_amount),
        jsonb_build_object('account', 'stripe_balance', 'amount', -p_amount)
      ),
      jsonb_build_object('payout_id', v_po.id, 'source_reference', p_payout), 'stripe_webhook');
  elsif p_status = 'failed' and exists (select 1 from public.ledger_transactions where idempotency_key = 'payout_paid:' || p_payout) then
    perform private.post_ledger(v_chapter, 'payout_reversal', 'Payout returned', 'payout_failed:' || p_payout,
      jsonb_build_array(
        jsonb_build_object('account', 'stripe_balance', 'amount', p_amount),
        jsonb_build_object('account', 'bank_deposits', 'amount', -p_amount)
      ),
      jsonb_build_object('payout_id', v_po.id, 'source_reference', p_payout), 'stripe_webhook');
  end if;
end;
$$;

create or replace function public.service_upsert_connected_account(
  p_chapter uuid,
  p_account text,
  p_livemode boolean,
  p_card_status text,
  p_ach_status text,
  p_payouts_status text,
  p_requirements_due text[],
  p_requirements_past_due text[],
  p_disabled_reason text,
  p_created_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.connected_accounts;
begin
  select * into v_existing from public.connected_accounts where stripe_account_id = p_account;
  if v_existing.id is not null and p_chapter is not null and v_existing.chapter_id <> p_chapter then
    raise exception 'account belongs to another chapter';
  end if;
  if v_existing.id is null then
    if p_chapter is null then
      return;
    end if;
    insert into public.connected_accounts (chapter_id, stripe_account_id, livemode, card_payments_status, ach_payments_status, payouts_status,
      requirements_due, requirements_past_due, disabled_reason, created_by, last_synced_at)
    values (p_chapter, p_account, p_livemode, coalesce(p_card_status, 'pending'), p_ach_status, coalesce(p_payouts_status, 'pending'),
      coalesce(p_requirements_due, '{}'), coalesce(p_requirements_past_due, '{}'), p_disabled_reason, p_created_by, now());
    perform private.write_audit(p_chapter, 'payments.account_created', 'connected_account', p_account, '{}'::jsonb);
    return;
  end if;
  update public.connected_accounts
  set card_payments_status = coalesce(p_card_status, card_payments_status),
      ach_payments_status = p_ach_status,
      payouts_status = coalesce(p_payouts_status, payouts_status),
      requirements_due = coalesce(p_requirements_due, '{}'),
      requirements_past_due = coalesce(p_requirements_past_due, '{}'),
      disabled_reason = p_disabled_reason,
      onboarding_completed_at = case when coalesce(p_card_status, card_payments_status) = 'active' then coalesce(onboarding_completed_at, now()) else onboarding_completed_at end,
      last_synced_at = now(),
      updated_at = now()
  where id = v_existing.id;
end;
$$;

create or replace function public.service_claim_stripe_event(p_id text, p_type text, p_account text, p_livemode boolean, p_api_version text, p_created timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  insert into public.stripe_events (id, type, account, livemode, api_version, stripe_created_at)
  values (p_id, p_type, p_account, p_livemode, p_api_version, p_created)
  on conflict (id) do nothing;
  select status into v_status from public.stripe_events where id = p_id for update;
  if v_status in ('processed', 'ignored') then
    return false;
  end if;
  if v_status = 'processing' and exists (select 1 from public.stripe_events where id = p_id and received_at > now() - interval '2 minutes' and attempts > 0) then
    return false;
  end if;
  update public.stripe_events set status = 'processing', attempts = attempts + 1 where id = p_id;
  return true;
end;
$$;

create or replace function public.service_complete_stripe_event(p_id text, p_status text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.stripe_events
  set status = p_status, last_error = left(p_error, 1000), processed_at = case when p_status in ('processed', 'ignored') then now() else processed_at end
  where id = p_id
$$;

create or replace function public.service_apply_late_fees()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select ma.id, ma.chapter_id, ma.membership_id, a.late_fee_cents, a.title
    from public.member_assessments ma
    join public.dues_assessments a on a.id = ma.assessment_id
    join public.chapters c on c.id = ma.chapter_id and c.status = 'verified'
    where ma.status in ('open', 'partially_paid') and ma.late_fee_applied_at is null and a.late_fee_cents > 0
      and ma.due_date + a.late_fee_grace_days < (now() at time zone c.timezone)::date
      and not exists (select 1 from public.installment_plans p where p.member_assessment_id = ma.id and p.status = 'active')
    for update of ma skip locked
  loop
    if private.ma_outstanding(r.id) > 0 then
      perform private.post_ledger(r.chapter_id, 'late_fee', 'Late fee: ' || r.title, 'late_fee:' || r.id::text,
        jsonb_build_array(
          jsonb_build_object('account', 'member_receivable', 'amount', r.late_fee_cents, 'membership_id', r.membership_id, 'member_assessment_id', r.id),
          jsonb_build_object('account', 'dues_revenue', 'amount', -r.late_fee_cents)
        ),
        jsonb_build_object('membership_id', r.membership_id, 'member_assessment_id', r.id), 'job');
      update public.member_assessments set late_fee_applied_at = now() where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.service_sync_subscription(
  p_chapter uuid,
  p_subscription text,
  p_customer text,
  p_status text,
  p_plan_code text,
  p_unit_amount bigint,
  p_interval text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chapter_subscriptions (chapter_id, plan_id, status, stripe_customer_id, stripe_subscription_id, unit_amount_cents, billing_interval, current_period_end, cancel_at_period_end)
  values (p_chapter, (select id from public.saas_plans where code = p_plan_code), p_status, p_customer, p_subscription, p_unit_amount, p_interval, p_period_end, p_cancel_at_period_end)
  on conflict (stripe_subscription_id) do update
  set status = excluded.status, unit_amount_cents = excluded.unit_amount_cents, billing_interval = excluded.billing_interval,
      current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
end;
$$;

create or replace function public.service_record_saas_invoice(p_subscription text, p_invoice text, p_amount_paid bigint, p_status text, p_paid_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.chapter_subscriptions;
begin
  select * into v_sub from public.chapter_subscriptions where stripe_subscription_id = p_subscription;
  insert into public.saas_invoices (chapter_id, subscription_id, stripe_invoice_id, amount_paid_cents, status, paid_at)
  values (v_sub.chapter_id, v_sub.id, p_invoice, p_amount_paid, p_status, p_paid_at)
  on conflict (stripe_invoice_id) do update set amount_paid_cents = excluded.amount_paid_cents, status = excluded.status, paid_at = excluded.paid_at;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.service_attach_checkout_session(uuid, text)',
    'public.service_mark_payment_processing(uuid, text, text)',
    'public.service_record_payment_failed(uuid, text, text, text)',
    'public.service_record_payment_canceled(uuid)',
    'public.service_record_payment_succeeded(uuid, text, text, text, bigint, text, bigint, bigint, text, text)',
    'public.service_record_processing_fee(uuid, bigint, text)',
    'public.service_sync_refund(uuid, text, text, bigint, text, text, text)',
    'public.service_record_application_fee_refund(text, text, bigint)',
    'public.service_sync_dispute(text, text, bigint, text, text, timestamptz, jsonb)',
    'public.service_sync_payout(text, text, bigint, text, text, date, text, boolean)',
    'public.service_upsert_connected_account(uuid, text, boolean, text, text, text, text[], text[], text, uuid)',
    'public.service_claim_stripe_event(text, text, text, boolean, text, timestamptz)',
    'public.service_complete_stripe_event(text, text, text)',
    'public.service_apply_late_fees()',
    'public.service_sync_subscription(uuid, text, text, text, text, bigint, text, timestamptz, boolean)',
    'public.service_record_saas_invoice(text, text, bigint, text, timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

create or replace function private.can_view_membership_finance(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.id = p_membership and (m.user_id = auth.uid() or private.has_permission(m.chapter_id, 'finance.view'))
  )
$$;

create or replace function public.member_balance(p_membership uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'balance_cents', coalesce((select sum(amount_cents) from public.ledger_entries where membership_id = p_membership and account = 'member_receivable'), 0),
    'processing_cents', coalesce((select sum(amount_cents) from public.payments where membership_id = p_membership and status = 'processing'), 0),
    'next_due_date', (select min(due_date) from public.member_assessments where membership_id = p_membership and status in ('open', 'partially_paid'))
  )
  where private.can_view_membership_finance(p_membership)
$$;

revoke execute on function public.member_balance(uuid) from public, anon;
grant execute on function public.member_balance(uuid) to authenticated;

create or replace view public.member_assessment_balances
with (security_invoker = true)
as
select
  ma.id,
  ma.chapter_id,
  ma.assessment_id,
  ma.membership_id,
  ma.amount_cents,
  ma.due_date,
  ma.status,
  ma.created_at,
  a.title,
  a.category,
  a.allow_installments,
  a.max_installments,
  coalesce((select sum(e.amount_cents) from public.ledger_entries e where e.member_assessment_id = ma.id and e.account = 'member_receivable'), 0)::bigint as outstanding_cents,
  coalesce((select sum(p.amount_cents) from public.payments p where p.member_assessment_id = ma.id and p.status = 'processing'), 0)::bigint as processing_cents
from public.member_assessments ma
join public.dues_assessments a on a.id = ma.assessment_id;

create or replace function public.chapter_financial_summary(p_chapter uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not private.has_permission(p_chapter, 'finance.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'assessed_cents', coalesce(sum(case when t.kind in ('assessment', 'late_fee') and e.account = 'member_receivable' then e.amount_cents end), 0),
    'voided_cents', coalesce(-sum(case when t.kind = 'assessment_void' and e.account = 'member_receivable' then e.amount_cents end), 0),
    'collected_online_cents', coalesce(sum(case when t.kind = 'payment' and e.account = 'stripe_balance' then e.amount_cents end), 0),
    'collected_offline_cents', coalesce(sum(case when t.kind = 'offline_payment' and e.account = 'cash_on_hand' then e.amount_cents end), 0),
    'credits_cents', coalesce(sum(case when t.kind = 'credit' and e.account = 'credits_issued' then e.amount_cents end), 0),
    'refunds_cents', coalesce(-sum(case when t.kind = 'refund' and e.account = 'stripe_balance' then e.amount_cents end), 0),
    'platform_fees_cents', coalesce(sum(case when e.account = 'platform_fees' then e.amount_cents end), 0),
    'processing_fees_cents', coalesce(sum(case when e.account = 'processing_fees' then e.amount_cents end), 0),
    'disputed_cents', coalesce(sum(case when e.account = 'disputed_funds' then e.amount_cents end), 0),
    'payouts_cents', coalesce(sum(case when e.account = 'bank_deposits' then e.amount_cents end), 0)
  ) into v
  from public.ledger_entries e
  join public.ledger_transactions t on t.id = e.transaction_id
  where e.chapter_id = p_chapter and t.occurred_at >= p_from and t.occurred_at < p_to;
  return v || jsonb_build_object(
    'outstanding_cents', coalesce((select sum(amount_cents) from public.ledger_entries where chapter_id = p_chapter and account = 'member_receivable'), 0),
    'stripe_balance_cents', coalesce((select sum(amount_cents) from public.ledger_entries where chapter_id = p_chapter and account = 'stripe_balance'), 0),
    'processing_cents', coalesce((select sum(amount_cents) from public.payments where chapter_id = p_chapter and status = 'processing'), 0),
    'failed_count', (select count(*) from public.payments where chapter_id = p_chapter and status = 'failed' and failed_at >= p_from and failed_at < p_to),
    'open_disputes', (select count(*) from public.disputes where chapter_id = p_chapter and closed_at is null),
    'members_with_balance', (select count(*) from (select membership_id from public.ledger_entries where chapter_id = p_chapter and account = 'member_receivable' group by membership_id having sum(amount_cents) > 0) x)
  );
end;
$$;

revoke execute on function public.chapter_financial_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.chapter_financial_summary(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.chapter_member_balances(p_chapter uuid)
returns table (membership_id uuid, user_id uuid, full_name text, display_name text, member_class public.member_class, status public.membership_status, balance_cents bigint, processing_cents bigint, overdue_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_chapter, 'finance.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select m.id, m.user_id, p.full_name, p.display_name, m.member_class, m.status,
    coalesce((select sum(e.amount_cents) from public.ledger_entries e where e.membership_id = m.id and e.account = 'member_receivable'), 0)::bigint,
    coalesce((select sum(py.amount_cents) from public.payments py where py.membership_id = m.id and py.status = 'processing'), 0)::bigint,
    coalesce((select sum(e.amount_cents) from public.ledger_entries e join public.member_assessments ma on ma.id = e.member_assessment_id
      where e.membership_id = m.id and e.account = 'member_receivable' and ma.due_date < current_date), 0)::bigint
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.chapter_id = p_chapter
  order by p.full_name, p.display_name;
end;
$$;

revoke execute on function public.chapter_member_balances(uuid) from public, anon;
grant execute on function public.chapter_member_balances(uuid) to authenticated;

create or replace function public.platform_revenue_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['finance']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'eligible_volume_cents', coalesce((select sum(amount_cents) from public.payments where kind = 'stripe' and succeeded_at >= p_from and succeeded_at < p_to and status <> 'pending'), 0),
    'platform_fees_cents', coalesce((select sum(application_fee_cents) from public.payments where kind = 'stripe' and succeeded_at >= p_from and succeeded_at < p_to), 0),
    'fee_refunds_cents', coalesce((select -sum(e.amount_cents) from public.ledger_entries e join public.ledger_transactions t on t.id = e.transaction_id
      where t.kind = 'platform_fee_refund' and e.account = 'platform_fees' and t.occurred_at >= p_from and t.occurred_at < p_to), 0),
    'refunded_volume_cents', coalesce((select sum(amount_cents) from public.refunds where status = 'succeeded' and succeeded_at >= p_from and succeeded_at < p_to), 0),
    'disputes_opened', (select count(*) from public.disputes where created_at >= p_from and created_at < p_to),
    'disputed_volume_cents', coalesce((select sum(amount_cents) from public.disputes where created_at >= p_from and created_at < p_to), 0),
    'payments_count', (select count(*) from public.payments where kind = 'stripe' and succeeded_at >= p_from and succeeded_at < p_to),
    'mismatches', (select count(*) from public.payments where reconciliation_status = 'mismatch'),
    'pending_processing_fee', (select count(*) from public.payments where kind = 'stripe' and status in ('succeeded', 'partially_refunded') and processing_fee_cents is null),
    'saas_revenue_cents', coalesce((select sum(amount_paid_cents) from public.saas_invoices where status = 'paid' and paid_at >= p_from and paid_at < p_to), 0),
    'active_subscriptions', (select count(*) from public.chapter_subscriptions where status in ('active', 'trialing')),
    'by_method', coalesce((select jsonb_object_agg(method, total) from (select method, sum(amount_cents) as total from public.payments where kind = 'stripe' and succeeded_at >= p_from and succeeded_at < p_to group by method) x), '{}'::jsonb),
    'by_chapter', coalesce((select jsonb_agg(row_to_json(x) order by x.fees_cents desc) from (
      select c.id as chapter_id, c.organization_name || coalesce(' — ' || c.designation, '') as chapter, u.name as university,
        sum(p.amount_cents) as volume_cents, sum(coalesce(p.application_fee_cents, 0)) as fees_cents, count(*) as payments
      from public.payments p join public.chapters c on c.id = p.chapter_id join public.universities u on u.id = c.university_id
      where p.kind = 'stripe' and p.succeeded_at >= p_from and p.succeeded_at < p_to
      group by c.id, c.organization_name, c.designation, u.name limit 200) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.platform_revenue_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_revenue_summary(timestamptz, timestamptz) to authenticated;

create or replace function public.platform_reconciliation_queue(p_limit int)
returns table (payment_id uuid, chapter text, status public.payment_status, amount_cents bigint, platform_fee_cents bigint, application_fee_cents bigint, processing_fee_cents bigint, reconciliation_status text, reconciliation_note text, stripe_payment_intent_id text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_staff(array['finance']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select p.id, c.organization_name || coalesce(' — ' || c.designation, ''), p.status, p.amount_cents, p.platform_fee_cents, p.application_fee_cents, p.processing_fee_cents,
    p.reconciliation_status, p.reconciliation_note, p.stripe_payment_intent_id, p.created_at
  from public.payments p join public.chapters c on c.id = p.chapter_id
  where p.kind = 'stripe' and (p.reconciliation_status = 'mismatch' or (p.status in ('succeeded', 'partially_refunded') and p.processing_fee_cents is null) or (p.status = 'processing' and p.processing_at < now() - interval '7 days'))
  order by p.created_at desc
  limit least(p_limit, 500);
end;
$$;

revoke execute on function public.platform_reconciliation_queue(int) from public, anon;
grant execute on function public.platform_reconciliation_queue(int) to authenticated;

create or replace function public.platform_publish_pricing_rule(
  p_code text,
  p_name text,
  p_bps int,
  p_fixed int,
  p_min int,
  p_max int,
  p_refund_policy text,
  p_make_default boolean,
  p_terms_version text,
  p_terms_title text,
  p_terms_summary text,
  p_terms_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
  v_rule uuid;
begin
  if not private.is_platform_staff(array['admin']::public.platform_staff_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.pricing_rules where code = p_code;
  if p_make_default then
    update public.pricing_rules set is_default = false where is_default and status = 'active';
  end if;
  insert into public.pricing_rules (code, version, name, platform_fee_bps, platform_fee_fixed_cents, min_fee_cents, max_fee_cents, refund_policy, status, is_default, effective_at, created_by)
  values (p_code, v_version, p_name, p_bps, coalesce(p_fixed, 0), p_min, p_max, p_refund_policy, 'active', p_make_default, now(), auth.uid())
  returning id into v_rule;
  insert into public.terms_documents (kind, version, title, summary, body, pricing_rule_id, published_at)
  values ('chapter_agreement', p_terms_version, p_terms_title, p_terms_summary, p_terms_body, v_rule, now());
  perform private.write_audit(null, 'pricing.published', 'pricing_rule', v_rule::text,
    jsonb_build_object('code', p_code, 'version', v_version, 'bps', p_bps, 'fixed', p_fixed, 'default', p_make_default));
  return v_rule;
end;
$$;

revoke execute on function public.platform_publish_pricing_rule(text, text, int, int, int, int, text, boolean, text, text, text, text) from public, anon;
grant execute on function public.platform_publish_pricing_rule(text, text, int, int, int, int, text, boolean, text, text, text, text) to authenticated;

alter table public.pricing_rules enable row level security;
alter table public.terms_documents enable row level security;
alter table public.chapter_agreements enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.academic_terms enable row level security;
alter table public.dues_assessments enable row level security;
alter table public.member_assessments enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.refunds enable row level security;
alter table public.disputes enable row level security;
alter table public.payouts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.stripe_events enable row level security;
alter table public.saas_plans enable row level security;
alter table public.chapter_subscriptions enable row level security;
alter table public.saas_invoices enable row level security;

create policy pricing_rules_read on public.pricing_rules for select to anon, authenticated using (status in ('active', 'retired'));
create policy terms_read on public.terms_documents for select to anon, authenticated using (published_at is not null);

create policy agreements_read on public.chapter_agreements for select to authenticated
  using (private.has_permission(chapter_id, 'chapter.manage') or private.has_permission(chapter_id, 'finance.view') or private.is_platform_staff(array['finance', 'support']::public.platform_staff_role[]));

create policy connected_accounts_read on public.connected_accounts for select to authenticated
  using (private.has_permission(chapter_id, 'payments.configure') or private.has_permission(chapter_id, 'finance.view') or private.is_platform_staff(array['finance', 'support']::public.platform_staff_role[]));

create policy academic_terms_read on public.academic_terms for select to authenticated using (private.is_member(chapter_id));
create policy academic_terms_write on public.academic_terms for all to authenticated
  using (private.has_permission(chapter_id, 'finance.manage')) with check (private.has_permission(chapter_id, 'finance.manage'));

create policy dues_assessments_read on public.dues_assessments for select to authenticated
  using (private.has_permission(chapter_id, 'finance.view') or exists (
    select 1 from public.member_assessments ma join public.memberships m on m.id = ma.membership_id
    where ma.assessment_id = dues_assessments.id and m.user_id = auth.uid()
  ));
create policy dues_assessments_insert on public.dues_assessments for insert to authenticated
  with check (private.has_permission(chapter_id, 'finance.manage') and created_by = auth.uid() and status = 'draft');
create policy dues_assessments_update on public.dues_assessments for update to authenticated
  using (private.has_permission(chapter_id, 'finance.manage'))
  with check (private.has_permission(chapter_id, 'finance.manage'));

create or replace function private.guard_assessment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_api_role() then
    if old.status <> 'draft' and (
      new.default_amount_cents is distinct from old.default_amount_cents
      or new.due_date is distinct from old.due_date
      or new.chapter_id is distinct from old.chapter_id
      or new.late_fee_cents is distinct from old.late_fee_cents
    ) then
      raise exception 'issued assessments cannot change amounts or dates; void and reissue instead' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (old.status = 'issued' and new.status = 'closed') and not (old.status = 'draft' and new.status = 'cancelled') then
      raise exception 'invalid assessment status change' using errcode = '42501';
    end if;
    if new.issued_at is distinct from old.issued_at or new.created_by is distinct from old.created_by then
      raise exception 'protected assessment fields' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger dues_assessments_guard before update on public.dues_assessments
  for each row execute function private.guard_assessment_update();

create policy member_assessments_read on public.member_assessments for select to authenticated
  using (private.can_view_membership_finance(membership_id));
create policy installment_plans_read on public.installment_plans for select to authenticated
  using (exists (select 1 from public.member_assessments ma where ma.id = member_assessment_id and private.can_view_membership_finance(ma.membership_id)));
create policy installments_read on public.installments for select to authenticated
  using (exists (select 1 from public.installment_plans p join public.member_assessments ma on ma.id = p.member_assessment_id
    where p.id = plan_id and private.can_view_membership_finance(ma.membership_id)));
create policy payments_read on public.payments for select to authenticated
  using (payer_id = auth.uid() or private.can_view_membership_finance(membership_id));
create policy receipts_read on public.receipts for select to authenticated
  using (private.can_view_membership_finance(membership_id));
create policy refunds_read on public.refunds for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and private.can_view_membership_finance(p.membership_id)));
create policy disputes_read on public.disputes for select to authenticated
  using (private.has_permission(chapter_id, 'finance.view'));
create policy payouts_read on public.payouts for select to authenticated
  using (private.has_permission(chapter_id, 'finance.view'));
create policy ledger_transactions_read on public.ledger_transactions for select to authenticated
  using (private.has_permission(chapter_id, 'finance.view') or (membership_id is not null and private.can_view_membership_finance(membership_id)));
create policy ledger_entries_read on public.ledger_entries for select to authenticated
  using (private.has_permission(chapter_id, 'finance.view') or (account = 'member_receivable' and private.can_view_membership_finance(membership_id)));
create policy saas_plans_read on public.saas_plans for select to anon, authenticated using (active);
create policy subscriptions_read on public.chapter_subscriptions for select to authenticated
  using (private.has_permission(chapter_id, 'chapter.manage') or private.has_permission(chapter_id, 'finance.view') or private.is_platform_staff(array['finance']::public.platform_staff_role[]));
create policy saas_invoices_read on public.saas_invoices for select to authenticated
  using (private.has_permission(chapter_id, 'chapter.manage') or private.has_permission(chapter_id, 'finance.view') or private.is_platform_staff(array['finance']::public.platform_staff_role[]));
