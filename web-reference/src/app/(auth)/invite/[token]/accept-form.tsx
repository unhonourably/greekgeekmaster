"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/people";
import { Input, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export type RecruiterOption = { id: string; name: string; chair: boolean };

export function AcceptForm({ action, recruiters }: { action: (state: ActionState, formData: FormData) => Promise<ActionState>; recruiters: RecruiterOption[] | null }) {
  const [state, formAction] = useActionState(action, {});
  const [choice, setChoice] = useState<string>("");
  const [q, setQ] = useState("");
  const chairs = useMemo(() => (recruiters ?? []).filter((r) => r.chair), [recruiters]);
  const others = useMemo(() => (recruiters ?? []).filter((r) => !r.chair), [recruiters]);
  const [otherOpen, setOtherOpen] = useState(chairs.length === 0);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return others.filter((o) => !needle || o.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [others, q]);
  const picked = (recruiters ?? []).find((r) => r.id === choice);
  const ask = recruiters !== null && recruiters.length > 0;
  const ready = !ask || choice !== "";

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      {ask ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Who recruited you?</legend>
          <p className="text-[13px] text-ink-3">Only chapter officers see this. It helps the chapter credit the right recruiter.</p>
          <input type="hidden" name="recruiter" value={choice} />
          <div className="space-y-1.5 pt-1">
            {chairs.map((c) => (
              <Option key={c.id} selected={choice === c.id} onSelect={() => { setChoice(c.id); setOtherOpen(false); }}>
                <Avatar name={c.name} size="xs" />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-[11px] text-ink-3">Recruitment</span>
              </Option>
            ))}
            {others.length ? (
              <Option selected={otherOpen && !!picked && !picked.chair} onSelect={() => setOtherOpen(true)}>
                <span className="flex-1">{picked && !picked.chair ? `Someone else: ${picked.name}` : "Someone else"}</span>
              </Option>
            ) : null}
            {otherOpen && others.length ? (
              <div className="rounded-lg border border-line bg-canvas p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" aria-label="Search members" className="h-8 pl-8 text-[13px]" autoFocus={chairs.length > 0} />
                </div>
                <ul className="mt-1.5 max-h-48 overflow-y-auto">
                  {matches.length === 0 ? <li className="px-2 py-2 text-[13px] text-ink-3">No one matches.</li> : null}
                  {matches.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setChoice(o.id)}
                        className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", choice === o.id ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-subtle")}
                      >
                        <Avatar name={o.name} size="xs" />
                        <span className="flex-1 truncate">{o.name}</span>
                        {choice === o.id ? <Check className="size-4 text-accent" aria-hidden /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Option selected={choice === "unsure"} onSelect={() => { setChoice("unsure"); setOtherOpen(false); }}>
              <span className="flex-1 text-ink-2">I&apos;m not sure</span>
            </Option>
          </div>
        </fieldset>
      ) : null}
      <SubmitButton className="h-11! w-full rounded-lg! text-[15px]!" pendingLabel="Joining" disabled={!ready}>Accept invitation</SubmitButton>
      {!ready ? <p className="text-center text-[12px] text-ink-3">Choose who recruited you to continue.</p> : null}
    </form>
  );
}

function Option({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        selected ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-ink hover:border-line-strong",
      )}
    >
      <span className={cx("grid size-4 shrink-0 place-items-center rounded-full border", selected ? "border-accent bg-accent" : "border-line-strong")} aria-hidden>
        {selected ? <span className="size-1.5 rounded-full bg-on-accent" /> : null}
      </span>
      {children}
    </button>
  );
}
