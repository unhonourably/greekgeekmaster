"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ConfirmSubmit, FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export type ProfileInitial = {
  display_name: string;
  full_name: string;
  graduation_year: number | null;
  pronouns: string | null;
  major: string | null;
  hometown: string | null;
  bio: string | null;
  interests: string[];
  social_links: Record<string, string>;
  phone: string | null;
  visibility: Record<string, string>;
};

function Visibility({ field, value }: { field: string; value?: string }) {
  return (
    <Select name={`vis_${field}`} defaultValue={value ?? "chapter"} aria-label="Who can see this" className="h-8 w-36 text-xs">
      <option value="chapter">Chapter members</option>
      <option value="officers">Officers only</option>
      <option value="private">Only me</option>
    </Select>
  );
}

function Row({ children, field, vis }: { children: React.ReactNode; field: string; vis: Record<string, string> }) {
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
      {children}
      <Visibility field={field} value={vis[field]} />
    </div>
  );
}

export function ProfileForm({ action, initial }: { action: Action; initial: ProfileInitial }) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  const vis = initial.visibility ?? {};
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="display_name" error={fe.display_name} hint="What members see in chat and the directory.">
          <Input id="display_name" name="display_name" defaultValue={v.display_name ?? initial.display_name} maxLength={80} />
        </Field>
        <Field label="Full name" htmlFor="full_name" error={fe.full_name} hint="Used on receipts and officer records.">
          <Input id="full_name" name="full_name" defaultValue={v.full_name ?? initial.full_name} maxLength={120} />
        </Field>
      </div>
      <Field label="Graduation year" htmlFor="graduation_year" error={fe.graduation_year} className="sm:w-48">
        <Input id="graduation_year" name="graduation_year" inputMode="numeric" defaultValue={v.graduation_year ?? initial.graduation_year ?? ""} />
      </Field>
      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-sm text-ink-2">Choose who can see each detail.</p>
        <Row field="pronouns" vis={vis}>
          <Field label="Pronouns" htmlFor="pronouns" error={fe.pronouns}>
            <Input id="pronouns" name="pronouns" defaultValue={v.pronouns ?? initial.pronouns ?? ""} maxLength={40} />
          </Field>
        </Row>
        <Row field="major" vis={vis}>
          <Field label="Major" htmlFor="major" error={fe.major}>
            <Input id="major" name="major" defaultValue={v.major ?? initial.major ?? ""} maxLength={120} />
          </Field>
        </Row>
        <Row field="hometown" vis={vis}>
          <Field label="Hometown" htmlFor="hometown" error={fe.hometown}>
            <Input id="hometown" name="hometown" defaultValue={v.hometown ?? initial.hometown ?? ""} maxLength={120} />
          </Field>
        </Row>
        <Row field="bio" vis={vis}>
          <Field label="Bio" htmlFor="bio" error={fe.bio}>
            <Textarea id="bio" name="bio" defaultValue={v.bio ?? initial.bio ?? ""} maxLength={1000} className="min-h-20" />
          </Field>
        </Row>
        <Row field="interests" vis={vis}>
          <Field label="Interests" htmlFor="interests" hint="Separate with commas." error={fe.interests}>
            <Input id="interests" name="interests" defaultValue={v.interests ?? initial.interests.join(", ")} />
          </Field>
        </Row>
        <Row field="phone" vis={vis}>
          <Field label="Phone" htmlFor="phone" error={fe.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={v.phone ?? initial.phone ?? ""} />
          </Field>
        </Row>
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-sm font-medium text-ink">Links</p>
            <Visibility field="social_links" value={vis.social_links} />
          </div>
          {(["Website", "LinkedIn", "Instagram"] as const).map((k) => (
            <Field key={k} label={k} htmlFor={`link_${k}`} error={fe[`link_${k}`]}>
              <Input id={`link_${k}`} name={`link_${k}`} defaultValue={v[`link_${k}`] ?? initial.social_links[k] ?? ""} placeholder="https://" />
            </Field>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving">Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function AvatarForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <Input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="py-1.5" aria-label="Profile photo" />
      <p className="text-xs text-ink-3">PNG, JPEG, or WebP up to 2 MB. Visible to members of your chapters.</p>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Uploading">Upload photo</SubmitButton>
    </form>
  );
}

export function EmailForm({
  action,
  email,
  step,
  pendingEmail,
}: {
  action: Action;
  email: string;
  step: "start" | "current" | "next";
  pendingEmail: string | null;
}) {
  const [state, formAction] = useActionState(action, {});
  const phase = state.values?.step === "done" ? "start" : ((state.values?.step as string | undefined) ?? step);
  const nextAddress = (state.values?.new_email as string | undefined) || pendingEmail || "";
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <p className="text-sm text-ink-2">Sign-in email is <span className="text-ink">{email}</span>.</p>
      {phase === "next" ? (
        <>
          <p className="text-sm text-ink-2">Enter the code sent to {nextAddress} to finish the change.</p>
          <Field label="Code for the new email" htmlFor="email_code" error={state.fieldErrors?.code}>
            <Input id="email_code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </Field>
          <input type="hidden" name="new_email" value={nextAddress} />
          <div className="flex flex-wrap justify-end gap-2">
            <SubmitButton name="intent" value="resend_new" variant="ghost" pendingLabel="Sending">Send a new code</SubmitButton>
            <SubmitButton name="intent" value="verify_new" pendingLabel="Updating">Update email</SubmitButton>
          </div>
        </>
      ) : phase === "current" ? (
        <>
          <p className="text-sm text-ink-2">Enter the code sent to {email}. After that, {nextAddress || "the new address"} gets its own code.</p>
          <Field label="Code for your current email" htmlFor="email_code" error={state.fieldErrors?.code}>
            <Input id="email_code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </Field>
          <input type="hidden" name="new_email" value={nextAddress} />
          <div className="flex flex-wrap justify-end gap-2">
            <SubmitButton name="intent" value="send" variant="ghost" pendingLabel="Sending">Send a new code</SubmitButton>
            <SubmitButton name="intent" value="verify_current" pendingLabel="Checking">Confirm current email</SubmitButton>
          </div>
        </>
      ) : (
        <>
          <Field label="New email" htmlFor="new_email" error={state.fieldErrors?.new_email}>
            <Input id="new_email" name="new_email" type="email" autoComplete="email" defaultValue={nextAddress} />
          </Field>
          <div className="flex justify-end">
            <SubmitButton name="intent" value="send" variant="secondary" pendingLabel="Sending">Email me a code</SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}

export function PasswordForm({ action, codeSent }: { action: Action; codeSent: boolean }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const showCode = codeSent || state.values?.step === "password_code";
  useEffect(() => {
    if (state.values?.step === "done") ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Current password" htmlFor="current" error={state.fieldErrors?.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="password" error={state.fieldErrors?.password} hint="At least 10 characters with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" />
      </Field>
      {showCode ? (
        <Field label="Email code" htmlFor="password_code" error={state.fieldErrors?.code} hint="Sent to your current email. It expires in 15 minutes.">
          <Input id="password_code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
        </Field>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton name="intent" value="send" variant="ghost" pendingLabel="Sending">{showCode ? "Send a new code" : "Email me a code"}</SubmitButton>
        {showCode ? <SubmitButton name="intent" value="confirm" pendingLabel="Updating">Update password</SubmitButton> : null}
      </div>
    </form>
  );
}

const NOTIFICATION_GROUPS = [
  { title: "Events", kinds: ["event_posted", "event_reminder"] },
  { title: "Housing", kinds: ["housing_update", "housing_request"] },
  { title: "Messages", kinds: ["chat_mention", "chat_message"] },
  { title: "Chapter", kinds: ["announcement", "policy_update", "task_assigned"] },
  { title: "Money", kinds: ["dues_assessed", "dues_reminder", "payment_receipt", "payment_failed", "payment_refunded", "reimbursement_update"] },
  { title: "Academics and service", kinds: ["academic_update", "philanthropy_update"] },
  { title: "Recruitment", kinds: ["recruitment_followup"] },
  { title: "Account", kinds: ["membership_added", "membership_removed", "verification_update"] },
] as const;

function groupedNotificationKinds<T extends { kind: string }>(kinds: T[]): { title: string; items: T[] }[] {
  const used = new Set<string>();
  const groups: { title: string; items: T[] }[] = [];
  for (const group of NOTIFICATION_GROUPS) {
    const items = group.kinds.map((kind) => kinds.find((item) => item.kind === kind)).filter((item): item is T => Boolean(item));
    items.forEach((item) => used.add(item.kind));
    if (items.length > 0) groups.push({ title: group.title, items });
  }
  const rest = kinds.filter((item) => !used.has(item.kind) && item.kind !== "bug_report" && item.kind !== "marketing_alert");
  if (rest.length > 0) groups.push({ title: "More", items: rest });
  const staff = kinds.filter((item) => item.kind === "bug_report" || item.kind === "marketing_alert");
  if (staff.length > 0) groups.push({ title: "Platform", items: staff });
  return groups;
}

export function NotificationForm({
  action,
  kinds,
}: {
  action: Action;
  kinds: Array<{ kind: string; label: string; description: string; in_app: boolean; email: boolean; required: boolean }>;
}) {
  const [state, formAction] = useActionState(action, {});
  const groups = groupedNotificationKinds(kinds);
  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      {groups.map((group) => (
        <table key={group.title} className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="pb-2 font-medium">{group.title}</th>
              <th className="w-24 pb-2 text-center font-medium">In app</th>
              <th className="w-24 pb-2 text-center font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((k) => (
              <tr key={k.kind} className="border-t border-line">
                <td className="py-2.5 pr-3">
                  <span className="block font-medium text-ink">{k.label}</span>
                  <span className="block text-xs text-ink-3">{k.description}{k.required ? ". Always on." : ""}</span>
                </td>
                <td className="text-center">
                  <input type="checkbox" name={`in_app_${k.kind}`} defaultChecked={k.in_app || k.required} disabled={k.required} aria-label={`${k.label} in app`} className="size-4 accent-[var(--color-accent)]" />
                </td>
                <td className="text-center">
                  <input type="checkbox" name={`email_${k.kind}`} defaultChecked={k.email} disabled={k.required && k.email} aria-label={`${k.label} by email`} className="size-4 accent-[var(--color-accent)]" />
                  {k.required && k.email ? <input type="hidden" name={`email_${k.kind}`} value="on" /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Saving">Save notification settings</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ action, email }: { action: Action; email: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <Field label="Type your email to confirm" htmlFor="confirm_email" error={state.fieldErrors?.confirm_email} hint={email}>
        <Input id="confirm_email" name="confirm_email" type="email" autoComplete="off" />
      </Field>
      <ConfirmSubmit message="Delete your account and personal data? This cannot be undone." variant="danger" size="md">
        Delete my account
      </ConfirmSubmit>
    </form>
  );
}
