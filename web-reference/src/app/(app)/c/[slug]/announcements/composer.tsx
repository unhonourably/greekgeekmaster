"use client";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { PhotoPicker, RichEditor } from "@/components/rich-content";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

type Upload = (formData: FormData) => Promise<{ path?: string; error?: string }>;

export function AnnouncementComposer({ action, canOfficers, upload }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; canOfficers: boolean; upload: Upload }) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess>
      {(state) => (
        <>
          <FormMessage state={state} />
          <Field label="Title" htmlFor="title" error={state.fieldErrors?.title}>
            <Input id="title" name="title" maxLength={140} />
          </Field>
          <Field label="Message" htmlFor="body" error={state.fieldErrors?.body} hint="Format the message, add links, and insert pictures in the text.">
            <RichEditor id="body" name="body" upload={upload} placeholder="Write the announcement" />
          </Field>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-ink">Pictures</p>
            <PhotoPicker name="image_paths" upload={upload} />
            <p className="text-[13px] text-ink-3">Up to 6. These show under the announcement.</p>
          </div>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            {canOfficers ? (
              <Field label="Audience" htmlFor="audience" className="w-48">
                <Select id="audience" name="audience" defaultValue="all">
                  <option value="all">Whole chapter</option>
                  <option value="officers">Officers only</option>
                </Select>
              </Field>
            ) : null}
            <div className="space-y-2 pt-1">
              <Checkbox name="pinned" label="Pin to the top" />
              <Checkbox name="requires_ack" label="Ask members to acknowledge" description="Track who has read it." />
              <Checkbox name="comments_enabled" label="Allow comments" description="You can turn comments off later. Other officers cannot." defaultChecked />
            </div>
          </div>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Publishing">Publish</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function CommentForm({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  return (
    <ActionForm action={action} className="mt-3 space-y-2" resetOnSuccess>
      {(state) => (
        <>
          <div className="flex gap-2">
            <Input name="body" maxLength={2000} placeholder="Write a comment" aria-label="Comment" />
            <SubmitButton size="sm" pendingLabel="Posting">Post</SubmitButton>
          </div>
          {state.error || state.fieldErrors?.body ? <p className="text-[13px] text-danger">{state.error ?? state.fieldErrors?.body}</p> : null}
        </>
      )}
    </ActionForm>
  );
}
