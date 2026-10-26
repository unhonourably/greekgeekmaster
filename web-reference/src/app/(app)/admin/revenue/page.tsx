import { Card, CardHeader, Money, Notice, PageHeader, Stat, StatGrid, Table, Td, Th, Tr } from "@/components/ui";
import { PeriodPicker } from "@/components/period-picker";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/format";
import { parsePeriod, periodRange } from "@/lib/periods";

type Summary = {
  eligible_volume_cents: number;
  platform_fees_cents: number;
  fee_refunds_cents: number;
  refunded_volume_cents: number;
  disputes_opened: number;
  disputed_volume_cents: number;
  payments_count: number;
  mismatches: number;
  pending_processing_fee: number;
  saas_revenue_cents: number;
  active_subscriptions: number;
  by_method: Record<string, number>;
  by_chapter: Array<{ chapter_id: string; chapter: string; university: string; volume_cents: number; fees_cents: number; payments: number }>;
};

const METHOD_LABEL: Record<string, string> = { card: "Card", us_bank_account: "Bank account (ACH)" };

export default async function RevenuePage({ searchParams }: PageProps<"/admin/revenue">) {
  await requireStaff(["finance"]);
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const { from, to } = periodRange(period, new Date(requestTime()));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_revenue_summary", { p_from: from.toISOString(), p_to: to.toISOString() });
  const s = (data ?? null) as Summary | null;
  const n = (v: number | undefined) => Number(v ?? 0);
  const netFees = s ? n(s.platform_fees_cents) - n(s.fee_refunds_cents) : 0;
  const total = s ? netFees + n(s.saas_revenue_cents) : 0;

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Platform income has two sources: the $30 monthly chapter subscription and the platform fee on dues paid online."
        actions={<PeriodPicker current={period} href={(k) => `/admin/revenue?period=${k}`} />}
      />
      {error || !s ? (
        <Notice tone="danger">Revenue could not be loaded.</Notice>
      ) : (
        <div className="space-y-6">
          <StatGrid>
            <Stat label="Total platform revenue" value={<Money cents={total} />} hint="Subscriptions plus net platform fees" />
            <Stat label="Subscription revenue" value={<Money cents={n(s.saas_revenue_cents)} />} hint={`${n(s.active_subscriptions)} active subscriptions now`} />
            <Stat label="Net platform fees" value={<Money cents={netFees} />} hint={n(s.fee_refunds_cents) ? <>After <Money cents={n(s.fee_refunds_cents)} /> returned on refunds</> : "No fee refunds"} />
            <Stat label="Dues volume" value={<Money cents={n(s.eligible_volume_cents)} />} hint={`${n(s.payments_count)} online payments`} />
          </StatGrid>
          <StatGrid>
            <Stat label="Refunded volume" value={<Money cents={n(s.refunded_volume_cents)} />} />
            <Stat label="Disputes opened" value={n(s.disputes_opened)} hint={<Money cents={n(s.disputed_volume_cents)} />} tone={n(s.disputes_opened) ? "warning" : undefined} />
            <Stat label="Reconciliation mismatches" value={n(s.mismatches)} tone={n(s.mismatches) ? "danger" : undefined} hint="All time" />
            <Stat label="Awaiting processing fee" value={n(s.pending_processing_fee)} hint="Stripe balance transaction not synced" />
          </StatGrid>
          <p className="text-[13px] text-ink-3">
            Stripe processing fees are paid by each chapter from its own connected account and are not platform revenue. Dues volume belongs to chapters; only the platform fee is retained.
          </p>
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <Card>
              <CardHeader title="By chapter" description="Top chapters by platform fees in this period" />
              {s.by_chapter.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Chapter</Th>
                      <Th align="right">Payments</Th>
                      <Th align="right">Volume</Th>
                      <Th align="right">Fees</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.by_chapter.map((c) => (
                      <Tr key={c.chapter_id}>
                        <Td>
                          <span className="block">{c.chapter}</span>
                          <span className="block text-[12px] text-ink-3">{c.university}</span>
                        </Td>
                        <Td align="right">{c.payments}</Td>
                        <Td align="right"><Money cents={n(c.volume_cents)} /></Td>
                        <Td align="right"><Money cents={n(c.fees_cents)} /></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="px-5 py-6 text-sm text-ink-3">No online dues payments in this period.</p>
              )}
            </Card>
            <Card className="h-fit">
              <CardHeader title="By payment method" />
              <ul className="divide-y divide-line">
                {Object.entries(s.by_method).length ? (
                  Object.entries(s.by_method).map(([m, v]) => (
                    <li key={m} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-ink-2">{METHOD_LABEL[m] ?? m}</span>
                      <Money cents={n(v)} />
                    </li>
                  ))
                ) : (
                  <li className="px-5 py-4 text-sm text-ink-3">None</li>
                )}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
