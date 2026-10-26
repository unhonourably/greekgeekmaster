"use client";

import { useActionState, useState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Field, Textarea, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

const DECISIONS = [
  { value: "verified", label: "Verify chapter", description: "Creates or activates the chapter and makes the applicant its administrator." },
  { value: "info_requested", label: "Request information", description: "Sends your message to the applicant and pauses the review." },
  { value: "rejected", label: "Reject", description: "Closes the application. The applicant can appeal up to two times." },
] as const;

export function DecisionForm({ action, canSuspend }: { action: Action; canSuspend: boolean }) {
  const [state, formAction] = useActionState(action, {});
  const [decision, setDecision] = useState<string>("");
  const options = canSuspend ? [{ value: "suspended", label: "Suspend chapter", description: "Pauses payments and invitations for the verified chapter." } as const] : DECISIONS;
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form
      action={formAction}
      className="space-y-4"
      noValidate
      onChange={(e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement && t.name === "decision") setDecision(t.value);
      }}
    >
      <FormMessage state={state} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Decision</legend>
        {options.map((o) => (
          <label key={o.value} className={cx("flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40", "border-line hover:border-ink-3/40")}>
            <input type="radio" name="decision" value={o.value} className="mt-0.5 accent-accent" />
            <span>
              <span className="block font-medium text-ink">{o.label}</span>
              <span className="block text-[13px] text-ink-3">{o.description}</span>
            </span>
          </label>
        ))}
        {state.fieldErrors?.decision ? <p className="text-[13px] text-danger">{state.fieldErrors.decision}</p> : null}
      </fieldset>
      <Field label="Message to the applicant" htmlFor="message" error={state.fieldErrors?.message} hint={decision === "verified" ? "Optional when verifying. The applicant sees this exactly as written." : "Required unless you are verifying. The applicant sees this exactly as written."}>
        <Textarea id="message" name="message" maxLength={4000} className="min-h-24" />
      </Field>
      <Field label="Internal note" htmlFor="internal_note" hint="Visible to reviewers only.">
        <Textarea id="internal_note" name="internal_note" maxLength={4000} className="min-h-16" />
      </Field>
      {canSuspend ? null : (
        <div>
          <Checkbox name="confirm" label="I reviewed the evidence and it confirms this person is a current officer of this chapter." description="Required to verify." />
          {state.fieldErrors?.confirm ? <p className="mt-1 text-[13px] text-danger">{state.fieldErrors.confirm}</p> : null}
        </div>
      )}
      <div className="flex justify-end">
        <SubmitButton variant={decision === "rejected" || decision === "suspended" ? "danger" : "primary"} pendingLabel="Saving">
          Record decision
        </SubmitButton>
      </div>
    </form>
  );
}

export function NoteForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="space-y-2" resetOnSuccess>
      {(state) => (
        <>
          {state.error ? <FormMessage state={state} /> : null}
          <Textarea name="note" maxLength={4000} className="min-h-16" aria-label="Internal note" placeholder="Add an internal note" />
          {state.fieldErrors?.note ? <p className="text-[13px] text-danger">{state.fieldErrors.note}</p> : null}
          <div className="flex justify-end">
            <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">Add note</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
