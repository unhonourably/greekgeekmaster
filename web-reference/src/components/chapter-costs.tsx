import { Building2, Percent, Receipt, UserRound } from "lucide-react";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui";
import { calculatePlatformFee, estimateProcessingFee, formatBps, type PricingRule } from "@/lib/fees";
import { formatCents } from "@/lib/money";
import type { SubscriptionPlan } from "@/lib/pricing";

export function ChapterCosts({
  plan,
  rule,
  subscriptionStatus,
  subscriptionTone,
  exampleCents = 45_000,
  footer,
}: {
  plan: SubscriptionPlan;
  rule: PricingRule;
  subscriptionStatus?: string;
  subscriptionTone?: Tone;
  exampleCents?: number;
  footer?: React.ReactNode;
}) {
  const fee = calculatePlatformFee(exampleCents, rule);
  const card = estimateProcessingFee(exampleCents, "card");
  const ach = estimateProcessingFee(exampleCents, "us_bank_account");
  const rows: Array<{ icon: typeof Building2; title: string; amount: string; who: string; detail: string; badge?: React.ReactNode }> = [
    {
      icon: Building2,
      title: "GreekGeek subscription",
      amount: `${formatCents(plan.priceCents)} / ${plan.interval}`,
      who: "Billed to the chapter",
      detail: "Charged to the card your administrator adds, once a month in advance. Separate from dues and never charged to members.",
      badge: subscriptionStatus ? <Badge tone={subscriptionTone ?? "neutral"}>{subscriptionStatus}</Badge> : undefined,
    },
    {
      icon: Percent,
      title: "Platform fee",
      amount: `${formatBps(rule.platformFeeBps)} per online payment`,
      who: "Deducted from each payment",
      detail: `Only on dues members pay online. On a ${formatCents(exampleCents)} payment the fee is ${formatCents(fee)}. Cash, checks, credits, and unpaid dues have no fee.`,
    },
    {
      icon: Receipt,
      title: "Stripe processing",
      amount: "Set by Stripe",
      who: "Deducted from each payment",
      detail: `Estimated ${formatCents(card)} by card or ${formatCents(ach)} by bank transfer on ${formatCents(exampleCents)}. The exact amount appears on each payment.`,
    },
    {
      icon: UserRound,
      title: "Members pay",
      amount: "Exactly what they owe",
      who: "No surcharges",
      detail: "Members never see platform or processing fees added to their balance.",
    },
  ];
  return (
    <Card>
      <CardHeader title="What your chapter pays" description="Every cost of using GreekGeek, in one place." />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.title} className="grid gap-x-4 gap-y-1 px-5 py-4 sm:grid-cols-[220px_1fr]">
            <div className="flex items-start gap-3">
              <r.icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {r.title}
                  {r.badge}
                </p>
                <p className="text-[12px] text-ink-3">{r.who}</p>
              </div>
            </div>
            <div className="pl-7 sm:pl-0">
              <p className="text-sm font-semibold text-ink tnum">{r.amount}</p>
              <p className="text-[13px] text-ink-2">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t border-line px-5 py-3 text-[13px] text-ink-3">{footer}</div> : null}
    </Card>
  );
}
