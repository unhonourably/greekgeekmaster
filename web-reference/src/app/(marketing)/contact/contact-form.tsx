"use client";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { sendContact } from "./actions";

export function ContactForm() {
  return (
    <ActionForm action={sendContact} className="space-y-4">
      {(state) => (
        <>
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
              <Input id="name" name="name" maxLength={80} autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
              <Input id="email" name="email" type="email" maxLength={200} autoComplete="email" />
            </Field>
          </div>
          <Field label="Send to" htmlFor="recipient">
            <Select id="recipient" name="recipient" defaultValue="both">
              <option value="both">Amare and Owen</option>
              <option value="amare">Amare</option>
              <option value="owen">Owen</option>
            </Select>
          </Field>
          <Field label="Message" htmlFor="message" error={state.fieldErrors?.message}>
            <Textarea id="message" name="message" maxLength={4000} className="min-h-40" />
          </Field>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Sending">Send</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
