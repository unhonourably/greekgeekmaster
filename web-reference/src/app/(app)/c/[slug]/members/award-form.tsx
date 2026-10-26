"use client";

import { useActionState, useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

const ICONS = ["award", "star", "trophy", "medal", "heart-handshake", "graduation-cap", "book-open", "crown", "flag", "shield"];

export function AwardForm({ action, badges }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; badges: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(action, {});
  const [choice, setChoice] = useState(badges.length ? "" : "new");
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <Field label="Badge" htmlFor="badge_id">
        <Select id="badge_id" name="badge_id" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="" disabled>Choose a badge</option>
          {badges.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option value="new">Create a new badge</option>
        </Select>
      </Field>
      {choice === "new" ? (
        <div className="space-y-3 rounded-md border border-line p-3">
          <Field label="Badge name" htmlFor="badge-name" error={state.fieldErrors?.name}>
            <Input id="badge-name" name="name" maxLength={60} placeholder="Service leader" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="badge-category">
              <Select id="badge-category" name="category" defaultValue="achievement">
                <option value="achievement">Achievement</option>
                <option value="service">Service</option>
                <option value="academic">Academic</option>
                <option value="leadership">Leadership</option>
              </Select>
            </Field>
            <Field label="Icon" htmlFor="badge-icon">
              <Select id="badge-icon" name="icon" defaultValue="award">
                {ICONS.map((i) => (
                  <option key={i} value={i}>{i.replace(/-/g, " ")}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="badge-description" hint="Optional">
            <Input id="badge-description" name="description" maxLength={300} />
          </Field>
        </div>
      ) : null}
      <Field label="Note" htmlFor="award-note" hint="Optional. Shown on the profile.">
        <Input id="award-note" name="note" maxLength={300} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" size="sm" pendingLabel="Awarding">Award badge</SubmitButton>
      </div>
    </form>
  );
}
