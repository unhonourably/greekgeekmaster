"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;
export type PermissionOption = { key: string; category: string; description: string; sensitive: boolean; held: boolean };

const TONES = [
  ["neutral", "Gray"],
  ["accent", "Accent"],
  ["gold", "Gold"],
  ["slate", "Blue"],
  ["green", "Green"],
  ["rose", "Red"],
] as const;

export function RoleForm({
  action,
  permissions,
  initial,
  locked,
}: {
  action: Action;
  permissions: PermissionOption[];
  initial?: { name: string; description: string | null; badge_tone: string; is_officer: boolean; permissions: string[] };
  locked?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const selected = new Set(initial?.permissions ?? []);
  const groups = new Map<string, PermissionOption[]>();
  for (const p of permissions) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={initial?.name} maxLength={60} disabled={locked} placeholder="Social chair" />
        </Field>
        <Field label="Badge color" htmlFor="badge_tone">
          <Select id="badge_tone" name="badge_tone" defaultValue={initial?.badge_tone ?? "neutral"} disabled={locked}>
            {TONES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="description" hint="Optional. Shown to officers when assigning the role.">
        <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} maxLength={300} className="min-h-16" disabled={locked} />
      </Field>
      <Checkbox name="is_officer" defaultChecked={initial?.is_officer ?? true} disabled={locked} label="Officer role" description="Officer roles appear first in the directory and can be mentioned as a group in chat." />
      <fieldset className="space-y-5">
        <legend className="text-sm font-medium text-ink">Permissions</legend>
        {locked ? <p className="text-sm text-ink-3">The administrator role always has every permission.</p> : null}
        {[...groups.entries()].map(([category, items]) => (
          <div key={category}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{category}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((p) => (
                <Checkbox
                  key={p.key}
                  name="permissions"
                  value={p.key}
                  defaultChecked={locked || selected.has(p.key)}
                  disabled={locked || !p.held}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      {p.description}
                      {!p.held ? <Lock className="size-3 text-ink-3" aria-label="You do not hold this permission" /> : null}
                    </span>
                  }
                  description={p.sensitive ? "Sensitive" : undefined}
                />
              ))}
            </div>
          </div>
        ))}
        {!locked ? (
          <>
            {permissions
              .filter((p) => !p.held && selected.has(p.key))
              .map((p) => (
                <input key={p.key} type="hidden" name="permissions" value={p.key} />
              ))}
            <p className="text-xs text-ink-3">Locked permissions are ones you do not hold. Only someone who holds them can add or remove them.</p>
          </>
        ) : null}
      </fieldset>
      {!locked ? (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving">{initial ? "Save role" : "Create role"}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
