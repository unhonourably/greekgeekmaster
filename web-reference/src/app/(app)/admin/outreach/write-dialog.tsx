"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ListPlus } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Badge, Button, Field, Input, Textarea } from "@/components/ui";
import { BulkToggle } from "./bulk-toggle";
import { sendOutreachLetter } from "./letter-action";
import { SendConfirm } from "./send-confirm";
import { Collapse, SentPanel } from "./sent-panel";

export type LetterDraft = {
  id: string;
  name: string;
  hasName: boolean;
  role: string;
  organization: string;
  email: string;
  emailsSent: number;
  replies: number;
  blocked: boolean;
  subject: string;
  body: string;
  inBulk: boolean | null;
};

export function WriteLetters({ drafts, from, replyTo, canSend }: { drafts: LetterDraft[]; from: string; replyTo: string; canSend: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const titleId = useId();
  const letter = drafts.find((draft) => draft.id === openId) ?? null;

  useEffect(() => {
    if (!openId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.getElementById("send-subject")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  return (
    <>
      <ul className="divide-y divide-line">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{draft.name}</p>
              <p className="text-[13px] text-ink-2">{draft.hasName ? `${draft.role}, ${draft.organization}` : draft.role}</p>
              <p className="truncate font-mono text-[12px] text-ink-3">{draft.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {draft.replies > 0 ? <Badge tone="positive">Replied</Badge> : draft.emailsSent > 0 ? <Badge>Sent</Badge> : null}
              {draft.blocked ? <Badge tone="warning">Do not contact</Badge> : null}
              {draft.inBulk ? <Badge tone="accent">On bulk list</Badge> : null}
              {draft.inBulk === null || draft.blocked ? null : <BulkToggle ids={[draft.id]} on={!draft.inBulk} />}
              <button id={`write-${draft.id}`} type="button" onClick={() => setOpenId(draft.id)} className="text-sm text-ink hover:underline">Write</button>
              <Link href={`/admin/outreach/contacts/${draft.id}`} className="text-sm text-ink-3 hover:text-ink">History</Link>
            </div>
          </li>
        ))}
      </ul>
      {letter ? (
        <div className="veil-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6" onClick={() => setOpenId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="dialog-in flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-base font-semibold text-ink">Write to {letter.name}</h2>
                <p className="mt-0.5 truncate text-[13px] text-ink-3">{letter.hasName ? `${letter.role}, ${letter.organization}` : letter.role}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => { setOpenId(null); document.getElementById(`write-${letter.id}`)?.focus(); }} className="rounded-md p-1 text-ink-3 hover:bg-subtle hover:text-ink">
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                  <path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <ActionForm key={letter.id} action={sendOutreachLetter}>
                {(state) => (
                  <>
                    {state.ok ? <SentPanel queued={state.values?.intent === "queue"} message={state.message} extra={<Button type="button" variant="ghost" size="sm" onClick={() => setOpenId(null)}>Close</Button>} /> : null}
                    <Collapse open={!state.ok}>
                    <div className="space-y-3">
                    <input type="hidden" name="contact_id" value={letter.id} />
                    <FormMessage state={state} />
                    <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
                      <dt className="text-ink-3">From</dt>
                      <dd className="truncate text-ink-2">{from}</dd>
                      <dt className="text-ink-3">To</dt>
                      <dd className="truncate text-ink">{letter.email}</dd>
                      <dt className="text-ink-3">Replies go to</dt>
                      <dd className="truncate text-ink-2">{replyTo}</dd>
                    </dl>
                    <Field label="Subject" htmlFor="send-subject">
                      <Input id="send-subject" name="subject" defaultValue={letter.subject} />
                    </Field>
                    <Field label="Message" htmlFor="send-body">
                      <Textarea id="send-body" name="body" defaultValue={letter.body} className="min-h-64 font-sans text-[13px] leading-relaxed" />
                    </Field>
                    <SendConfirm label={letter.emailsSent > 0 ? "Send again" : "Send email"} disabled={letter.blocked || !canSend}>
                      {letter.inBulk === null ? null : (
                        <SubmitButton name="intent" value="queue" variant="secondary" pendingLabel="Saving" disabled={letter.blocked}>
                          <ListPlus className="size-4" aria-hidden />
                          {letter.inBulk ? "Update bulk list email" : "Add to bulk list"}
                        </SubmitButton>
                      )}
                    </SendConfirm>
                    </div>
                    </Collapse>
                  </>
                )}
              </ActionForm>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
