"use client";

import { useActionState } from "react";
import { Field, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ClosureDecision({ action, id }: { action: Action; id: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Note to the chapter" htmlFor={`note-${id}`} error={state.fieldErrors?.note} hint="Required if you decline.">
        <Textarea id={`note-${id}`} name="note" maxLength={2000} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton name="decision" value="declined" variant="secondary" pendingLabel="Saving">Decline</SubmitButton>
        <SubmitButton name="decision" value="accepted" variant="danger" pendingLabel="Closing">Accept and close</SubmitButton>
      </div>
    </form>
  );
}
