"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { Avatar } from "@/components/people";
import { Checkbox, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;
type Person = { user_id: string; name: string };

function PeoplePicker({ people, max }: { people: Person[]; max?: number }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 100), [people, q]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="pl-8" aria-label="Search members" />
      </div>
      <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-line p-2">
        {shown.length === 0 ? <p className="p-2 text-sm text-ink-3">No one matches.</p> : null}
        {shown.map((p) => (
          <Checkbox
            key={p.user_id}
            name="members"
            value={p.user_id}
            label={p.name}
            checked={picked.has(p.user_id)}
            disabled={!picked.has(p.user_id) && max !== undefined && picked.size >= max}
            onChange={(e) => {
              const next = new Set(picked);
              if (e.target.checked) next.add(p.user_id);
              else next.delete(p.user_id);
              setPicked(next);
            }}
          />
        ))}
      </div>
      {[...picked].filter((id) => !shown.some((s) => s.user_id === id)).map((id) => (
        <input key={id} type="hidden" name="members" value={id} />
      ))}
      <p className="text-xs text-ink-3">{picked.size} selected{max ? ` of up to ${max}` : ""}</p>
    </div>
  );
}

export function NewMessageForm({ action, people }: { action: Action; people: Array<Person & { avatar_path: string | null; detail: string }> }) {
  const [state, formAction] = useActionState(action, {});
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.user_id, p])), [people]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => !needle || p.name.toLowerCase().includes(needle)).slice(0, 100);
  }, [people, q]);
  const full = picked.length >= 30;
  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 30 ? prev : [...prev, id]));
    setQ("");
    inputRef.current?.focus();
  };
  const isGroup = picked.length > 1;
  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      {picked.map((id) => (
        <input key={id} type="hidden" name="members" value={id} />
      ))}
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-canvas px-2 py-1.5 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
          <span className="px-1 text-sm text-ink-3">To</span>
          {picked.map((id) => {
            const p = byId.get(id);
            return (
              <span key={id} className="chip-in inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pl-0.5 pr-2 text-[13px] text-accent">
                <Avatar name={p?.name ?? "Member"} path={p?.avatar_path} size="xs" />
                {p?.name}
                <button type="button" onClick={() => toggle(id)} className="rounded-full text-accent/70 hover:text-accent" aria-label={`Remove ${p?.name}`}>
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            );
          })}
          <input
            suppressHydrationWarning
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !q && picked.length) setPicked((prev) => prev.slice(0, -1));
              if (e.key === "Enter") {
                e.preventDefault();
                if (q && shown[0]) toggle(shown[0].user_id);
              }
            }}
            placeholder={picked.length ? "Add more people" : "Type a name"}
            aria-label="Search members"
            autoFocus
            className="h-8 min-w-32 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        {isGroup ? (
          <div className="mt-3 flex items-center gap-2">
            <Users className="size-4 shrink-0 text-ink-3" aria-hidden />
            <Input name="name" maxLength={80} placeholder="Name this group (optional)" aria-label="Group name" className="h-8 max-w-sm text-[13px]" />
          </div>
        ) : null}
        {state.error ? (
          <div className="mt-3">
            <FormMessage state={state} />
          </div>
        ) : null}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4" aria-label="Members">
        {shown.length === 0 ? <li className="px-3 py-6 text-center text-sm text-ink-3">No one matches.</li> : null}
        {shown.map((p) => {
          const on = picked.includes(p.user_id);
          return (
            <li key={p.user_id}>
              <button
                type="button"
                onClick={() => toggle(p.user_id)}
                disabled={!on && full}
                aria-pressed={on}
                className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-40", on ? "bg-accent-soft/40" : "hover:bg-subtle")}
              >
                <Avatar name={p.name} path={p.avatar_path} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{p.name}</span>
                  {p.detail ? <span className="block truncate text-[12px] text-ink-3">{p.detail}</span> : null}
                </span>
                <span className={cx("grid size-5 place-items-center rounded-full border transition-colors", on ? "border-accent bg-accent text-on-accent" : "border-line-strong")}>
                  {on ? <Check className="size-3" aria-hidden /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
        <p className="text-[13px] text-ink-3">
          {picked.length === 0 ? "Pick one person for a direct message, or several for a group." : isGroup ? `Group with ${picked.length} people and you` : "Direct message"}
        </p>
        <SubmitButton pendingLabel="Starting" disabled={picked.length === 0}>
          {isGroup ? "Start group" : "Start chat"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function NewConversationForm({ action, people, kinds, defaultKind }: { action: Action; people: Person[]; kinds: Array<{ value: string; label: string }>; defaultKind: string }) {
  const [state, formAction] = useActionState(action, {});
  const [kind, setKind] = useState(defaultKind);
  const isGroup = kind === "group";
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Type" htmlFor="kind">
        <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </Select>
      </Field>
      <Field label={isGroup ? "Group name" : "Channel name"} htmlFor="name" error={state.fieldErrors?.name} hint={isGroup ? "Optional" : undefined}>
        <Input id="name" name="name" maxLength={80} placeholder={isGroup ? "Formal planning" : "social-committee"} />
      </Field>
      {!isGroup ? (
        <>
          <Field label="Topic" htmlFor="topic" hint="Optional. Shown under the channel name.">
            <Textarea id="topic" name="topic" maxLength={300} className="min-h-14" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who can join" htmlFor="visibility">
              <Select id="visibility" name="visibility" defaultValue={kind === "recruitment" ? "restricted" : "open"}>
                <option value="open">Any member can find and join</option>
                <option value="restricted">Invite only</option>
              </Select>
            </Field>
            <Field label="Who can post" htmlFor="posting_policy">
              <Select id="posting_policy" name="posting_policy" defaultValue="all">
                <option value="all">Everyone in the channel</option>
                <option value="moderators">Moderators only</option>
              </Select>
            </Field>
          </div>
        </>
      ) : null}
      {kind !== "alumni" ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{isGroup ? "People (2 to 30)" : "Add people now"}</legend>
          <PeoplePicker people={people} max={isGroup ? 30 : undefined} />
        </fieldset>
      ) : (
        <p className="text-sm text-ink-3">All alumni are added automatically.</p>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Creating">{isGroup ? "Start conversation" : "Create channel"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddMembersForm({ action, people }: { action: Action; people: Person[] }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3" key={state.message}>
      <FormMessage state={state} />
      <PeoplePicker people={people} />
      <div className="flex justify-end">
        <SubmitButton variant="secondary" size="sm" pendingLabel="Adding">Add to conversation</SubmitButton>
      </div>
    </form>
  );
}

export function ChannelSettingsForm({ action, initial }: { action: Action; initial: { name: string; topic: string; posting_policy: string; visibility: string } }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Name" htmlFor="ch-name" error={state.fieldErrors?.name}>
        <Input id="ch-name" name="name" defaultValue={initial.name} maxLength={80} />
      </Field>
      <Field label="Topic" htmlFor="ch-topic">
        <Textarea id="ch-topic" name="topic" defaultValue={initial.topic} maxLength={300} className="min-h-14" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who can join" htmlFor="ch-visibility">
          <Select id="ch-visibility" name="visibility" defaultValue={initial.visibility}>
            <option value="open">Any member</option>
            <option value="restricted">Invite only</option>
          </Select>
        </Field>
        <Field label="Who can post" htmlFor="ch-posting">
          <Select id="ch-posting" name="posting_policy" defaultValue={initial.posting_policy}>
            <option value="all">Everyone</option>
            <option value="moderators">Moderators only</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Saving">Save</SubmitButton>
      </div>
    </form>
  );
}

export function NotifyForm({ action, notify, muted }: { action: Action; notify: string; muted: boolean }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Notify me about" htmlFor="notify">
        <Select id="notify" name="notify" defaultValue={notify}>
          <option value="all">Every new message</option>
          <option value="mentions">Mentions only</option>
          <option value="none">Nothing</option>
        </Select>
      </Field>
      <Field label="Mute" htmlFor="mute" hint={muted ? "Currently muted. Choose Not muted to turn notifications back on." : undefined}>
        <Select id="mute" name="mute" defaultValue={muted ? "keep" : ""}>
          <option value="">Not muted</option>
          {muted ? <option value="keep">Keep current mute</option> : null}
          <option value="1h">For 1 hour</option>
          <option value="8h">For 8 hours</option>
          <option value="24h">For 24 hours</option>
          <option value="7d">For a week</option>
          <option value="forever">Until I unmute</option>
        </Select>
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving">Save</SubmitButton>
      </div>
    </form>
  );
}

export function ResolveReportForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  if (state.ok) return <p className="text-sm text-positive">{state.message}</p>;
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <Field label="Note" htmlFor="note" hint="Optional. Visible to other moderators.">
        <Input id="note" name="note" maxLength={500} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton variant="ghost" size="sm" name="action" value="dismiss">Dismiss</SubmitButton>
        <SubmitButton variant="secondary" size="sm" name="action" value="remove_message">Remove message</SubmitButton>
        <SubmitButton variant="danger" size="sm" name="action" value="restrict_sender">Remove and restrict for 7 days</SubmitButton>
      </div>
    </form>
  );
}
