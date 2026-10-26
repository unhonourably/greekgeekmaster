"use client";

import { ListPlus, ListX } from "lucide-react";
import { SubmitButton } from "@/components/forms";
import { setBulk } from "./bulk-action";

export function BulkToggle({ ids, on, label, disabled }: { ids: string[]; on: boolean; label?: string; disabled?: boolean }) {
  return (
    <form action={setBulk}>
      {ids.map((id) => <input key={id} type="hidden" name="contact_id" value={id} />)}
      <input type="hidden" name="on" value={on ? "1" : "0"} />
      <SubmitButton variant={on ? "secondary" : "ghost"} size="sm" disabled={disabled || ids.length === 0}>
        {on ? <ListPlus className="size-4" aria-hidden /> : <ListX className="size-4" aria-hidden />}
        {label ?? (on ? "Add to bulk mail list" : "Remove from bulk list")}
      </SubmitButton>
    </form>
  );
}
