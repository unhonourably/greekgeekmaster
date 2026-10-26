"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { ACTIVITY_KINDS, ACTIVITY_LABEL, OUTCOME_LABEL, type StageOutcome } from "@/lib/recruitment";
import type { ActionState } from "@/lib/action-state";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

export type ProspectInitial = {
  full_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  class_year: string;
  major: string;
  hometown: string;
  source: string;
  interests: string;
  follow_up: string;
  owner: string;
};

export function ProspectForm({ action, initial, owners, readOnly }: { action: Action; initial?: ProspectInitial; owners: Array<{ id: string; name: string }> | null; readOnly?: boolean }) {
  const [state, formAction] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name" error={e.full_name}>
            <Input id="full_name" name="full_name" defaultValue={initial?.full_name} maxLength={120} />
          </Field>
          <Field label="Preferred name" htmlFor="preferred_name" error={e.preferred_name}>
            <Input id="preferred_name" name="preferred_name" defaultValue={initial?.preferred_name} maxLength={60} />
          </Field>
          <Field label="Email" htmlFor="email" error={e.email}>
            <Input id="email" name="email" type="email" defaultValue={initial?.email} maxLength={254} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={e.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone} maxLength={24} />
          </Field>
          <Field label="Graduation year" htmlFor="class_year" error={e.class_year}>
            <Input id="class_year" name="class_year" type="number" min={1990} max={2100} defaultValue={initial?.class_year} />
          </Field>
          <Field label="Major" htmlFor="major" error={e.major}>
            <Input id="major" name="major" defaultValue={initial?.major} maxLength={120} />
          </Field>
          <Field label="Hometown" htmlFor="hometown" error={e.hometown}>
            <Input id="hometown" name="hometown" defaultValue={initial?.hometown} maxLength={120} />
          </Field>
          <Field label="How we met" htmlFor="source" error={e.source} hint="For example: info night, referral, orientation fair">
            <Input id="source" name="source" defaultValue={initial?.source} maxLength={80} />
          </Field>
        </div>
        <Field label="Interests" htmlFor="interests" hint="Separate with commas">
          <Input id="interests" name="interests" defaultValue={initial?.interests} maxLength={600} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next follow-up" htmlFor="follow_up" error={e.follow_up} hint="The recruiter gets a reminder that morning.">
            <Input id="follow_up" name="follow_up" type="date" defaultValue={initial?.follow_up} />
          </Field>
          {owners ? (
            <Field label="Assigned recruiter" htmlFor="owner" error={e.owner}>
              <Select id="owner" name="owner" defaultValue={initial?.owner ?? ""}>
                <option value="">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </fieldset>
      {!readOnly ? (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving">{initial ? "Save" : "Add prospect"}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function NoteForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      {(state) => (
        <>
          {state.error ? <FormMessage state={state} /> : null}
          <Field label="Add a note" htmlFor="note-body" error={state.fieldErrors?.body}>
            <Textarea id="note-body" name="body" maxLength={4000} className="min-h-20" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox name="restricted" label="Restricted" description="Only you and the recruitment chair can read it." />
            <SubmitButton size="sm" pendingLabel="Saving">Add note</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function ActivityForm({ action, events, today }: { action: Action; events: Array<{ id: string; label: string }>; today: string }) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      {(state) => (
        <>
          {state.error ? <FormMessage state={state} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="kind" error={state.fieldErrors?.kind}>
              <Select id="kind" name="kind" defaultValue="meeting">
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>{ACTIVITY_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="date" error={state.fieldErrors?.date}>
              <Input id="date" name="date" type="date" defaultValue={today} max={today} />
            </Field>
          </div>
          {events.length ? (
            <Field label="Event" htmlFor="event_id" hint="Only used when the type is an event.">
              <Select id="event_id" name="event_id" defaultValue="">
                <option value="">None</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.label}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Notes" htmlFor="activity-notes">
            <Input id="activity-notes" name="notes" maxLength={2000} />
          </Field>
          <div className="flex justify-end">
            <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">Log activity</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function StageRowForm({
  action,
  initial,
  deleteAction,
  nextPosition = 1,
}: {
  action: Action;
  initial?: { name: string; outcome: StageOutcome; position: number };
  deleteAction?: () => Promise<void>;
  nextPosition?: number;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2" noValidate>
      <Input name="position" type="number" min={1} max={99} defaultValue={initial?.position ?? nextPosition} aria-label="Order" className="w-16" />
      <div className="min-w-40 flex-1">
        <Input name="name" defaultValue={initial?.name} maxLength={40} aria-label="Stage name" placeholder="Stage name" />
        {state.fieldErrors?.name ? <p className="mt-1 text-[12px] text-danger">{state.fieldErrors.name}</p> : null}
      </div>
      <Select name="outcome" defaultValue={initial?.outcome ?? "open"} aria-label="Outcome" className="w-40">
        {(Object.keys(OUTCOME_LABEL) as StageOutcome[]).map((o) => (
          <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
        ))}
      </Select>
      <SubmitButton size="sm" variant="secondary" className="h-9">{initial ? "Save" : "Add"}</SubmitButton>
      {deleteAction ? (
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="h-9"
          formAction={deleteAction}
          onClick={(ev) => {
            if (!window.confirm("Delete this stage?")) ev.preventDefault();
          }}
        >
          Delete
        </Button>
      ) : null}
      {state.error ? <p className="w-full text-[12px] text-danger">{state.error}</p> : state.message ? <p className="w-full text-[12px] text-positive">{state.message}</p> : null}
    </form>
  );
}
