import type { Metadata } from "next";
import Link from "next/link";
import { ChapterCosts } from "@/components/chapter-costs";
import { PeriodPicker } from "@/components/period-picker";
import { Badge, Card, CardHeader, Money, Notice, Stat, StatGrid, Table, Td, TextLink, Th, Tr, ButtonLink } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { getChapterPricing } from "@/lib/chapter-pricing";
import { formatBps } from "@/lib/fees";
import { formatCents } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/payment-state";
import { parsePeriod, periodRange } from "@/lib/periods";
import { getReadiness, SUBSCRIPTION_STATUS_LABEL, subscriptionInGoodStanding } from "@/lib/readiness";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Finances" };

type Summary = Record<
  | "assessed_cents"
  | "voided_cents"
  | "collected_online_cents"
  | "collected_offline_cents"
  | "credits_cents"
  | "refunds_cents"
  | "platform_fees_cents"
  | "processing_fees_cents"
  | "disputed_cents"
  | "payouts_cents"
  | "outstanding_cents"
  | "stripe_balance_cents"
  | "processing_cents"
  | "failed_count"
  | "open_disputes"
  | "members_with_balance",
  number
>;

export default async function FinancesOverview({ params, searchParams }: PageProps<"/c/[slug]/finances">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter, can } = await requireChapter(slug, "finance.view");
  const base = `/c/${chapter.slug}/finances`;
  const period = parsePeriod(sp.period);
  const { from, to } = periodRange(period);
  const supabase = await createClient();

  const [{ data: summaryData, error }, readiness, pricing, { data: invoices }, { data: recent }, { data: balances }] = await Promise.all([
    supabase.rpc("chapter_financial_summary", { p_chapter: chapter.id, p_from: from.toISOString(), p_to: to.toISOString() }),
    getReadiness(chapter.id),
    getChapterPricing(chapter.id),
    supabase.from("saas_invoices").select("amount_paid_cents, status, paid_at").eq("chapter_id", chapter.id).eq("status", "paid").gte("paid_at", from.toISOString()).lt("paid_at", to.toISOString()),
    supabase
      .from("payments")
      .select("id, kind, method, status, amount_cents, platform_fee_cents, processing_fee_cents, created_at, membership:memberships(user:profiles!memberships_user_id_fkey(full_name, display_name))")
      .eq("chapter_id", chapter.id)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.rpc("chapter_member_balances", { p_chapter: chapter.id }),
  ]);
  if (error) return <Notice tone="danger">Could not load the financial summary.</Notice>;
  const s = summaryData as Summary;
  const collected = Number(s.collected_online_cents) + Number(s.collected_offline_cents);
  const subscriptionPaid = (invoices ?? []).reduce((sum, i) => sum + Number(i.amount_paid_cents), 0);
  const platformFees = Math.abs(Number(s.platform_fees_cents));
  const processingFees = Math.abs(Number(s.processing_fees_cents));
  const totalCost = platformFees + processingFees + subscriptionPaid;
  const net = collected - platformFees - processingFees - Number(s.refunds_cents);
  const subStatus = readiness?.subscription ?? "none";
  const topBalances = ((balances ?? []) as Array<{ membership_id: string; full_name: string; display_name: string; balance_cents: number; overdue_cents: number }>)
    .filter((b) => Number(b.balance_cents) > 0)
    .sort((a, b) => Number(b.balance_cents) - Number(a.balance_cents))
    .slice(0, 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: chapter.timezone });

  return (
    <div className="space-y-6">
      {!readiness?.can_collect ? (
        <Notice
          tone="info"
          title="Online dues collection is off"
          action={can("chapter.manage") || can("payments.configure") ? <ButtonLink href={`/c/${chapter.slug}/settings/billing`} size="sm" variant="secondary">Finish setup</ButtonLink> : undefined}
        >
          {!readiness?.terms_accepted
            ? "The chapter agreement has not been accepted."
            : !subscriptionInGoodStanding(subStatus)
              ? `The ${formatCents(pricing.plan.priceCents)} monthly subscription is ${SUBSCRIPTION_STATUS_LABEL[subStatus]?.toLowerCase() ?? subStatus}.`
              : "Stripe setup is incomplete."}{" "}
          You can still issue assessments and record cash or check payments.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker current={period} href={(k) => `${base}?period=${k}`} />
        {Number(s.open_disputes) > 0 ? <Badge tone="danger">{s.open_disputes} open dispute{Number(s.open_disputes) === 1 ? "" : "s"}</Badge> : null}
      </div>

      <StatGrid>
        <Stat label="Outstanding now" value={<Money cents={Number(s.outstanding_cents)} />} hint={`${s.members_with_balance} members owe dues`} tone={Number(s.outstanding_cents) > 0 ? "warning" : undefined} />
        <Stat label="Collected" value={<Money cents={collected} />} hint={`${formatCents(Number(s.collected_online_cents))} online, ${formatCents(Number(s.collected_offline_cents))} offline`} />
        <Stat label="Clearing" value={<Money cents={Number(s.processing_cents)} />} hint="Bank payments in progress" />
        <Stat label="Net received" value={<Money cents={net} />} hint="After fees and refunds" tone="positive" />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Cost of collection" description="What the chapter paid to use GreekGeek and Stripe in this period." />
            <Table>
              <tbody>
                <Tr>
                  <Td>
                    <span className="font-medium">GreekGeek subscription</span>
                    <span className="block text-[12px] text-ink-3">{formatCents(pricing.plan.priceCents)} per month, billed to the chapter card</span>
                  </Td>
                  <Td align="right"><Money cents={subscriptionPaid} /></Td>
                </Tr>
                <Tr>
                  <Td>
                    <span className="font-medium">Platform fees</span>
                    <span className="block text-[12px] text-ink-3">{formatBps(pricing.rule.platformFeeBps)} of online dues, net of refunded fees</span>
                  </Td>
                  <Td align="right"><Money cents={platformFees} /></Td>
                </Tr>
                <Tr>
                  <Td>
                    <span className="font-medium">Stripe processing fees</span>
                    <span className="block text-[12px] text-ink-3">Actual fees reported by Stripe</span>
                  </Td>
                  <Td align="right"><Money cents={processingFees} /></Td>
                </Tr>
                <tr className="bg-canvas/60">
                  <Td className="font-semibold">Total cost</Td>
                  <Td align="right" className="font-semibold"><Money cents={totalCost} /></Td>
                </tr>
                {collected > 0 ? (
                  <tr>
                    <Td className="text-[13px] text-ink-3">Share of dues collected</Td>
                    <Td align="right" className="text-[13px] text-ink-3">{((totalCost / collected) * 100).toFixed(1)}%</Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Activity in this period" />
            <Table>
              <tbody>
                {[
                  ["Dues assessed", Number(s.assessed_cents)],
                  ["Assessments voided", -Number(s.voided_cents)],
                  ["Credits issued", -Math.abs(Number(s.credits_cents))],
                  ["Refunds", -Number(s.refunds_cents)],
                  ["Disputed", -Math.abs(Number(s.disputed_cents))],
                  ["Paid out to bank", Math.abs(Number(s.payouts_cents))],
                ].map(([label, cents]) => (
                  <Tr key={label as string}>
                    <Td>{label}</Td>
                    <Td align="right"><Money cents={cents as number} /></Td>
                  </Tr>
                ))}
                <Tr>
                  <Td>Failed payments</Td>
                  <Td align="right">{s.failed_count}</Td>
                </Tr>
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Recent payments" actions={<TextLink href={`${base}/payments`} className="text-[13px]">All payments</TextLink>} />
            {(recent ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-3">No payments yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Member</Th>
                    <Th>Method</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {(recent ?? []).map((p) => {
                    const m = p.membership as unknown as { user: { full_name: string; display_name: string } | null } | null;
                    return (
                      <Tr key={p.id}>
                        <Td className="whitespace-nowrap text-ink-2">{fmt.format(new Date(p.created_at))}</Td>
                        <Td>
                          <Link href={`${base}/payments/${p.id}`} className="hover:underline">{m?.user?.full_name || m?.user?.display_name || "Member"}</Link>
                        </Td>
                        <Td className="text-ink-2">{p.kind === "offline" ? `Offline (${p.method})` : p.method === "us_bank_account" ? "Bank" : "Card"}</Td>
                        <Td><Badge tone={p.status === "succeeded" ? "positive" : p.status === "processing" ? "info" : p.status === "failed" || p.status === "dispute_lost" ? "danger" : "neutral"}>{PAYMENT_STATUS_LABEL[p.status as keyof typeof PAYMENT_STATUS_LABEL] ?? p.status}</Badge></Td>
                        <Td align="right"><Money cents={Number(p.amount_cents)} /></Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <ChapterCosts
            plan={pricing.plan}
            rule={pricing.rule}
            subscriptionStatus={SUBSCRIPTION_STATUS_LABEL[subStatus] ?? subStatus}
            subscriptionTone={subscriptionInGoodStanding(subStatus) ? (subStatus === "past_due" ? "warning" : "positive") : "neutral"}
          />
          <Card>
            <CardHeader title="Largest balances" actions={<TextLink href={`${base}/members`} className="text-[13px]">All members</TextLink>} />
            {topBalances.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-3">Nobody owes dues right now.</p>
            ) : (
              <ul className="divide-y divide-line">
                {topBalances.map((b) => (
                  <li key={b.membership_id}>
                    <Link href={`${base}/members/${b.membership_id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-canvas/60">
                      <span className="truncate text-ink">{b.full_name || b.display_name}</span>
                      <span className="flex items-center gap-2">
                        {Number(b.overdue_cents) > 0 ? <Badge tone="danger">Overdue</Badge> : null}
                        <Money cents={Number(b.balance_cents)} className="font-medium" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
