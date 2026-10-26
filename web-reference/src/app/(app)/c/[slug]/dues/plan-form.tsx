"use client";

import { useActionState, useMemo, useState } from "react";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";
import { formatCents } from "@/lib/money";
import { splitIntoInstallments } from "@/lib/installments";

export function PlanForm({
  action,
  memberAssessmentId,
  outstanding,
  max,
  today,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  memberAssessmentId: string;
  outstanding: number;
  max: number;
  today: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const options = Array.from({ length: Math.max(0, max - 1) }, (_, i) => i + 2).filter((n) => outstanding >= 50 * n);
  const [count, setCount] = useState(options[0] ?? 2);
  const [first, setFirst] = useState(today);
  const preview = useMemo(() => {
    try {
      return splitIntoInstallments(outstanding, count, first);
    } catch {
      return [];
    }
  }, [outstanding, count, first]);
  if (state.ok) return <FormMessage state={state} />;
  if (options.length === 0) return null;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="member_assessment" value={memberAssessmentId} />
      <input type="hidden" name="outstanding" value={outstanding} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Installments" htmlFor={`count-${memberAssessmentId}`}>
          <Select id={`count-${memberAssessmentId}`} name="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {options.map((n) => (
              <option key={n} value={n}>{n} payments</option>
            ))}
          </Select>
        </Field>
        <Field label="First payment" htmlFor={`first-${memberAssessmentId}`}>
          <Input id={`first-${memberAssessmentId}`} name="first_date" type="date" min={today} value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
      </div>
      {preview.length > 0 ? (
        <ul className="divide-y divide-line rounded-md border border-line text-[13px]">
          {preview.map((p) => (
            <li key={p.sequence} className="flex justify-between px-3 py-1.5">
              <span className="text-ink-2">Payment {p.sequence} · by {new Date(`${p.dueDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
              <span className="text-ink tnum">{formatCents(p.amountCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Checkbox name="consent" label="I agree to this schedule. I pay each installment myself when it is due; nothing is charged automatically." />
        {state.fieldErrors?.consent ? <p className="mt-1 text-[13px] text-danger">{state.fieldErrors.consent}</p> : null}
      </div>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Creating plan">Set up plan</SubmitButton>
    </form>
  );
}
