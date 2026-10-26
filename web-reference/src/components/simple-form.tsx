"use client";

import { useId } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Field, Input, Select, Textarea, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "date" | "time" | "select" | "money" | "checkbox" | "email" | "url";
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
  defaultChecked?: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
  span?: "full" | "half" | "third";
};

const SPAN = { full: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-2" } as const;

export function SimpleForm({
  action,
  fields,
  submitLabel,
  pendingLabel = "Saving",
  resetOnSuccess = true,
  hidden,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: FieldSpec[];
  submitLabel: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  hidden?: Record<string, string>;
}) {
  const prefix = useId();
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={resetOnSuccess}>
      {(state) => (
        <>
          <FormMessage state={state} />
          {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          <div className="grid gap-4 sm:grid-cols-6">
            {fields.map((f) => {
              const id = `${prefix}-${f.name}`;
              const error = state.fieldErrors?.[f.name];
              const span = cx("col-span-6", SPAN[f.span ?? "full"]);
              const described = error ? `${id}-error` : undefined;
              if (f.type === "checkbox") {
                return <Checkbox key={f.name} name={f.name} label={f.label} description={f.hint} defaultChecked={f.defaultChecked} className={span} />;
              }
              return (
                <Field key={f.name} label={f.label} htmlFor={id} hint={f.hint} error={error} className={span}>
                  {f.type === "textarea" ? (
                    <Textarea id={id} name={f.name} defaultValue={f.defaultValue} placeholder={f.placeholder} maxLength={f.maxLength} aria-invalid={Boolean(error)} aria-describedby={described} />
                  ) : f.type === "select" ? (
                    <Select id={id} name={f.name} defaultValue={f.defaultValue} aria-invalid={Boolean(error)} aria-describedby={described}>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      name={f.name}
                      type={f.type === "money" ? "text" : (f.type ?? "text")}
                      inputMode={f.type === "money" ? "decimal" : undefined}
                      defaultValue={f.defaultValue}
                      placeholder={f.placeholder ?? (f.type === "money" ? "0.00" : undefined)}
                      maxLength={f.maxLength}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      aria-invalid={Boolean(error)}
                      aria-describedby={described}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <div className="flex justify-end">
            <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
