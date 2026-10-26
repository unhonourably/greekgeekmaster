create or replace function public.chapter_account_balances(p_chapter uuid)
returns table (account public.ledger_account, balance_cents bigint)
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
  select e.account, sum(e.amount_cents)::bigint
  from public.ledger_entries e
  where e.chapter_id = p_chapter
  group by e.account;
end;
$$;

revoke execute on function public.chapter_account_balances(uuid) from public, anon;
grant execute on function public.chapter_account_balances(uuid) to authenticated;

create or replace function public.chapter_monthly_collections(p_chapter uuid, p_months int)
returns table (month date, online_cents bigint, offline_cents bigint, platform_fee_cents bigint, processing_fee_cents bigint, refunds_cents bigint, payments_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not private.has_permission(p_chapter, 'finance.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select timezone into v_tz from public.chapters where id = p_chapter;
  return query
  with months as (
    select generate_series(
      date_trunc('month', (now() at time zone v_tz)) - make_interval(months => greatest(least(p_months, 36), 1) - 1),
      date_trunc('month', (now() at time zone v_tz)),
      interval '1 month'
    )::date as m
  ),
  entries as (
    select date_trunc('month', t.occurred_at at time zone v_tz)::date as m, t.kind, e.account, e.amount_cents, t.payment_id
    from public.ledger_entries e
    join public.ledger_transactions t on t.id = e.transaction_id
    where e.chapter_id = p_chapter
      and t.occurred_at >= (date_trunc('month', (now() at time zone v_tz)) - make_interval(months => greatest(least(p_months, 36), 1) - 1)) at time zone v_tz
  )
  select months.m,
    coalesce(sum(case when x.kind = 'payment' and x.account = 'stripe_balance' then x.amount_cents end), 0)::bigint,
    coalesce(sum(case when x.kind = 'offline_payment' and x.account = 'cash_on_hand' then x.amount_cents end), 0)::bigint,
    coalesce(sum(case when x.account = 'platform_fees' then x.amount_cents end), 0)::bigint,
    coalesce(sum(case when x.account = 'processing_fees' then x.amount_cents end), 0)::bigint,
    coalesce(-sum(case when x.kind = 'refund' and x.account = 'stripe_balance' then x.amount_cents end), 0)::bigint,
    count(distinct case when x.kind in ('payment', 'offline_payment') then x.payment_id end)::bigint
  from months
  left join entries x on x.m = months.m
  group by months.m
  order by months.m;
end;
$$;

revoke execute on function public.chapter_monthly_collections(uuid, int) from public, anon;
grant execute on function public.chapter_monthly_collections(uuid, int) to authenticated;
