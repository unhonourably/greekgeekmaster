"use client";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { FORM_HELP as HELP } from "@/lib/outreach";

export function IntroForm({ action }: { action: (state: ActionState, formData: FormData) => Promise<ActionState> }) {
  return (
    <ActionForm action={action} className="mt-10 space-y-4">
      {(state) => (
        <>
          <FormMessage state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="full_name"><Input id="full_name" name="full_name" required autoComplete="name" /></Field>
            <Field label="Your role" htmlFor="role"><Input id="role" name="role" placeholder="President" required /></Field>
          </div>
          <Field label="Organization" htmlFor="organization" hint="The chapter or council you represent.">
            <Input id="organization" name="organization" placeholder="Sigma Chi, or IFC" required />
          </Field>
          <Field label="Council" htmlFor="council">
            <Select id="council" name="council" defaultValue="IFC">
              <option value="IFC">IFC</option>
              <option value="Panhellenic">Panhellenic</option>
              <option value="MGC">MGC</option>
              <option value="NPHC">NPHC</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Total members" htmlFor="member_count"><Input id="member_count" name="member_count" type="number" min={0} max={5000} required /></Field>
            <Field label="In the house" htmlFor="in_house"><Input id="in_house" name="in_house" type="number" min={0} max={5000} /></Field>
            <Field label="Out of the house" htmlFor="out_of_house"><Input id="out_of_house" name="out_of_house" type="number" min={0} max={5000} /></Field>
          </div>
          <Field label="Dues" htmlFor="dues" hint="Whatever you know, such as about $600 a semester. Optional.">
            <Input id="dues" name="dues" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" autoComplete="tel" /></Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-ink">How should we continue?</legend>
            <Checkbox name="prefer_email" label="Email" />
            <Checkbox name="prefer_text" label="Text" />
            <Checkbox name="prefer_call" label="Phone call" />
          </fieldset>
          <Field label="Best time to reach you" htmlFor="best_time"><Input id="best_time" name="best_time" placeholder="Weekday evenings" /></Field>
          <Field label="Interest" htmlFor="interest">
            <Select id="interest" name="interest" defaultValue="demo">
              <option value="demo">I want a short demo</option>
              <option value="learn_more">Send more information first</option>
              <option value="later">Not right now</option>
            </Select>
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-ink">What would help the chapter most?</legend>
            {HELP.map(([value, label]) => <Checkbox key={value} name="help" value={value} label={label} />)}
          </fieldset>
          <Field label="Anything else" htmlFor="notes"><Textarea id="notes" name="notes" className="min-h-24" /></Field>
          <SubmitButton pendingLabel="Sending">Send to GreekGeek</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
