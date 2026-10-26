"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/forms";
import { Input, Select } from "@/components/ui";
import { ATTENDANCE_LABEL, type AttendanceStatus } from "@/lib/events";
import type { ActionState } from "@/lib/action-state";

export function AttendanceControl({ action, current }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; current: AttendanceStatus | null }) {
  const [state, formAction] = useActionState(action, {});
  const [status, setStatus] = useState<string>(current ?? "present");
  const needsReason = current !== null && status !== current;
  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Attendance status" className="h-8 w-32 text-[13px]">
        {(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((s) => (
          <option key={s} value={s}>{ATTENDANCE_LABEL[s]}</option>
        ))}
      </Select>
      {needsReason ? <Input name="reason" placeholder="Reason for change" maxLength={500} className="h-8 w-48 text-[13px]" aria-label="Reason for change" required /> : null}
      <SubmitButton size="sm" variant="secondary" disabled={current !== null && !needsReason}>
        {current ? "Update" : "Record"}
      </SubmitButton>
      {state.error ? <span className="w-full text-right text-[12px] text-danger">{state.error}</span> : null}
    </form>
  );
}
