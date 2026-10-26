"use client";

import { useActionState } from "react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ProfileForm({
  action,
  initial,
  timezones,
}: {
  action: Action;
  initial: { greek_letters: string | null; description: string | null; founded_year: number | null; timezone: string };
  timezones: string[];
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Greek letters" htmlFor="greek_letters" error={state.fieldErrors?.greek_letters}>
          <Input id="greek_letters" name="greek_letters" defaultValue={initial.greek_letters ?? ""} maxLength={24} />
        </Field>
        <Field label="Founded" htmlFor="founded_year" error={state.fieldErrors?.founded_year}>
          <Input id="founded_year" name="founded_year" inputMode="numeric" defaultValue={initial.founded_year ?? ""} placeholder="1987" />
        </Field>
        <Field label="Time zone" htmlFor="timezone" error={state.fieldErrors?.timezone} hint="Used for due dates, events, and reports.">
          <Select id="timezone" name="timezone" defaultValue={initial.timezone}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="About the chapter" htmlFor="description" hint="Shown to members on the chapter overview.">
        <Textarea id="description" name="description" defaultValue={initial.description ?? ""} maxLength={2000} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving">Save</SubmitButton>
      </div>
    </form>
  );
}

const MODULE_COPY = {
  recruitment: ["Recruitment", "Prospect pipeline, contact log, bid tracking, and restricted notes."],
  philanthropy: ["Philanthropy", "Fundraising campaigns, donations, volunteer shifts, and service hours."],
  housing: ["Housing", "Facilities, maintenance requests, chores, and inventory."],
  standards: ["Standards", "Policies, acknowledgments, training, and confidential reports."],
  academics: ["Academics", "Study hours, goals, and mentorship pairs."],
} as const;

export function ModulesForm({ action, modules }: { action: Action; modules: Record<string, boolean> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="space-y-3">
        {(Object.keys(MODULE_COPY) as Array<keyof typeof MODULE_COPY>).map((key) => (
          <Checkbox key={key} name={key} defaultChecked={Boolean(modules[key])} label={MODULE_COPY[key][0]} description={MODULE_COPY[key][1]} />
        ))}
      </div>
      <p className="text-xs text-ink-3">Turning a module off hides it. Its records are kept.</p>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Saving">Save modules</SubmitButton>
      </div>
    </form>
  );
}

export function TransferForm({ action, members, slug }: { action: Action; members: Array<{ id: string; name: string }>; slug: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Member" htmlFor="membership_id" error={state.fieldErrors?.membership_id}>
        <Select id="membership_id" name="membership_id" defaultValue="">
          <option value="" disabled>Choose a member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </Field>
      <Checkbox name="remove_self" label="Remove my administrator role" description="Leave unchecked to share administrator access." />
      <Field label={`Type ${slug} to confirm`} htmlFor="confirmation" error={state.fieldErrors?.confirmation}>
        <Input id="confirmation" name="confirmation" autoComplete="off" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Transferring">Grant administrator access</SubmitButton>
      </div>
    </form>
  );
}

export function ClosureForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Why is the chapter closing?" htmlFor="reason" error={state.fieldErrors?.reason} hint="At least 20 characters. A platform administrator has to accept this before anything closes.">
        <Textarea id="reason" name="reason" maxLength={2000} defaultValue={String(state.values?.reason ?? "")} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Sending">Request closure</SubmitButton>
      </div>
    </form>
  );
}
