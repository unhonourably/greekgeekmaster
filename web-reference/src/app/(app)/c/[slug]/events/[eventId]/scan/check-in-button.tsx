"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { TextLink } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function CheckInButton({ action, eventHref }: { action: (s: ActionState) => Promise<ActionState>; eventHref: string }) {
  const [state, formAction] = useActionState(action, {});
  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleCheck className="size-10 text-positive" aria-hidden />
        <p className="text-sm font-medium text-ink">{state.message}</p>
        <TextLink href={eventHref}>View event</TextLink>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingLabel="Checking in">Check in</SubmitButton>
    </form>
  );
}
