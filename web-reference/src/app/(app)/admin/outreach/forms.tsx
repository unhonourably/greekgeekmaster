"use client";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field, Input, Textarea } from "@/components/ui";
import { fieldError, type ActionState } from "@/lib/action-state";
import { ORGANIZATIONS, ROLES } from "@/lib/outreach";
import { SendConfirm } from "./send-confirm";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type ContactValues = {
  university: string;
  organization: string;
  role: string;
  full_name: string | null;
  email: string;
  source_url: string | null;
  notes: string | null;
};

export function ContactForm({ action, contact, submitLabel }: { action: FormAction; contact?: ContactValues; submitLabel: string }) {
  const prefix = contact ? "edit" : "new";
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess={!contact}>
      {(state) => (
        <>
          <FormMessage state={state} />
          <Field label="University" htmlFor={`${prefix}-university`} error={fieldError(state, "university")}>
            <Input id={`${prefix}-university`} name="university" defaultValue={contact?.university} placeholder="Texas Christian University" required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Council or office" htmlFor={`${prefix}-organization`} error={fieldError(state, "organization")}>
              <Input id={`${prefix}-organization`} name="organization" list="outreach-organizations" defaultValue={contact?.organization ?? "IFC"} required />
            </Field>
            <Field label="Role" htmlFor={`${prefix}-role`} error={fieldError(state, "role")}>
              <Input id={`${prefix}-role`} name="role" list="outreach-roles" defaultValue={contact?.role ?? "President"} required />
            </Field>
          </div>
          <Field label="Name" htmlFor={`${prefix}-full_name`} error={fieldError(state, "full_name")}>
            <Input id={`${prefix}-full_name`} name="full_name" defaultValue={contact?.full_name ?? ""} placeholder="Margarita Lopez" />
          </Field>
          <Field label="Email" htmlFor={`${prefix}-email`} error={fieldError(state, "email")}>
            <Input id={`${prefix}-email`} name="email" type="email" defaultValue={contact?.email} required />
          </Field>
          <Field label="Where you found it" htmlFor={`${prefix}-source_url`} error={fieldError(state, "source_url")} hint="Link to the page that lists this contact.">
            <Input id={`${prefix}-source_url`} name="source_url" defaultValue={contact?.source_url ?? ""} placeholder="https://" />
          </Field>
          <Field label="Notes" htmlFor={`${prefix}-notes`}>
            <Textarea id={`${prefix}-notes`} name="notes" defaultValue={contact?.notes ?? ""} className="min-h-16" />
          </Field>
          <datalist id="outreach-organizations">
            {ORGANIZATIONS.map((value) => <option key={value} value={value} />)}
          </datalist>
          <datalist id="outreach-roles">
            {ROLES.map((value) => <option key={value} value={value} />)}
          </datalist>
          <SubmitButton pendingLabel="Saving">{submitLabel}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ImportForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      {(state) => (
        <>
          <FormMessage state={state} />
          <Field label="One contact per line" htmlFor="import-rows" hint="university, council, role, name, email, link. Commas or tabs, so you can paste from a spreadsheet. Emails already saved are skipped.">
            <Textarea id="import-rows" name="rows" className="min-h-32 font-mono text-[12px]" placeholder={"Texas Christian University, MGC, President, Margarita Lopez, m.lopez@tcu.edu, https://...\nUniversity of Kansas, IFC, President, Jordan Lee, jlee@ku.edu"} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Importing">Import</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function SendForm({ action, subject, body, to, from, replyTo, label, disabled, bodyClassName, includeFormDefault }: { action: FormAction; subject: string; body: string; to: string; from: string; replyTo: string; label: string; disabled?: boolean; bodyClassName?: string; includeFormDefault?: boolean }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(state) => (
        <>
          <FormMessage state={state} />
          <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-3">From</dt>
            <dd className="truncate text-ink-2">{from}</dd>
            <dt className="text-ink-3">To</dt>
            <dd className="truncate text-ink">{to}</dd>
            <dt className="text-ink-3">Replies go to</dt>
            <dd className="truncate text-ink-2">{replyTo}</dd>
          </dl>
          <Field label="Subject" htmlFor="send-subject">
            <Input id="send-subject" name="subject" defaultValue={subject} />
          </Field>
          <Field label="Message" htmlFor="send-body">
            <Textarea id="send-body" name="body" defaultValue={body} className={bodyClassName ?? "min-h-[28rem] font-sans text-[13px] leading-relaxed"} />
          </Field>
          <SendConfirm label={label} disabled={disabled} includeFormDefault={includeFormDefault} />
        </>
      )}
    </ActionForm>
  );
}

export function ReplyForm({ action, now }: { action: FormAction; now: string }) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      {(state) => (
        <>
          <FormMessage state={state} />
          <Field label="Received (Central time)" htmlFor="reply-at">
            <Input id="reply-at" name="occurred_at" type="datetime-local" defaultValue={now} />
          </Field>
          <Field label="Subject" htmlFor="reply-subject">
            <Input id="reply-subject" name="subject" placeholder="Re: GreekGeek" />
          </Field>
          <Field label="What they said" htmlFor="reply-body">
            <Textarea id="reply-body" name="body" className="min-h-24" placeholder="Paste the reply" />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Saving">Log reply</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
