"use client";

import { useActionState, useState } from "react";
import { FileUp, MailCheck } from "lucide-react";
import { Badge, Checkbox, Field, Input, Notice, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";
import { INTENDED_ROLES, VERIFICATION_METHODS, type VerificationMethod } from "@/lib/applications";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ApplicantForm({ action, defaults }: { action: Action; defaults: { applicant_full_name: string; intended_role: string } }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Your full name" htmlFor="applicant_full_name" error={state.fieldErrors?.applicant_full_name} hint="As it appears on chapter records.">
        <Input id="applicant_full_name" name="applicant_full_name" defaultValue={defaults.applicant_full_name} autoComplete="name" required />
      </Field>
      <Field label="Your position in the chapter" htmlFor="intended_role" error={state.fieldErrors?.intended_role} hint="You will become the chapter administrator. Officer roles are assigned once the chapter is verified.">
        <Select id="intended_role" name="intended_role" defaultValue={defaults.intended_role} required>
          <option value="" disabled>Choose a position</option>
          {INTENDED_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving">Continue</SubmitButton>
      </div>
    </form>
  );
}

export function ChapterForm({
  action,
  kind,
  universityId,
  proposedUniversity,
  chapters,
  organizations,
  defaults,
}: {
  action: Action;
  kind: "new_chapter" | "claim_existing" | "recovery";
  universityId: string;
  proposedUniversity: string;
  chapters: Array<{ id: string; name: string; status: string }>;
  organizations: string[];
  defaults: { organization_name: string; designation: string; greek_letters: string; existing_chapter_id: string };
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="university_id" value={universityId} />
      {universityId === "other" ? (
        <Field label="University name" htmlFor="proposed_university_name" error={state.fieldErrors?.university_id} hint="A reviewer adds your university when the chapter is verified.">
          <Input id="proposed_university_name" name="proposed_university_name" defaultValue={proposedUniversity} required />
        </Field>
      ) : null}
      {kind === "new_chapter" ? (
        <>
          <Field label="Organization" htmlFor="organization_name" error={state.fieldErrors?.organization_name} hint="Your national or international organization, or your local organization's name.">
            <Input id="organization_name" name="organization_name" list="organizations" defaultValue={defaults.organization_name} required />
            <datalist id="organizations">
              {organizations.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Chapter designation" htmlFor="designation" error={state.fieldErrors?.designation} hint="For example, Beta Gamma chapter.">
              <Input id="designation" name="designation" defaultValue={defaults.designation} />
            </Field>
            <Field label="Greek letters" htmlFor="greek_letters" error={state.fieldErrors?.greek_letters} hint="Optional.">
              <Input id="greek_letters" name="greek_letters" defaultValue={defaults.greek_letters} maxLength={24} />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Chapter" htmlFor="existing_chapter_id" error={state.fieldErrors?.existing_chapter_id}>
          {chapters.length === 0 ? (
            <p className="rounded-md border border-line bg-canvas px-3 py-2.5 text-sm text-ink-2">
              No chapters are listed at this university. Go back and start a new chapter application instead.
            </p>
          ) : (
            <Select id="existing_chapter_id" name="existing_chapter_id" defaultValue={defaults.existing_chapter_id} required>
              <option value="" disabled>Choose a chapter</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "unclaimed" ? " (unclaimed)" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving">Continue</SubmitButton>
      </div>
    </form>
  );
}

export function VerificationForm({
  action,
  sendCode,
  verifyCode,
  upload,
  defaults,
  emailVerified,
  evidence,
  skipped = false,
}: {
  action: Action;
  sendCode: Action;
  verifyCode: Action;
  upload: Action;
  defaults: {
    verification_method: VerificationMethod | "";
    institutional_email: string;
    national_contact_name: string;
    national_contact_email: string;
    fsl_contact_name: string;
    fsl_contact_email: string;
    officer_statement: string;
  };
  emailVerified: boolean;
  evidence: Array<{ id: string; file_name: string; kind: string }>;
  skipped?: boolean;
}) {
  const [method, setMethod] = useState<VerificationMethod | "">(skipped ? "manual_review" : defaults.verification_method);
  const [state, formAction] = useActionState(action, {});
  return (
    <div className="space-y-6">
      <form id="verification-form" action={formAction} className="space-y-5" noValidate>
        <FormMessage state={state} />
        {skipped ? <input type="hidden" name="verification_method" value="manual_review" /> : null}
        {skipped ? null : <fieldset>
          <legend className="text-[13px] font-medium text-ink">How should we confirm you represent this chapter?</legend>
          {state.fieldErrors?.verification_method ? <p className="mt-1 text-[13px] text-danger">{state.fieldErrors.verification_method}</p> : null}
          <div className="mt-2 space-y-2">
            {VERIFICATION_METHODS.map((m) => (
              <label
                key={m.value}
                className={cx(
                  "flex cursor-pointer gap-3 rounded-md border px-4 py-3",
                  method === m.value ? "border-accent bg-accent-soft/50" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="verification_method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{m.label}</span>
                  <span className="block text-[13px] text-ink-3">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>}

        {skipped ? (
          <Notice tone="info" title="Verification is not required">
            Your platform administrator role confirms the chapter. Continue to review, then create it.
          </Notice>
        ) : null}

        {!skipped && method === "national_organization" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact name" htmlFor="national_contact_name" error={state.fieldErrors?.national_contact_name}>
              <Input id="national_contact_name" name="national_contact_name" defaultValue={defaults.national_contact_name} />
            </Field>
            <Field label="Contact email" htmlFor="national_contact_email" error={state.fieldErrors?.national_contact_email}>
              <Input id="national_contact_email" name="national_contact_email" type="email" defaultValue={defaults.national_contact_email} />
            </Field>
          </div>
        ) : null}
        {method === "university_fsl" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="FSL contact name" htmlFor="fsl_contact_name" error={state.fieldErrors?.fsl_contact_name}>
              <Input id="fsl_contact_name" name="fsl_contact_name" defaultValue={defaults.fsl_contact_name} />
            </Field>
            <Field label="FSL contact email" htmlFor="fsl_contact_email" error={state.fieldErrors?.fsl_contact_email}>
              <Input id="fsl_contact_email" name="fsl_contact_email" type="email" defaultValue={defaults.fsl_contact_email} />
            </Field>
          </div>
        ) : null}
        {skipped ? null : (
          <Field label="Anything the reviewer should know" htmlFor="officer_statement" error={state.fieldErrors?.officer_statement} hint="Optional. For example, when you were elected or who else holds officer positions.">
            <Textarea id="officer_statement" name="officer_statement" defaultValue={defaults.officer_statement} maxLength={2000} />
          </Field>
        )}
      </form>

      {method === "institutional_email" ? <EmailVerification sendCode={sendCode} verifyCode={verifyCode} email={defaults.institutional_email} verified={emailVerified} /> : null}
      {method === "officer_documentation" ? <EvidenceUpload upload={upload} evidence={evidence} /> : null}

      <div className="flex justify-end">
        <button type="submit" form="verification-form" className={buttonClass("primary")}>
          Continue
        </button>
      </div>
    </div>
  );
}

function EmailVerification({ sendCode, verifyCode, email, verified }: { sendCode: Action; verifyCode: Action; email: string; verified: boolean }) {
  const [sendState, sendAction] = useActionState(sendCode, {});
  const [verifyState, verifyAction] = useActionState(verifyCode, {});
  const done = verified || verifyState.ok;
  const currentEmail = sendState.values?.institutional_email ?? email;
  return (
    <div className="rounded-md border border-line bg-canvas p-4">
      <div className="flex items-center gap-2">
        <MailCheck className="size-4 text-ink-3" aria-hidden />
        <h3 className="text-sm font-medium text-ink">Confirm your school email</h3>
        {done ? <Badge tone="positive">Confirmed</Badge> : null}
      </div>
      {done ? (
        <p className="mt-2 text-sm text-ink-2">{currentEmail} is confirmed.</p>
      ) : (
        <div className="mt-3 space-y-4">
          <form action={sendAction} className="flex flex-wrap items-end gap-3" noValidate>
            <Field label="School email" htmlFor="institutional_email" error={sendState.fieldErrors?.institutional_email} className="min-w-60 flex-1">
              <Input id="institutional_email" name="institutional_email" type="email" defaultValue={currentEmail} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Sending">{sendState.ok || email ? "Send a new code" : "Send code"}</SubmitButton>
          </form>
          {sendState.error || sendState.message ? <FormMessage state={sendState} /> : null}
          {sendState.ok || email ? (
            <form action={verifyAction} className="flex flex-wrap items-end gap-3" noValidate>
              <Field label="6-digit code" htmlFor="code" error={verifyState.fieldErrors?.code} className="w-40">
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="tnum tracking-widest" />
              </Field>
              <SubmitButton pendingLabel="Checking">Confirm</SubmitButton>
            </form>
          ) : null}
          {verifyState.error ? <FormMessage state={verifyState} /> : null}
        </div>
      )}
    </div>
  );
}

const EVIDENCE_LABEL: Record<string, string> = {
  officer_roster: "Officer roster",
  national_letter: "Letter from national organization",
  fsl_letter: "Letter from FSL office",
  election_minutes: "Election minutes",
  other: "Other document",
};

export function EvidenceUpload({ upload, evidence }: { upload: Action; evidence: Array<{ id: string; file_name: string; kind: string }> }) {
  const [state, action] = useActionState(upload, {});
  return (
    <div className="rounded-md border border-line bg-canvas p-4">
      <div className="flex items-center gap-2">
        <FileUp className="size-4 text-ink-3" aria-hidden />
        <h3 className="text-sm font-medium text-ink">Supporting documents</h3>
      </div>
      {evidence.length > 0 ? (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate text-ink">{e.file_name}</span>
              <span className="shrink-0 text-[12px] text-ink-3">{EVIDENCE_LABEL[e.kind] ?? e.kind}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">PDF or image, up to 10 MB. Documents are visible only to you and platform reviewers.</p>
      )}
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <Field label="Document type" htmlFor="kind" className="w-56">
          <Select id="kind" name="kind" defaultValue="officer_roster">
            {Object.entries(EVIDENCE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="File" htmlFor="file" error={state.fieldErrors?.file} className="min-w-60 flex-1">
          <input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm text-ink-2 file:mr-3 file:h-9 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-sm file:text-ink" />
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Uploading">Upload</SubmitButton>
      </form>
      {state.error || state.message ? <div className="mt-3"><FormMessage state={state} /></div> : null}
    </div>
  );
}

export function SubmitForm({ action, needsResponse, confirmLabel }: { action: Action; needsResponse: boolean; confirmLabel?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {needsResponse ? (
        <Field label="Response to the reviewer" htmlFor="response" hint="Explain what you changed or answer the reviewer's question.">
          <Textarea id="response" name="response" maxLength={4000} />
        </Field>
      ) : null}
      <div>
        <Checkbox name="attest" label="I confirm that I am a current officer or advisor of this chapter and that the information above is accurate." />
        {state.fieldErrors?.attest ? <p className="mt-1 text-[13px] text-danger">{state.fieldErrors.attest}</p> : null}
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Submitting">{confirmLabel ?? (needsResponse ? "Resubmit for review" : "Submit for review")}</SubmitButton>
      </div>
    </form>
  );
}

export function RespondForm({ action, appeal }: { action: Action; appeal: boolean }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <Field label={appeal ? "Appeal the decision" : "Message the reviewer"} htmlFor="message" error={state.fieldErrors?.message} hint={appeal ? "Explain why the decision should be reconsidered. You can appeal twice." : undefined}>
        <Textarea id="message" name="message" maxLength={4000} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Sending">{appeal ? "Submit appeal" : "Send message"}</SubmitButton>
      </div>
    </form>
  );
}
