"use client";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function NotesForm({ action, notes, disabled }: { action: (state: ActionState, formData: FormData) => Promise<ActionState>; notes: string | null; disabled?: boolean }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(state) => (
        <>
          <FormMessage state={state} />
          <Textarea name="admin_notes" defaultValue={notes ?? ""} maxLength={4000} placeholder="Only admins see these. Call notes, who to follow up with, anything." aria-label="Notes" className="min-h-32 text-[13px]" disabled={disabled} />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Saving" disabled={disabled}>Save notes</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
