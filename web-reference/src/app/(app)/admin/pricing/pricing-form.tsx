"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { calculatePlatformFee } from "@/lib/fees";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

export function PricingForm({ action, initial }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; initial: { code: string; name: string; percent: string } }) {
  const [state, formAction] = useActionState(action, {});
  const [percent, setPercent] = useState(initial.percent);
  const [fixed, setFixed] = useState("");
  const e = state.fieldErrors ?? {};
  const bps = Math.round(Number(percent) * 100);
  const fixedCents = parseDollarsToCents(fixed || "0") ?? 0;
  const preview =
    Number.isFinite(bps) && bps >= 0 && bps <= 1000
      ? [5_000, 25_000, 60_000].map((a) => ({ amount: a, fee: calculatePlatformFee(a, { platformFeeBps: bps, platformFeeFixedCents: fixedCents, minFeeCents: null, maxFeeCents: null, refundPolicy: "proportional" }) }))
      : [];
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rule code" htmlFor="code" error={e.code} hint="Reusing a code publishes a new version of it.">
          <Input id="code" name="code" defaultValue={initial.code} maxLength={40} />
        </Field>
        <Field label="Name" htmlFor="name" error={e.name}>
          <Input id="name" name="name" defaultValue={initial.name} maxLength={120} />
        </Field>
        <Field label="Platform fee (%)" htmlFor="percent" error={e.percent}>
          <Input id="percent" name="percent" inputMode="decimal" value={percent} onChange={(ev) => setPercent(ev.target.value)} />
        </Field>
        <Field label="Fixed fee per payment ($)" htmlFor="fixed" error={e.fixed} hint="Optional, at most $5.00">
          <Input id="fixed" name="fixed" inputMode="decimal" value={fixed} onChange={(ev) => setFixed(ev.target.value)} />
        </Field>
        <Field label="Minimum fee ($)" htmlFor="min" error={e.min} hint="Optional">
          <Input id="min" name="min" inputMode="decimal" />
        </Field>
        <Field label="Maximum fee ($)" htmlFor="max" error={e.max} hint="Optional">
          <Input id="max" name="max" inputMode="decimal" />
        </Field>
        <Field label="On refunds" htmlFor="refund_policy">
          <Select id="refund_policy" name="refund_policy" defaultValue="proportional">
            <option value="proportional">Return the fee in proportion to the refund</option>
            <option value="none">Keep the fee</option>
          </Select>
        </Field>
      </div>
      {preview.length ? (
        <p className="text-[13px] text-ink-3">
          Preview: {preview.map((p) => `${formatCents(p.amount)} pays ${formatCents(p.fee)}`).join(" · ")}
        </p>
      ) : null}
      <fieldset className="space-y-4 border-t border-line pt-5">
        <legend className="text-sm font-medium text-ink">Chapter agreement</legend>
        <p className="text-[13px] text-ink-3">Chapters on this rule must accept this agreement version before they can collect dues again.</p>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Version" htmlFor="terms_version" error={e.terms_version}>
            <Input id="terms_version" name="terms_version" maxLength={40} placeholder="2026-11" />
          </Field>
          <Field label="Title" htmlFor="terms_title" error={e.terms_title}>
            <Input id="terms_title" name="terms_title" maxLength={160} defaultValue="Chapter payments agreement" />
          </Field>
        </div>
        <Field label="Summary of changes" htmlFor="terms_summary" error={e.terms_summary}>
          <Textarea id="terms_summary" name="terms_summary" maxLength={1000} className="min-h-16" />
        </Field>
        <Field label="Full agreement" htmlFor="terms_body" error={e.terms_body}>
          <Textarea id="terms_body" name="terms_body" maxLength={50000} className="min-h-48 font-mono text-[13px]" />
        </Field>
      </fieldset>
      <div className="space-y-2">
        <Checkbox name="make_default" label="Make this the default for new chapters" />
        <Checkbox name="confirm" label="I understand published rules cannot be edited, and existing chapters keep their current rule until they accept the new agreement." />
        {e.confirm ? <p className="text-[13px] text-danger">{e.confirm}</p> : null}
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Publishing">Publish pricing</SubmitButton>
      </div>
    </form>
  );
}
