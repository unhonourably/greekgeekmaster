"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Field, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function StatusForm({ action, current }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; current: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="New status" htmlFor="status" error={state.fieldErrors?.status}>
        <Select id="status" name="status" defaultValue={current === "verified" ? "suspended" : "verified"}>
          <option value="verified">Verified</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </Select>
      </Field>
      <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason} hint="Recorded in the audit log. Suspension reasons are shown to the chapter.">
        <Textarea id="reason" name="reason" maxLength={1000} className="min-h-20" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Saving">Change status</SubmitButton>
      </div>
    </form>
  );
}
