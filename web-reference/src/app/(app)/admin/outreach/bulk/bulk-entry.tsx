"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Save } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Badge, Field, Input, Textarea, cx } from "@/components/ui";
import { saveBulkDraft } from "../bulk-action";
import { BulkToggle } from "../bulk-toggle";

export type BulkEntryData = {
  id: string;
  name: string;
  detail: string;
  email: string;
  subject: string;
  body: string;
  custom: boolean;
  blocked: boolean;
  emailsSent: number;
  replied: boolean;
  formUrl: string | null;
};

export function BulkEntry({ entry, index }: { entry: BulkEntryData; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `bulk-entry-${entry.id}`;

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} className="group flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[12px] text-ink-3">{index + 1}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink group-hover:underline">{entry.subject}</span>
            <span className="block truncate text-[13px] text-ink-2">To {entry.name} · {entry.email}</span>
            <span className="block truncate text-[12px] text-ink-3">{entry.detail}</span>
          </span>
          <ChevronDown className={cx("mt-1 size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={entry.custom ? "accent" : "neutral"}>{entry.custom ? "Written" : "Preset letter"}</Badge>
          {entry.blocked ? <Badge tone="warning">Do not contact</Badge> : null}
          {entry.replied ? <Badge tone="positive">Replied</Badge> : entry.emailsSent > 0 ? <Badge tone="warning">Emailed {entry.emailsSent}x</Badge> : null}
          <BulkToggle ids={[entry.id]} on={false} label="Remove" />
          <Link href={`/admin/outreach/contacts/${entry.id}`} className="text-sm text-ink-3 hover:text-ink">History</Link>
        </div>
      </div>
      <p className="mt-1 pl-9 text-[12px] text-ink-3">
        {entry.formUrl ? (
          <>School form: <a href={entry.formUrl} target="_blank" rel="noreferrer" className="font-mono text-accent underline-offset-2 hover:underline">{entry.formUrl}</a></>
        ) : "No school form. The address did not match a school, so no form link can be added."}
      </p>
      {open ? (
        <div id={panelId} className="dialog-in mt-3 rounded-md border border-line bg-canvas p-4">
          <ActionForm key={entry.custom ? "written" : "preset"} action={saveBulkDraft} className="space-y-3">
            {(state) => (
              <>
                <input type="hidden" name="contact_id" value={entry.id} />
                <FormMessage state={state} />
                <Field label="Subject" htmlFor={`${panelId}-subject`}>
                  <Input id={`${panelId}-subject`} name="subject" defaultValue={entry.subject} />
                </Field>
                <Field label="Message" htmlFor={`${panelId}-body`} hint="The school form line is added or removed when you send, based on the checkbox there.">

                  <Textarea id={`${panelId}-body`} name="body" defaultValue={entry.body} className="min-h-72 font-sans text-[13px] leading-relaxed" />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton name="intent" value="save" size="sm" pendingLabel="Saving">
                    <Save className="size-4" aria-hidden />
                    Save this email
                  </SubmitButton>
                  {entry.custom ? (
                    <SubmitButton name="intent" value="template" variant="ghost" size="sm" pendingLabel="Resetting">
                      Use the preset letter instead
                    </SubmitButton>
                  ) : null}
                </div>
              </>
            )}
          </ActionForm>
        </div>
      ) : null}
    </li>
  );
}
