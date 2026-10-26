"use client";

import type { ReactNode } from "react";
import { ArrowLeft, CircleCheck, ListChecks, Send } from "lucide-react";
import { ButtonLink, cx } from "@/components/ui";

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cx(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function SentPanel({ message, extra, queued }: { message?: string; extra?: ReactNode; queued?: boolean }) {
  return (
    <div role="status" className="dialog-in flex flex-col items-center gap-4 py-8 text-center">
      {queued ? <ListChecks className="size-10 text-accent" aria-hidden /> : <CircleCheck className="size-10 text-positive" aria-hidden />}
      <div>
        <p className="text-base font-semibold text-ink">{queued ? "Added to bulk list" : "Email sent"}</p>
        {message ? <p className="mt-1 text-sm text-ink-2">{message}</p> : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/admin/outreach" variant="secondary" size="sm"><ArrowLeft className="size-4" aria-hidden />Back to outreach</ButtonLink>
        {queued ? (
          <ButtonLink href="/admin/outreach/bulk" size="sm"><ListChecks className="size-4" aria-hidden />View bulk list</ButtonLink>
        ) : (
          <ButtonLink href="/admin/outreach/sent" size="sm"><Send className="size-4" aria-hidden />View sent emails</ButtonLink>
        )}
        {extra}
      </div>
    </div>
  );
}
