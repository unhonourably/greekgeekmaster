"use client";

import { useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { SubmitButton } from "@/components/forms";
import { Button, Checkbox } from "@/components/ui";

export function SendConfirm({ label, disabled, includeFormDefault = true, children }: { label: string; disabled?: boolean; includeFormDefault?: boolean; children?: ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  const [includeForm, setIncludeForm] = useState(includeFormDefault);

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={disabled} onClick={() => setConfirming(true)}>
          <Send className="size-4" aria-hidden />
          {label}
        </Button>
        {children}
      </div>
    );
  }

  return (
    <div className="dialog-in space-y-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
      <Checkbox
        name="include_form"
        checked={includeForm}
        onChange={(event) => setIncludeForm(event.target.checked)}
        label="Include the chapter interest form"
        description="Adds a &quot;Tell us about your chapter&quot; link to their school's form. Unchecked, any form link is taken out of the message. If their email doesn't match a school, it goes without one."
      />
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink">Send this email now, {includeForm ? "with" : "without"} the form link?</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
        <SubmitButton name="intent" value="send" size="sm" pendingLabel="Sending" disabled={disabled}>
          <Send className="size-4" aria-hidden />
          Yes, send
        </SubmitButton>
      </div>
    </div>
  );
}
