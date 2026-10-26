"use client";

import { useState } from "react";
import { History, Send } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Button, ButtonLink, Checkbox } from "@/components/ui";
import { sendBulk } from "../bulk-action";
import { Collapse, SentPanel } from "../sent-panel";

export function BulkSend({ count, withForm, from, replyTo, canSend }: { count: number; withForm: number; from: string; replyTo: string; canSend: boolean }) {
  const [round, setRound] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [includeForm, setIncludeForm] = useState(true);

  function again() {
    setConfirming(false);
    setRound((value) => value + 1);
  }

  return (
    <ActionForm key={round} action={sendBulk}>
      {(state) => (
        <>
          {state.ok ? (
            <SentPanel
              message={state.message}
              extra={
                <>
                  {state.values?.run ? <ButtonLink href={`/admin/outreach/bulk/history/${state.values.run}`} variant="secondary" size="sm"><History className="size-4" aria-hidden />View this send</ButtonLink> : null}
                  {count > 0 ? <Button type="button" variant="ghost" size="sm" onClick={again}>Send the rest</Button> : null}
                </>
              }
            />
          ) : null}
          <Collapse open={!state.ok}>
            <div className="space-y-4">
              <FormMessage state={state} />
              <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
                <dt className="text-ink-3">From</dt>
                <dd className="truncate text-ink-2">{from}</dd>
                <dt className="text-ink-3">Replies go to</dt>
                <dd className="truncate text-ink-2">{replyTo}</dd>
                <dt className="text-ink-3">Emails</dt>
                <dd className="text-ink">{count} separate email{count === 1 ? "" : "s"}, each to one person with its own subject and message</dd>
              </dl>
              {confirming ? (
                <div className="dialog-in space-y-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
                  <Checkbox
                    name="include_form"
                    checked={includeForm}
                    onChange={(event) => setIncludeForm(event.target.checked)}
                    label="Include each school's chapter interest form"
                    description={
                      withForm === count
                        ? "Adds a \"Tell us about your chapter\" link to every email, pointing to that person's school form."
                        : `Adds a "Tell us about your chapter" link to each email. ${count - withForm} of ${count} have no matching school, so theirs go without one.`
                    }
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      Send {count} email{count === 1 ? "" : "s"} now, {includeForm ? "with" : "without"} the form link? This can&apos;t be undone.
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
                    <SubmitButton pendingLabel="Sending, keep this tab open" size="sm" disabled={!canSend || count === 0}>
                      <Send className="size-4" aria-hidden />
                      Yes, send {count}
                    </SubmitButton>
                  </div>
                </div>
              ) : (
                <Button type="button" disabled={!canSend || count === 0} onClick={() => setConfirming(true)}>
                  <Send className="size-4" aria-hidden />
                  Send all {count} email{count === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          </Collapse>
        </>
      )}
    </ActionForm>
  );
}
