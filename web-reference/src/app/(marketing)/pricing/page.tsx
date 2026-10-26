import type { Metadata } from "next";
import { Suspense } from "react";
import { Check, Minus } from "lucide-react";
import { ESTIMATE_DEFAULTS, readEstimateParams, type EstimateInput } from "@/lib/estimate";
import { FeeCalculator, FeeExamples, PricingEstimate } from "@/components/fee-calculator";
import { ButtonLink, TextLink } from "@/components/ui";
import { formatBps } from "@/lib/fees";
import { formatCents } from "@/lib/money";
import { getPublishedPricing } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage({ searchParams }: PageProps<"/pricing">) {
  return (
    <Suspense fallback={<Pricing initial={ESTIMATE_DEFAULTS} />}>
      <PricingWithParams searchParams={searchParams} />
    </Suspense>
  );
}

async function PricingWithParams({ searchParams }: { searchParams: PageProps<"/pricing">["searchParams"] }) {
  return <Pricing initial={readEstimateParams(await searchParams)} />;
}

async function Pricing({ initial }: { initial: EstimateInput }) {
  const { rule, plan } = await getPublishedPricing();
  const pct = formatBps(rule.platformFeeBps);
  const monthly = formatCents(plan.priceCents);
  const examples = [10_000, 25_000, 45_000, 80_000];

  return (
    <PricingEstimate initial={initial}>
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-4 text-lg text-ink-2">
          {monthly} per month for each chapter, plus {pct} of each dues payment a member completes online. No setup fee and no per-member charge.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface lg:col-span-1">
          <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
            <div className="p-6">
              <p className="text-[13px] font-medium text-ink-3">Subscription</p>
              <p className="mt-2 font-serif text-4xl font-semibold tnum">{monthly}</p>
              <p className="mt-1 text-sm text-ink-2">per chapter, per {plan.interval}</p>
            </div>
            <div className="p-6">
              <p className="text-[13px] font-medium text-ink-3">Platform fee</p>
              <p className="mt-2 font-serif text-4xl font-semibold tnum">{pct}</p>
              <p className="mt-1 text-sm text-ink-2">of online dues payments</p>
            </div>
          </div>
          <div className="p-6">
            <ul className="space-y-2.5 text-sm">
              {[...plan.features, "Card and US bank (ACH) payments", "Installment plans at no extra cost"].map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />{t}</li>
              ))}
            </ul>
            <ButtonLink href="/signup" className="mt-6 w-full">Register your chapter</ButtonLink>
            <p className="mt-3 text-[12px] text-ink-3">Billing starts when your administrator activates the subscription after verification. Cancel any time; access continues to the end of the paid month.</p>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface lg:col-span-2">
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-[15px] font-semibold">What the {pct} platform fee applies to</h2>
          </div>
          <div className="grid gap-x-8 gap-y-2 px-6 py-5 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-3">Platform fee applies</p>
              <ul className="space-y-2">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />Dues paid online by card</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />Dues paid online by bank transfer</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />Each installment, on its own amount</li>
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-3">No platform fee</p>
              <ul className="space-y-2">
                {["Cash, check, or other offline payments you record", "Credits, waivers, and adjustments", "Assessments that are never paid", "Failed or canceled payments", "Donations recorded in philanthropy tools"].map((t) => (
                  <li key={t} className="flex gap-2"><Minus className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-line px-6 py-4">
            <FeeExamples rule={rule} examples={examples} />
          </div>
        </div>
      </div>

      <section id="calculator" className="mt-16 scroll-mt-24">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Estimate your chapter&apos;s cost</h2>
        <p className="mt-2 text-sm text-ink-2">Adjust the numbers to match your chapter.</p>
        <div className="mt-6">
          <FeeCalculator rule={rule} subscriptionCents={plan.priceCents} />
        </div>
      </section>

      <section className="mt-16 grid gap-10 lg:grid-cols-2">
        {[
          ["How is the subscription billed?", `${monthly} is charged to the card your administrator adds, once a month in advance. It is billed to the chapter, never to individual members, and is separate from dues.`],
          ["Is the subscription required?", "Yes. Officers can look through setup before subscribing, but those steps cannot be changed until the chapter subscription is active. Online dues collection also stays off until Stripe is connected. If a later subscription payment fails, online collection pauses until it is paid, and your records stay available."],
          ["Who pays Stripe's processing fees?", "The chapter. Stripe deducts its processing fee from each dues payment before funds reach your Stripe balance. Members pay exactly the amount they owe; we do not add surcharges."],
          ["What happens when we refund a member?", rule.refundPolicy === "proportional" ? "We return the matching share of our platform fee automatically. Stripe does not return its processing fee on refunds. Subscription fees are not affected." : "The platform fee is not returned on refunds. Stripe does not return its processing fee either."],
          ["What about disputes?", "If a member disputes a payment with their bank, Stripe withdraws the amount and a dispute fee from your Stripe balance. The platform fee is not returned. You can respond to disputes in your Stripe Dashboard."],
          ["Can pricing change?", "Not without notice. Your administrator accepts a specific, versioned agreement, and any change to the subscription price or platform fee requires accepting a new version."],
        ].map(([q, a]) => (
          <div key={q}>
            <h3 className="text-[15px] font-semibold">{q}</h3>
            <p className="mt-1.5 text-sm text-ink-2">{a}</p>
          </div>
        ))}
      </section>

      <p className="mt-16 text-[13px] text-ink-3">
        Read the full <TextLink href="/legal/chapter-agreement">chapter services and pricing agreement</TextLink>.
      </p>
    </div>
    </PricingEstimate>
  );
}
