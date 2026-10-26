"use client";

import { createContext, useContext, useId, useState, type FormEvent, type ReactNode } from "react";
import { Field, Input, Select, cx } from "@/components/ui";
import { calculatePlatformFee, feeBreakdown, formatBps, projectCollections, type PaymentMethodKind, type PricingRule } from "@/lib/fees";
import { ESTIMATE_DEFAULTS, type EstimateInput } from "@/lib/estimate";
import { formatCents, parseDollarsToCents } from "@/lib/money";

type Shared = { draft: EstimateInput; applied: EstimateInput; update: (patch: Partial<EstimateInput>) => void; apply: () => void };

const EstimateContext = createContext<Shared | null>(null);

function useEstimateState(initial: EstimateInput): Shared {
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  return {
    draft,
    applied,
    update: (patch) => {
      const next = { ...draft, ...patch };
      setDraft(next);
      setApplied(next);
    },
    apply: () => setApplied(draft),
  };
}

export function PricingEstimate({ initial = ESTIMATE_DEFAULTS, children }: { initial?: EstimateInput; children: ReactNode }) {
  const state = useEstimateState(initial);
  return <EstimateContext value={state}>{children}</EstimateContext>;
}

function useShared(initial: EstimateInput = ESTIMATE_DEFAULTS): Shared {
  const shared = useContext(EstimateContext);
  const local = useEstimateState(initial);
  return shared ?? local;
}

function validDues(dues: string): number | null {
  const cents = parseDollarsToCents(dues);
  return cents !== null && cents >= 50 && cents <= 10_000_000 ? cents : null;
}

function validMembers(members: string): number | null {
  const v = members.replace(/[,\s]/g, "");
  return /^\d{1,5}$/.test(v) && Number(v) <= 10_000 ? Number(v) : null;
}

export function DuesExample({ rule }: { rule: PricingRule }) {
  const { applied } = useShared();
  const cents = validDues(applied.dues);
  const b = cents === null ? null : feeBreakdown(cents, applied.method, rule);
  return (
    <div className="self-center rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-3 text-[13px] font-medium text-ink-2" aria-live="polite">
        How a {b ? formatCents(b.duesCents) : "dues"} {applied.method === "card" ? "card" : "bank"} payment works
      </div>
      <dl className="divide-y divide-line text-sm">
        <div className="flex justify-between px-5 py-3">
          <dt className="text-ink-2">Member pays</dt>
          <dd className="font-medium tnum">{b ? formatCents(b.memberPaysCents) : "—"}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-ink-2">Platform fee ({formatBps(rule.platformFeeBps)})</dt>
          <dd className="tnum">{b ? `−${formatCents(b.platformFeeCents)}` : "—"}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-ink-2">Stripe processing (estimate)</dt>
          <dd className="tnum">{b ? `−${formatCents(b.estimatedProcessingFeeCents)}` : "—"}</dd>
        </div>
        <div className="flex justify-between bg-canvas/60 px-5 py-3">
          <dt className="text-ink-2">Chapter receives (estimate)</dt>
          <dd className="font-medium tnum text-ink">{b ? formatCents(b.estimatedChapterNetCents) : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function FeeExamples({ rule, examples }: { rule: PricingRule; examples: number[] }) {
  const { applied } = useShared();
  const cents = validDues(applied.dues);
  const rows = cents !== null && !examples.includes(cents) ? [...examples, cents].sort((a, b) => a - b) : examples;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[12px] text-ink-3">
          <th className="pb-2 font-medium">Dues payment</th>
          <th className="pb-2 text-right font-medium">Platform fee</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line" aria-live="polite">
        {rows.map((amount) => (
          <tr key={amount} className={cx(amount === cents && "text-accent")}>
            <td className="py-2 tnum">
              {formatCents(amount)}
              {amount === cents ? <span className="ml-2 text-[12px] text-ink-3">Your dues</span> : null}
            </td>
            <td className="py-2 text-right tnum">{formatCents(calculatePlatformFee(amount, rule))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function estimate(input: EstimateInput, rule: PricingRule, subscriptionCents: number) {
  const duesCents = validDues(input.dues);
  const memberCount = validMembers(input.members);
  if (duesCents === null || memberCount === null) return null;
  const parts = Number(input.parts);
  const monthCount = Number(input.months);
  const base = Math.floor(duesCents / parts);
  const last = duesCents - base * (parts - 1);
  const regular = projectCollections(base, memberCount * (parts - 1), input.method, rule);
  const final = projectCollections(last, memberCount, input.method, rule);
  const subscription = subscriptionCents * monthCount;
  return {
    monthCount,
    gross: regular.grossCents + final.grossCents,
    platform: regular.platformFeeCents + final.platformFeeCents,
    processing: regular.estimatedProcessingFeeCents + final.estimatedProcessingFeeCents,
    subscription,
    net: regular.estimatedChapterNetCents + final.estimatedChapterNetCents - subscription,
    perMemberPlatform: Math.round((regular.platformFeeCents + final.platformFeeCents) / Math.max(memberCount, 1)),
  };
}

export function FeeCalculator({ rule, subscriptionCents, initial }: { rule: PricingRule; subscriptionCents: number; initial?: EstimateInput }) {
  const id = useId();
  const { draft, applied, update, apply } = useShared(initial);
  const duesCents = parseDollarsToCents(draft.dues);
  const duesError = duesCents === null ? "Enter an amount like 450 or 450.00" : duesCents < 50 ? "Minimum is $0.50" : duesCents > 10_000_000 ? "Maximum is $100,000" : undefined;
  const membersError = validMembers(draft.members) === null ? "Enter a whole number up to 10,000" : undefined;
  const result = estimate(applied, rule, subscriptionCents);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply();
    const params = new URLSearchParams(draft);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}#calculator`);
  }

  return (
    <form method="get" action="#calculator" onSubmit={onSubmit} className="grid gap-0 overflow-hidden rounded-lg border border-line bg-surface lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4 border-b border-line p-6 lg:border-b-0 lg:border-r">
        <Field label="Dues per member" htmlFor={`${id}-dues`} error={duesError}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-3">$</span>
            <Input id={`${id}-dues`} name="dues" inputMode="decimal" value={draft.dues} onChange={(e) => update({ dues: e.target.value })} className="pl-6 tnum" aria-invalid={Boolean(duesError)} />
          </div>
        </Field>
        <Field label="Members paying online" htmlFor={`${id}-members`} error={membersError}>
          <Input id={`${id}-members`} name="members" inputMode="numeric" value={draft.members} onChange={(e) => update({ members: e.target.value })} className="tnum" aria-invalid={Boolean(membersError)} />
        </Field>
        <Field label="Payment method" htmlFor={`${id}-method`} hint="Bank payments (ACH) cost less to process but take several business days to clear.">
          <Select id={`${id}-method`} name="method" value={draft.method} onChange={(e) => update({ method: e.target.value as PaymentMethodKind })}>
            <option value="card">Card</option>
            <option value="us_bank_account">US bank account (ACH)</option>
          </Select>
        </Field>
        <Field label="Paid in" htmlFor={`${id}-parts`} hint="Each installment is charged the platform fee on its own amount, so the total stays the same apart from rounding.">
          <Select id={`${id}-parts`} name="parts" value={draft.parts} onChange={(e) => update({ parts: e.target.value })}>
            <option value="1">One payment</option>
            <option value="2">2 installments</option>
            <option value="3">3 installments</option>
            <option value="4">4 installments</option>
          </Select>
        </Field>
        <Field label="Months in the term" htmlFor={`${id}-months`} hint={`The subscription is ${formatCents(subscriptionCents)} per month, billed to the chapter.`}>
          <Select id={`${id}-months`} name="months" value={draft.months} onChange={(e) => update({ months: e.target.value })}>
            <option value="1">1 month</option>
            <option value="4">4 months (semester)</option>
            <option value="5">5 months</option>
            <option value="9">9 months (academic year)</option>
            <option value="12">12 months</option>
          </Select>
        </Field>
      </div>
      <div className="p-6">
        <p className="text-[13px] font-medium text-ink-3">Estimated for the term</p>
        {result ? (
          <dl className="mt-3 divide-y divide-line text-sm" aria-live="polite">
            <Row label="Collected from members" value={formatCents(result.gross)} strong />
            <Row label="Platform fee" value={`−${formatCents(result.platform)}`} hint={`About ${formatCents(result.perMemberPlatform)} per member`} />
            <Row label="Stripe processing (estimate)" value={`−${formatCents(result.processing)}`} hint={applied.method === "card" ? "Based on 2.9% + 30¢ per card payment" : "Based on 0.8% per payment, capped at $5"} />
            <Row label="Subscription" value={`−${formatCents(result.subscription)}`} hint={`${formatCents(subscriptionCents)} × ${result.monthCount} ${result.monthCount === 1 ? "month" : "months"}, billed separately`} />
            <Row label="Estimated net to the chapter" value={formatCents(result.net)} strong />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink-3">Enter dues and member count to see an estimate.</p>
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
          Processing estimates use Stripe&apos;s published standard US pricing and may differ for your account, international cards, or special pricing. Your actual Stripe fees appear on each payment in your ledger.
        </p>
      </div>
    </form>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-2">
        {label}
        {hint ? <span className="block text-[12px] text-ink-3">{hint}</span> : null}
      </dt>
      <dd className={strong ? "font-semibold tnum text-ink" : "tnum text-ink"}>{value}</dd>
    </div>
  );
}
