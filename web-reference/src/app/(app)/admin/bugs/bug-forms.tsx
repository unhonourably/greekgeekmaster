"use client";

import { useState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { BUG_AREAS, BUG_AREA_LABEL, BUG_SEVERITIES, BUG_SEVERITY_HINT, BUG_SEVERITY_LABEL, BUG_STATUSES, BUG_STATUS_LABEL, type BugStatus } from "@/lib/bugs";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function TriageForm({
  action,
  status,
  severity,
  area,
  suggestedArea,
  assigneeId,
  assignees,
  duplicateNumber,
}: {
  action: Action;
  status: BugStatus;
  severity: string | null;
  area: string | null;
  suggestedArea: string | null;
  assigneeId: string | null;
  assignees: Array<{ user_id: string; name: string; role: string }>;
  duplicateNumber: number | null;
}) {
  const [picked, setPicked] = useState<BugStatus>(status);
  const choices = BUG_STATUSES.filter((item) => item !== "fixed" || status === "fixed");
  return (
    <ActionForm action={action} className="space-y-3">
      {(state) => (
        <>
          <FormMessage state={state} />
          <Field label="Status" htmlFor="bug-status" hint={status === "fixed" ? undefined : "To close it as fixed, use Log a fix."}>
            <Select id="bug-status" name="status" value={picked} onChange={(event) => setPicked(event.target.value as BugStatus)} className="w-full">
              {choices.map((item) => <option key={item} value={item}>{BUG_STATUS_LABEL[item]}</option>)}
            </Select>
          </Field>
          {picked === "duplicate" ? (
            <Field label="Duplicate of" htmlFor="bug-duplicate" error={state.fieldErrors?.duplicate_of} hint="The report number, like 12.">
              <Input id="bug-duplicate" name="duplicate_of" inputMode="numeric" defaultValue={duplicateNumber ? String(duplicateNumber) : ""} placeholder="12" />
            </Field>
          ) : null}
          <Field label="Severity" htmlFor="bug-severity" hint={severity ? BUG_SEVERITY_HINT[severity as keyof typeof BUG_SEVERITY_HINT] : "Not rated yet"}>
            <Select id="bug-severity" name="severity" defaultValue={severity ?? ""} className="w-full">
              <option value="">Not rated</option>
              {BUG_SEVERITIES.map((item) => <option key={item} value={item}>{BUG_SEVERITY_LABEL[item]} · {BUG_SEVERITY_HINT[item]}</option>)}
            </Select>
          </Field>
          <Field label="Area" htmlFor="bug-area" hint={!area && suggestedArea ? `Suggested from the page: ${BUG_AREA_LABEL[suggestedArea as keyof typeof BUG_AREA_LABEL]}` : undefined}>
            <Select id="bug-area" name="area" defaultValue={area ?? suggestedArea ?? ""} className="w-full">
              <option value="">Not set</option>
              {BUG_AREAS.map((item) => <option key={item} value={item}>{BUG_AREA_LABEL[item]}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to" htmlFor="bug-assignee">
            <Select id="bug-assignee" name="assignee_id" defaultValue={assigneeId ?? ""} className="w-full">
              <option value="">Nobody</option>
              {assignees.map((person) => <option key={person.user_id} value={person.user_id}>{person.name}</option>)}
            </Select>
          </Field>
          <SubmitButton size="sm" pendingLabel="Saving">Save triage</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function FixForm({ action, summary, fixRef, fixed }: { action: Action; summary: string | null; fixRef: string | null; fixed: boolean }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(state) => (
        <>
          <FormMessage state={state} />
          <Field label="What changed" htmlFor="fix-summary" error={state.fieldErrors?.fix_summary} hint="What was wrong and what the fix does. This goes in the log.">
            <Textarea id="fix-summary" name="fix_summary" defaultValue={summary ?? ""} maxLength={4000} className="min-h-28 text-[13px]" placeholder="The balance didn't subtract partial payments. It now uses the ledger total." />
          </Field>
          <Field label="Commit or pull request" htmlFor="fix-ref" error={state.fieldErrors?.fix_ref} hint="Optional. A link or a commit hash.">
            <Input id="fix-ref" name="fix_ref" defaultValue={fixRef ?? ""} placeholder="https://github.com/… or a1b2c3d" className="font-mono text-[13px]" />
          </Field>
          <SubmitButton size="sm" pendingLabel="Logging">{fixed ? "Update fix" : "Log fix and close"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CommentForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="space-y-2" resetOnSuccess>
      {(state) => (
        <>
          <FormMessage state={state} />
          <Textarea name="body" maxLength={4000} aria-label="Internal note" placeholder="Add an internal note. Steps to reproduce, what you tried, who to ask." className="min-h-20 text-[13px]" aria-invalid={state.fieldErrors?.body ? true : undefined} />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Adding">Add note</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReporterEmailForm({ action, to, subject, body, disabled }: { action: Action; to: string; subject: string; body: string; disabled?: boolean }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(state) => (
        <>
          <FormMessage state={state} />
          <p className="text-[13px] text-ink-3">To <span className="text-ink-2">{to}</span> · replies go to admin@greekgeek.org</p>
          <Field label="Subject" htmlFor="reporter-subject" error={state.fieldErrors?.subject}>
            <Input id="reporter-subject" name="subject" defaultValue={subject} />
          </Field>
          <Field label="Message" htmlFor="reporter-body" error={state.fieldErrors?.body}>
            <Textarea id="reporter-body" name="body" defaultValue={body} className="min-h-40 text-[13px] leading-relaxed" />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="Sending" disabled={disabled}>Send email</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
