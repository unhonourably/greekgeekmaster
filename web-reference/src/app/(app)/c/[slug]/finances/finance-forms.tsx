"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Search, Send, UserCheck, UserMinus, Users, X, type LucideIcon } from "lucide-react";
import { Button, Checkbox, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";
import { formatCents, parseDollarsToCents } from "@/lib/money";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const SEND_EVENT = "assessment:send";

export function AssessmentForm({
  action,
  defaultDueDate,
  initial,
  submitLabel = "Continue",
  pendingLabel = "Saving",
  onCancel,
}: {
  action: Action;
  defaultDueDate?: string;
  initial?: Record<string, string>;
  submitLabel?: string;
  pendingLabel?: string;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values ?? initial ?? {};
  const [installments, setInstallments] = useState(v.allow_installments === "on");
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
        <Field label="Title" htmlFor="title" error={state.fieldErrors?.title} hint="Members see this on their bill and receipt.">
          <Input id="title" name="title" defaultValue={v.title} placeholder="Spring dues" />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={v.category ?? "dues"}>
            <option value="dues">Dues</option>
            <option value="new_member_fee">New member fee</option>
            <option value="fine">Fine</option>
            <option value="housing">Housing</option>
            <option value="event">Event</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="description" hint="Optional. What the charge covers.">
        <Textarea id="description" name="description" defaultValue={v.description} maxLength={2000} className="min-h-16" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Amount per member" htmlFor="amount" error={state.fieldErrors?.amount} hint="You can set different amounts when issuing.">
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={v.amount} placeholder="450.00" className="tnum" />
        </Field>
        <Field label="Due date" htmlFor="due_date" error={state.fieldErrors?.due_date}>
          <Input id="due_date" name="due_date" type="date" defaultValue={v.due_date ?? defaultDueDate} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Late fee" htmlFor="late_fee" error={state.fieldErrors?.late_fee} hint="Optional. Added once if unpaid after the grace period.">
          <Input id="late_fee" name="late_fee" inputMode="decimal" defaultValue={v.late_fee} placeholder="0.00" className="tnum" />
        </Field>
        <Field label="Grace period (days)" htmlFor="late_fee_grace_days" error={state.fieldErrors?.late_fee_grace_days}>
          <Input id="late_fee_grace_days" name="late_fee_grace_days" type="number" min={0} max={90} defaultValue={v.late_fee_grace_days ?? "7"} />
        </Field>
      </div>
      <div className="rounded-md border border-line p-4">
        <Checkbox
          name="allow_installments"
          checked={installments}
          onChange={(e) => setInstallments(e.target.checked)}
          label="Let members choose an installment plan"
          description="Each installment is charged the platform fee on its own amount, so the total fee stays the same."
        />
        {installments ? (
          <Field label="Maximum installments" htmlFor="max_installments" className="mt-4 w-48" error={state.fieldErrors?.max_installments}>
            <Select id="max_installments" name="max_installments" defaultValue={v.max_installments && v.max_installments !== "1" ? v.max_installments : "4"}>
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function DraftDetails({
  action,
  initial,
  rows,
}: {
  action: Action;
  initial: Record<string, string>;
  rows: Array<{ label: string; value: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const save: Action = async (s, fd) => {
    const r = await action(s, fd);
    if (r.ok) setEditing(false);
    return r;
  };
  if (editing) {
    return <AssessmentForm action={save} initial={initial} submitLabel="Save changes" onCancel={() => setEditing(false)} />;
  }
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-[12px] text-ink-3">{r.label}</dt>
            <dd className="mt-0.5 truncate text-sm text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="size-3.5" aria-hidden />
        Edit details
      </Button>
    </div>
  );
}

const CLASS_LABEL: Record<string, string> = { active: "Active", new_member: "New member", associate: "Associate", alumni: "Alumni" };

export function IssueForm({
  action,
  members,
  defaultCents,
  title,
  dueLabel,
  alreadyBilled,
  initialExempt,
}: {
  action: Action;
  members: Array<{ id: string; name: string; memberClass: string; active: boolean; inHouse: boolean }>;
  defaultCents: number;
  title: string;
  dueLabel: string;
  alreadyBilled: number;
  initialExempt: string[];
}) {
  const [state, formAction] = useActionState(action, {});
  const [exempt, setExempt] = useState<string[]>(initialExempt);
  const [residence, setResidence] = useState<"all" | "in" | "out">("all");
  const covered = useMemo(
    () =>
      members.filter((m) => {
        if (!m.active || m.memberClass === "alumni") return false;
        if (residence === "all") return true;
        if (m.memberClass !== "active") return false;
        return residence === "in" ? m.inHouse : !m.inHouse;
      }),
    [members, residence],
  );
  const eligibleIds = useMemo(() => covered.map((m) => m.id), [covered]);
  const everyoneIds = useMemo(() => eligibleIds.filter((id) => !exempt.includes(id)), [eligibleIds, exempt]);
  const [mode, setMode] = useState<"everyone" | "custom">(eligibleIds.length > 0 ? "everyone" : "custom");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleIds));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const canSend = (mode === "everyone" ? eligibleIds.some((id) => !exempt.includes(id)) : [...selected].some((id) => !exempt.includes(id)));

  useEffect(() => {
    function open() {
      if (canSend) setConfirming(true);
      requestAnimationFrame(() => {
        footerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        footerRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus({ preventScroll: true });
      });
    }
    window.addEventListener(SEND_EVENT, open);
    return () => window.removeEventListener(SEND_EVENT, open);
  }, [canSend]);

  useEffect(() => {
    if (state.error) footerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  const visible = useMemo(
    () =>
      members.filter((m) => {
        const house = filter === "in" ? m.inHouse : filter === "out" ? m.memberClass === "active" && !m.inHouse : filter === "all" || m.memberClass === filter;
        return house && m.name.toLowerCase().includes(q.trim().toLowerCase());
      }),
    [members, filter, q],
  );
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const recipients = mode === "everyone" ? everyoneIds : members.filter((m) => selected.has(m.id) && !exempt.includes(m.id)).map((m) => m.id);
  const amountFor = (id: string) => {
    if (mode === "everyone") return defaultCents;
    const c = parseDollarsToCents(amounts[id] ?? "");
    return c !== null && c >= 50 ? c : defaultCents;
  };
  const total = recipients.reduce((s, id) => s + amountFor(id), 0);
  const custom = mode === "custom" && recipients.some((id) => amountFor(id) !== defaultCents);
  const noun = (n: number) => `${n} member${n === 1 ? "" : "s"}`;

  function toggleAll() {
    const next = new Set(selected);
    for (const m of visible) {
      if (allVisibleSelected) next.delete(m.id);
      else next.add(m.id);
    }
    setSelected(next);
    setConfirming(false);
  }

  if (members.length === 0) return <p className="text-sm text-ink-3">Every member already has this charge.</p>;
  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      {recipients.map((id) => (
        <input key={id} type="hidden" name="membership" value={id} />
      ))}
      {mode === "custom"
        ? recipients.filter((id) => amounts[id]?.trim()).map((id) => <input key={`a-${id}`} type="hidden" name={`amount_${id}`} value={amounts[id]} />)
        : null}
      {exempt.length > 0 || initialExempt.length > 0 ? <input type="hidden" name="exemptions_set" value="1" /> : null}
      {exempt.map((id) => (
        <input key={`x-${id}`} type="hidden" name="exempt" value={id} />
      ))}

      <Field label="Who this covers" htmlFor="residence" hint={residence === "all" ? "Active members, new members, and associates. Alumni are left out." : "Only active members. In house means they have a room right now."}>
        <Select
          id="residence"
          value={residence}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "all" || next === "in" || next === "out") {
              setResidence(next);
              setMode("everyone");
              setConfirming(false);
            }
          }}
        >
          <option value="all">All members</option>
          <option value="in">In house only</option>
          <option value="out">Out of house only</option>
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Who gets charged">
        <ModeOption
          checked={mode === "everyone"}
          disabled={eligibleIds.length === 0}
          onSelect={() => {
            setMode("everyone");
            setConfirming(false);
          }}
          icon={Users}
          title={residence === "in" ? "Every in-house active" : residence === "out" ? "Every out-of-house active" : alreadyBilled > 0 ? "Everyone not yet charged" : "All members"}
          body={eligibleIds.length > 0 ? `${noun(everyoneIds.length)}, ${formatCents(defaultCents)} each.${exempt.length ? " Exempt members are not included." : ""}` : residence === "all" ? "No active members left to charge." : "Nobody in this group is left to charge."}
        />
        <ModeOption
          checked={mode === "custom"}
          onSelect={() => {
            setMode("custom");
            setConfirming(false);
          }}
          icon={UserCheck}
          title="Choose members"
          body="Pick who gets charged and set a different amount for anyone."
        />
      </div>

      <ExemptPicker
        members={members}
        exempt={exempt}
        onChange={(next) => {
          setExempt(next);
          setConfirming(false);
        }}
      />

      {mode === "custom" ? (
        <div className="rounded-lg border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" aria-label="Search members" className="h-8 pl-8 text-[13px]" />
            </div>
            <Select aria-label="Filter by member class" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-40 text-[13px]">
              <option value="all">All classes</option>
              <option value="active">Active</option>
              <option value="new_member">New members</option>
              <option value="associate">Associate</option>
              <option value="alumni">Alumni</option>
              <option value="in">In house</option>
              <option value="out">Out of house</option>
            </Select>
            <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
              {allVisibleSelected ? "Clear" : `Select ${visible.length}`}
            </Button>
          </div>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {visible.length === 0 ? <li className="px-3 py-4 text-center text-[13px] text-ink-3">No one matches.</li> : null}
            {visible.map((m) => (
              <li key={m.id} className={cx("flex items-center gap-3 px-3 py-2", selected.has(m.id) && !exempt.includes(m.id) && "bg-accent-soft/30", exempt.includes(m.id) && "opacity-50")}>
                <input
                  suppressHydrationWarning
                  type="checkbox"
                  disabled={exempt.includes(m.id)}
                  checked={selected.has(m.id) && !exempt.includes(m.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    setSelected(next);
                    setConfirming(false);
                  }}
                  className="size-4 accent-accent"
                  aria-label={m.name}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{m.name}</span>
                  <span className="block text-[12px] text-ink-3">{CLASS_LABEL[m.memberClass] ?? m.memberClass}{m.memberClass === "active" ? (m.inHouse ? " · In house" : " · Out of house") : ""}{m.active ? "" : " · inactive"}{exempt.includes(m.id) ? " · exempt" : ""}</span>
                </span>
                <span className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">$</span>
                  <Input
                    value={amounts[m.id] ?? ""}
                    onChange={(e) => {
                      setAmounts({ ...amounts, [m.id]: e.target.value });
                      setConfirming(false);
                    }}
                    disabled={!selected.has(m.id) || exempt.includes(m.id)}
                    inputMode="decimal"
                    placeholder={(defaultCents / 100).toFixed(2)}
                    aria-label={`Amount for ${m.name}`}
                    className="h-8 w-28 pl-5 text-right text-[13px] tnum"
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-accent/30 bg-accent-soft/40 p-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-accent">Summary</p>
        <p className="mt-1.5 text-[15px] text-ink">
          {recipients.length === 0 ? (
            "Choose at least one member."
          ) : (
            <>
              Charge <span className="font-semibold">{custom ? "custom amounts" : `${formatCents(defaultCents)} each`}</span> to <span className="font-semibold">{mode === "everyone" && recipients.length > 1 ? `all ${recipients.length} ${residence === "in" ? "in-house members" : residence === "out" ? "out-of-house members" : "members"}` : noun(recipients.length)}</span> for {title}{exempt.length ? <span className="text-ink-2">, with {noun(exempt.length)} exempt</span> : null}.
            </>
          )}
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-accent/20 pt-3 text-sm">
          <div>
            <dt className="text-[12px] text-ink-3">Members</dt>
            <dd className="font-semibold text-ink tnum">{recipients.length}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-3">Total billed</dt>
            <dd className="font-semibold text-ink tnum">{formatCents(total)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-3">Due</dt>
            <dd className="font-semibold text-ink">{dueLabel}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] text-ink-3">Each member is notified right away and sees the charge on their dues page. Amounts cannot be changed after sending; you can void a single charge and reissue it.</p>
      </div>

      <div ref={footerRef} className="scroll-mt-24 space-y-3">
      <FormMessage state={state} />
      {confirming ? (
        <div className="fade-up flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/50 bg-subtle p-4">
          <p className="text-sm text-ink">
            Send {formatCents(total)} in charges to {noun(recipients.length)}? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Go back</Button>
            <SubmitButton size="sm" pendingLabel="Sending">
              <Send className="size-3.5" aria-hidden />
              Yes, send charges
            </SubmitButton>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button type="button" disabled={recipients.length === 0} onClick={() => setConfirming(true)}>
            <Send className="size-4" aria-hidden />
            Send to {noun(recipients.length)}
          </Button>
        </div>
      )}
      </div>
    </form>
  );
}

function ExemptPicker({
  members,
  exempt,
  onChange,
}: {
  members: Array<{ id: string; name: string; memberClass: string }>;
  exempt: string[];
  onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => !exempt.includes(m.id) && (!needle || m.name.toLowerCase().includes(needle))).slice(0, 8);
  }, [members, exempt, q]);
  const add = (id: string) => {
    onChange([...exempt, id]);
    setQ("");
    setActive(0);
    setOpen(false);
  };
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex items-start gap-2">
        <UserMinus className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Exempt members</p>
          <p className="text-[13px] text-ink-3">Anyone you exempt is skipped for this charge, now and if you charge more members later.</p>
        </div>
      </div>
      {exempt.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {exempt.map((id) => (
            <li key={id} className="chip-in inline-flex items-center gap-1 rounded-full border border-line-strong bg-subtle py-0.5 pl-2.5 pr-1 text-[13px] text-ink">
              {byId.get(id)?.name ?? "Member"}
              <button type="button" onClick={() => onChange(exempt.filter((x) => x !== id))} className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-line hover:text-ink" aria-label={`Remove exemption for ${byId.get(id)?.name ?? "member"}`}>
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!open || options.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(options[active].id);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search for a member to exempt"
          aria-label="Search for a member to exempt"
          role="combobox"
          aria-expanded={open}
          className="h-9 pl-8 text-[13px]"
        />
        {open ? (
          <ul role="listbox" className="fade-up absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-xl shadow-black/50">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-ink-3">{members.length === exempt.length ? "Everyone is exempt" : "No one matches"}</li>
            ) : (
              options.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(m.id);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm", i === active ? "bg-subtle text-ink" : "text-ink-2")}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-[12px] text-ink-3">{CLASS_LABEL[m.memberClass] ?? m.memberClass}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function ModeOption({ checked, disabled, onSelect, icon: Icon, title, body }: { checked: boolean; disabled?: boolean; onSelect: () => void; icon: LucideIcon; title: string; body: string }) {
  return (
    <button
      suppressHydrationWarning
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong",
      )}
    >
      <span className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-accent" : "border-line-strong")}>
        {checked ? <span className="size-2 rounded-full bg-accent" /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Icon className="size-4 text-ink-3" aria-hidden />
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] text-ink-2">{body}</span>
      </span>
    </button>
  );
}

export function OfflinePaymentForm({
  action,
  charges,
  today,
  requestKey,
}: {
  action: Action;
  charges: Array<{ id: string; label: string; outstanding: number }>;
  today: string;
  requestKey: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const key = state.values?.request_key ?? requestKey;
  if (charges.length === 0) return <p className="text-sm text-ink-3">No open charges.</p>;
  return (
    <form action={formAction} className="space-y-4" noValidate key={key}>
      <input type="hidden" name="request_key" value={key} />
      <FormMessage state={state} />
      <Field label="Charge" htmlFor="op_member_assessment">
        <Select id="op_member_assessment" name="member_assessment" defaultValue={charges[0].id}>
          {charges.map((c) => (
            <option key={c.id} value={c.id}>{c.label} · {formatCents(c.outstanding)} due</option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" htmlFor="op_amount" error={state.fieldErrors?.amount}>
          <Input id="op_amount" name="amount" inputMode="decimal" className="tnum" />
        </Field>
        <Field label="Method" htmlFor="op_method">
          <Select id="op_method" name="method" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="external_app">Other app (Venmo, Zelle)</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Date received" htmlFor="op_received_on" error={state.fieldErrors?.received_on}>
          <Input id="op_received_on" name="received_on" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Reference" htmlFor="op_reference" hint="Check number or transaction ID.">
          <Input id="op_reference" name="reference" maxLength={120} />
        </Field>
      </div>
      <Field label="Memo" htmlFor="op_memo">
        <Input id="op_memo" name="memo" maxLength={500} />
      </Field>
      <p className="text-[12px] text-ink-3">Offline payments have no platform fee. You cannot record your own payment.</p>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Recording">Record payment</SubmitButton>
      </div>
    </form>
  );
}

type ChargeOption = { id: string; title: string; amount: number; dueDate: string; status: string; sentAfterJoin: boolean };

const SHARES = [
  { label: "Full", share: 1 },
  { label: "3/4", share: 0.75 },
  { label: "Half", share: 0.5 },
  { label: "1/4", share: 0.25 },
];

export function AddChargeForm({ action, options, today, defaultDue }: { action: Action; options: ChargeOption[]; today: string; defaultDue: string }) {
  const [state, formAction] = useActionState(action, {});
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const option = options.find((o) => o.id === selected) ?? options[0];
  const dueFor = (o: ChargeOption | undefined) => (o && o.dueDate > defaultDue ? o.dueDate : defaultDue);
  const [amount, setAmount] = useState(option ? (option.amount / 100).toFixed(2) : "");
  const [due, setDue] = useState(dueFor(option));
  const signature = options.map((o) => o.id).join();
  const [seen, setSeen] = useState(signature);
  const pick = (id: string) => {
    const next = options.find((o) => o.id === id);
    setSelected(id);
    if (next) {
      setAmount((next.amount / 100).toFixed(2));
      setDue(dueFor(next));
    }
  };
  if (seen !== signature) {
    setSeen(signature);
    if (options[0]) pick(options[0].id);
  }
  if (!option) {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <p className="text-sm text-ink-3">This member has every charge that has gone out.</p>
      </div>
    );
  }
  const cents = parseDollarsToCents(amount);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Assessment" htmlFor="ac_assessment">
        <Select id="ac_assessment" name="assessment" value={option.id} onChange={(e) => pick(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} · {formatCents(o.amount)}{o.status === "closed" ? " · closed" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <p className="-mt-2 text-[12px] text-ink-3">
        {option.sentAfterJoin ? "This went out after they joined, so they may have been left off on purpose." : "This went out before they joined."}
      </p>
      <Field label="Amount" htmlFor="ac_amount" error={state.fieldErrors?.amount}>
        <Input id="ac_amount" name="amount" inputMode="decimal" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Prorate">
        {SHARES.map((s) => {
          const value = (Math.max(50, Math.round(option.amount * s.share)) / 100).toFixed(2);
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setAmount(value)}
              className={cx(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                amount === value ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <Field label="Due" htmlFor="ac_due" error={state.fieldErrors?.due_date} hint={option.dueDate < today ? "The original due date has passed, so this defaults to two weeks out." : undefined}>
        <Input id="ac_due" name="due_date" type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <p className="text-[12px] text-ink-3">
        {cents !== null && cents !== option.amount ? `Everyone else was charged ${formatCents(option.amount)}. ` : ""}
        The member is notified and can pay online right away.
      </p>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Charging">Add charge</SubmitButton>
      </div>
    </form>
  );
}

export function CreditForm({ action, charges, requestKey }: { action: Action; charges: Array<{ id: string; label: string; outstanding: number }>; requestKey: string }) {
  const [state, formAction] = useActionState(action, {});
  const key = state.values?.request_key ?? requestKey;
  if (charges.length === 0) return <p className="text-sm text-ink-3">No open charges.</p>;
  return (
    <form action={formAction} className="space-y-4" noValidate key={key}>
      <input type="hidden" name="request_key" value={key} />
      <FormMessage state={state} />
      <Field label="Charge" htmlFor="cr_member_assessment">
        <Select id="cr_member_assessment" name="member_assessment" defaultValue={charges[0].id}>
          {charges.map((c) => (
            <option key={c.id} value={c.id}>{c.label} · {formatCents(c.outstanding)} due</option>
          ))}
        </Select>
      </Field>
      <Field label="Credit amount" htmlFor="cr_amount" error={state.fieldErrors?.amount}>
        <Input id="cr_amount" name="amount" inputMode="decimal" className="tnum" />
      </Field>
      <Field label="Reason" htmlFor="cr_reason" error={state.fieldErrors?.reason} hint="Recorded in the audit log and visible to the member.">
        <Input id="cr_reason" name="reason" maxLength={500} placeholder="Scholarship, service hours, hardship" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingLabel="Applying">Apply credit</SubmitButton>
      </div>
    </form>
  );
}

export function VoidForm({ action, charges }: { action: Action; charges: Array<{ id: string; label: string; outstanding: number }> }) {
  const [state, formAction] = useActionState(action, {});
  if (charges.length === 0) return <p className="text-sm text-ink-3">No charges can be voided.</p>;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Charge" htmlFor="void_member_assessment">
        <Select id="void_member_assessment" name="member_assessment" defaultValue={charges[0].id}>
          {charges.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Reason" htmlFor="void_reason" error={state.fieldErrors?.reason}>
        <Input id="void_reason" name="reason" maxLength={500} />
      </Field>
      <p className="text-[12px] text-ink-3">Voiding removes the unpaid part of a charge. Paid amounts stay on record.</p>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Voiding">Void charge</SubmitButton>
      </div>
    </form>
  );
}

export function RefundForm({ action, refundableCents, feeNote }: { action: Action; refundableCents: number; feeNote: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Refund amount" htmlFor="amount" error={state.fieldErrors?.amount} hint={`Up to ${formatCents(refundableCents)}.`}>
        <Input id="amount" name="amount" inputMode="decimal" defaultValue={(refundableCents / 100).toFixed(2)} className="tnum" />
      </Field>
      <Field label="Reason" htmlFor="reason" error={state.fieldErrors?.reason}>
        <Input id="reason" name="reason" maxLength={500} />
      </Field>
      <p className="text-[12px] text-ink-3">{feeNote}</p>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Refunding">Refund payment</SubmitButton>
      </div>
    </form>
  );
}
