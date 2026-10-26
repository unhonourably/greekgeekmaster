"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { ConfirmSubmit, FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;
type RoleOption = { key: string; id: string; name: string };

const CLASS_OPTIONS = [
  ["active", "Active"],
  ["new_member", "New member"],
  ["associate", "Associate"],
  ["alumni", "Alumni"],
] as const;

export function InviteForm({ action, roles }: { action: Action; roles: RoleOption[] }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const v = state.ok ? {} : (state.values ?? {});
  const link = state.ok ? state.values?.link : undefined;
  return (
    <form ref={ref} action={formAction} className="space-y-4" noValidate onSubmit={() => setCopied(false)}>
      <FormMessage state={state} />
      {link ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={link} aria-label="Invitation link" className="font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="invite-email" error={state.fieldErrors?.email}>
          <Input id="invite-email" name="email" type="email" autoComplete="off" defaultValue={v.email} />
        </Field>
        <Field label="Name" htmlFor="invite-name" hint="Optional">
          <Input id="invite-name" name="full_name" defaultValue={v.full_name} maxLength={120} />
        </Field>
      </div>
      <Field label="Member class" htmlFor="invite-class" className="sm:w-60">
        <Select id="invite-class" name="member_class" defaultValue="active">
          {CLASS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      {roles.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium text-ink">Roles on joining</legend>
          <p className="mt-0.5 text-xs text-ink-3">Optional. You can only grant roles whose permissions you hold yourself.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <Checkbox key={r.key} name="roles" value={r.key} label={r.name} />
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Adding">Add member</SubmitButton>
      </div>
    </form>
  );
}

type Preview = { rows: Array<{ line: number; email: string; fullName: string | null; memberClass: string }>; errors: string[] };

export function ImportForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const preview: Preview | null = state.values?.preview ? JSON.parse(state.values.preview) : null;
  const failures: string[] = state.values?.failures ? JSON.parse(state.values.failures) : [];
  if (preview) {
    return (
      <form action={formAction} className="space-y-4">
        <Notice tone="info" title={state.message}>Review the list, then send. Each person gets their own invitation link by email.</Notice>
        <input type="hidden" name="csv" value={state.values?.csv ?? ""} />
        <input type="hidden" name="confirm" value="yes" />
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-subtle text-left text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Class</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.line} className="border-t border-line">
                  <td className="px-3 py-1.5 tnum text-ink-3">{r.line}</td>
                  <td className="px-3 py-1.5">{r.email}</td>
                  <td className="px-3 py-1.5">{r.fullName ?? <span className="text-ink-3">None</span>}</td>
                  <td className="px-3 py-1.5">{CLASS_OPTIONS.find(([v]) => v === r.memberClass)?.[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.errors.length > 0 ? (
          <Notice tone="warning" title="These rows will be skipped">
            <ul className="list-disc space-y-0.5 pl-4">
              {preview.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <a href="" className="inline-flex h-9 items-center rounded-md px-3 text-sm text-ink-2 hover:bg-subtle">Start over</a>
          <SubmitButton pendingLabel="Sending invitations">Send {preview.rows.length} invitation{preview.rows.length === 1 ? "" : "s"}</SubmitButton>
        </div>
      </form>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      {failures.length > 0 ? (
        <Notice tone="warning" title="Skipped">
          <ul className="list-disc space-y-0.5 pl-4">
            {failures.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <Field label="CSV file" htmlFor="import-file" hint="Columns: email, name, class. A header row is optional. Up to 500 people.">
        <Input id="import-file" name="file" type="file" accept=".csv,text/csv" className="py-1.5" />
      </Field>
      <Field label="Or paste rows" htmlFor="import-csv">
        <Textarea id="import-csv" name="csv" className="min-h-28 font-mono text-xs" placeholder={"email,name,class\njordan@school.edu,Jordan Lee,active"} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Checking">Preview import</SubmitButton>
      </div>
    </form>
  );
}

export function MemberEditForm({ action, memberClass, status, disabled }: { action: Action; memberClass: string; status: string; disabled?: boolean }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Member class" htmlFor="member_class">
          <Select id="member_class" name="member_class" defaultValue={memberClass} disabled={disabled}>
            {CLASS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" hint="Inactive members keep access but are excluded from default billing.">
          <Select id="status" name="status" defaultValue={status} disabled={disabled}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="ended">Former member</option>
          </Select>
        </Field>
      </div>
      <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason} hint="Required for suspensions and removals. Recorded in membership history.">
        <Input id="reason" name="reason" maxLength={300} disabled={disabled} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton disabled={disabled} pendingLabel="Saving">Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveMemberForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <Field label="Reason" htmlFor="remove-reason" error={state.fieldErrors?.reason} hint="The member is notified, and the reason is kept on the membership record.">
        <Input id="remove-reason" name="reason" maxLength={300} />
      </Field>
      <div className="flex justify-end">
        <ConfirmSubmit message={`Remove ${name} from the chapter? They lose access to chats, housing, and officer roles.`} variant="danger" size="md">
          Remove from chapter
        </ConfirmSubmit>
      </div>
    </form>
  );
}

export function RoleAssignForm({ action, roles }: { action: Action; roles: RoleOption[] }) {
  const [state, formAction] = useActionState(action, {});
  if (roles.length === 0) return <p className="text-sm text-ink-3">This member holds every role you can grant.</p>;
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <div className="flex items-end gap-2">
        <Field label="Add role" htmlFor="role_id" className="flex-1">
          <Select id="role_id" name="role_id" defaultValue="">
            <option value="" disabled>Choose a role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Adding">Add</SubmitButton>
      </div>
    </form>
  );
}

export function RecruiterForm({ action, options, current }: { action: Action; options: Array<{ id: string; name: string; chair: boolean }>; current: string | null }) {
  const [state, formAction] = useActionState(action, {});
  const chairs = options.filter((o) => o.chair);
  const others = options.filter((o) => !o.chair);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <Select name="recruiter" defaultValue={current ?? ""} aria-label="Recruited by">
        <option value="">Not recorded</option>
        {chairs.length ? (
          <optgroup label="Recruitment">
            {chairs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </optgroup>
        ) : null}
        <optgroup label="Members">
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </optgroup>
      </Select>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">Save recruiter</SubmitButton>
    </form>
  );
}
