"use client";

import { useState } from "react";
import { ListPlus, PenLine } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { fieldError, type ActionState } from "@/lib/action-state";
import { outreachEmail } from "@/lib/outreach";
import { sendCustomOutreach } from "../letter-action";
import { SendConfirm } from "../send-confirm";
import { Collapse, SentPanel } from "../sent-panel";

type Details = { full_name: string; organization: string; university: string };

function draftFor(details: Details) {
  return outreachEmail({
    full_name: details.full_name.trim() || null,
    organization: details.organization.trim() || "[Organization]",
    university: details.university.trim() || "[University]",
  });
}

function Fields({ state, from, replyTo, canSend, onAnother }: { state: ActionState; from: string; replyTo: string; canSend: boolean; onAnother: () => void }) {
  const [details, setDetails] = useState<Details>({ full_name: "", organization: "", university: "" });
  const [subject, setSubject] = useState(() => draftFor(details).subject);
  const [body, setBody] = useState(() => draftFor(details).body);
  const [edited, setEdited] = useState({ subject: false, body: false });

  function change(key: keyof Details, value: string) {
    const next = { ...details, [key]: value };
    setDetails(next);
    const draft = draftFor(next);
    if (!edited.subject) setSubject(draft.subject);
    if (!edited.body) setBody(draft.body);
  }

  function reset() {
    const draft = draftFor(details);
    setSubject(draft.subject);
    setBody(draft.body);
    setEdited({ subject: false, body: false });
  }

  return (
    <>
      {state.ok ? <SentPanel queued={state.values?.intent === "queue"} message={state.message} extra={<Button type="button" variant="ghost" size="sm" onClick={onAnother}><PenLine className="size-4" aria-hidden />Write another</Button>} /> : null}
      <Collapse open={!state.ok}>
      <div className="space-y-4">
      <FormMessage state={state} />
      <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-3">From</dt>
        <dd className="truncate text-ink-2">{from}</dd>
        <dt className="text-ink-3">Replies go to</dt>
        <dd className="truncate text-ink-2">{replyTo}</dd>
      </dl>
      <Field label="To" htmlFor="compose-email" error={fieldError(state, "email")}>
        <Input id="compose-email" name="email" type="email" autoComplete="off" placeholder="name@school.edu" defaultValue={state.values?.email ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Their name" htmlFor="compose-name" hint="Optional. Used in the greeting." error={fieldError(state, "full_name")}>
          <Input id="compose-name" name="full_name" value={details.full_name} onChange={(event) => change("full_name", event.target.value)} />
        </Field>
        <Field label="Role" htmlFor="compose-role" hint="Optional, for example President." error={fieldError(state, "role")}>
          <Input id="compose-role" name="role" defaultValue={state.values?.role ?? ""} />
        </Field>
        <Field label="Organization" htmlFor="compose-organization" hint="Council, chapter, or office." error={fieldError(state, "organization")}>
          <Input id="compose-organization" name="organization" value={details.organization} onChange={(event) => change("organization", event.target.value)} />
        </Field>
        <Field label="University" htmlFor="compose-university" error={fieldError(state, "university")}>
          <Input id="compose-university" name="university" value={details.university} onChange={(event) => change("university", event.target.value)} />
        </Field>
      </div>
      <Field label="Subject" htmlFor="compose-subject">
        <Input id="compose-subject" name="subject" value={subject} onChange={(event) => { setSubject(event.target.value); setEdited((current) => ({ ...current, subject: true })); }} />
      </Field>
      <Field label="Message" htmlFor="compose-body">
        <Textarea id="compose-body" name="body" value={body} onChange={(event) => { setBody(event.target.value); setEdited((current) => ({ ...current, body: true })); }} className="min-h-[28rem] font-sans text-[13px] leading-relaxed" />
      </Field>
      <SendConfirm label="Send email" disabled={!canSend}>
        <SubmitButton name="intent" value="queue" variant="secondary" pendingLabel="Saving">
          <ListPlus className="size-4" aria-hidden />
          Add to bulk list
        </SubmitButton>
        {edited.subject || edited.body ? <button type="button" onClick={reset} className="text-sm text-ink-3 hover:text-ink">Reset to template</button> : null}
      </SendConfirm>
      </div>
      </Collapse>
    </>
  );
}

export function ComposeForm({ from, replyTo, canSend }: { from: string; replyTo: string; canSend: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <ActionForm key={round} action={sendCustomOutreach}>
      {(state) => <Fields state={state} from={from} replyTo={replyTo} canSend={canSend} onAnother={() => setRound((value) => value + 1)} />}
    </ActionForm>
  );
}
