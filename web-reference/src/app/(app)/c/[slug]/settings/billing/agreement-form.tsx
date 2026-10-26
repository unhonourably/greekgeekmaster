"use client";

import { useActionState } from "react";
import { Checkbox, Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

export function AgreementForm({
  action,
  termsId,
  defaultName,
  summary,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  termsId: string;
  defaultName: string;
  summary: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="terms_id" value={termsId} />
      <FormMessage state={state} />
      <p className="rounded-md border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink-2">{summary}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your full name" htmlFor="signer_name" error={state.fieldErrors?.signer_name}>
          <Input id="signer_name" name="signer_name" defaultValue={defaultName} autoComplete="name" />
        </Field>
        <Field label="Your title" htmlFor="signer_title" error={state.fieldErrors?.signer_title}>
          <Input id="signer_title" name="signer_title" placeholder="Chapter president" />
        </Field>
      </div>
      <div className="space-y-2">
        <Checkbox name="agree" label="I have read and accept the chapter services and pricing agreement, including the monthly subscription and the platform fee on online dues payments." />
        {state.fieldErrors?.agree ? <p className="text-[13px] text-danger">{state.fieldErrors.agree}</p> : null}
        <Checkbox name="authority" label="I am authorized to accept this agreement on behalf of the chapter." />
        {state.fieldErrors?.authority ? <p className="text-[13px] text-danger">{state.fieldErrors.authority}</p> : null}
      </div>
      <SubmitButton pendingLabel="Recording acceptance">Accept agreement</SubmitButton>
    </form>
  );
}
