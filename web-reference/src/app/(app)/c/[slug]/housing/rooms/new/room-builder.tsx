"use client";

import { useActionState, useMemo, useState } from "react";
import { Building2, Hash, ListOrdered, Minus, Plus, RotateCcw, Type, X } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

type Mode = "floors" | "sequence" | "letters" | "list";
type FloorStyle = "hundreds" | "tens" | "letter";
type FloorLabel = "floor_n" | "ordinal" | "word" | "none";
type Draft = { key: string; name: string; floor: string | null; capacity: number; status: "new" | "exists" | "duplicate" | "off" };

const MODES: Array<{ id: Mode; label: string; example: string; icon: typeof Building2 }> = [
  { id: "floors", label: "By floor", example: "101, 102, 201", icon: Building2 },
  { id: "sequence", label: "Numbered", example: "1, 2, 3", icon: Hash },
  { id: "letters", label: "Lettered", example: "A, B, C", icon: Type },
  { id: "list", label: "My own list", example: "Paste names", icon: ListOrdered },
];

const PRESET_FEATURES = ["Private bath", "Shared bath", "AC", "Walk-in closet", "Balcony", "Furnished", "Window unit", "Bunk beds"];
const WORDS = ["Ground", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
const MAX_ROOMS = 200;

function letters(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function floorName(n: number, style: FloorLabel): string | null {
  if (style === "none") return null;
  if (style === "floor_n") return `Floor ${n}`;
  if (style === "ordinal") return `${ordinal(n)} floor`;
  return `${WORDS[n] ?? ordinal(n)} floor`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo;
}

function NumberStepper({ id, value, onChange, min, max, label }: { id: string; value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-line-strong bg-surface">
      <button type="button" aria-label={`Fewer ${label}`} className="grid w-9 place-items-center text-ink-2 hover:bg-subtle disabled:opacity-40" disabled={value <= min} onClick={() => onChange(clamp(value - 1, min, max))}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <input
        id={id}
        aria-label={label.charAt(0).toUpperCase() + label.slice(1)}
        inputMode="numeric"
        className="w-full min-w-0 border-x border-line bg-transparent text-center text-sm text-ink tnum focus:outline-none"
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "") || min), min, max))}
      />
      <button type="button" aria-label={`More ${label}`} className="grid w-9 place-items-center text-ink-2 hover:bg-subtle disabled:opacity-40" disabled={value >= max} onClick={() => onChange(clamp(value + 1, min, max))}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function RoomBuilder({ action, existing }: { action: (state: ActionState, formData: FormData) => Promise<ActionState>; existing: string[] }) {
  const [state, formAction] = useActionState(action, {});
  const [mode, setMode] = useState<Mode>("floors");
  const [prefix, setPrefix] = useState("");
  const [floorStart, setFloorStart] = useState(1);
  const [floorCount, setFloorCount] = useState(2);
  const [perFloor, setPerFloor] = useState(6);
  const [floorOverrides, setFloorOverrides] = useState<Record<number, number>>({});
  const [floorStyle, setFloorStyle] = useState<FloorStyle>("hundreds");
  const [firstRoom, setFirstRoom] = useState(1);
  const [floorLabel, setFloorLabel] = useState<FloorLabel>("floor_n");
  const [floorNames, setFloorNames] = useState<Record<number, string>>({});
  const [count, setCount] = useState(10);
  const [start, setStart] = useState(1);
  const [pad, setPad] = useState(0);
  const [singleFloor, setSingleFloor] = useState("");
  const [list, setList] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [rent, setRent] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState("");
  const [tweaks, setTweaks] = useState<Record<string, { capacity?: number; off?: boolean }>>({});

  const taken = useMemo(() => new Set(existing.map((n) => n.toLowerCase())), [existing]);
  const rentCents = rent.trim() ? parseDollarsToCents(rent) : null;
  const rentInvalid = rent.trim() !== "" && (rentCents === null || rentCents < 0);
  const perFloorMax = floorStyle === "tens" ? 9 : floorStyle === "letter" ? 26 : 99;

  const generated = useMemo(() => {
    const out: Array<{ name: string; floor: string | null }> = [];
    if (mode === "floors") {
      for (let f = floorStart; f < floorStart + floorCount; f++) {
        const rooms = Math.min(floorOverrides[f] ?? perFloor, perFloorMax);
        for (let i = 0; i < rooms; i++) {
          const n = firstRoom + i;
          const num = floorStyle === "hundreds" ? `${f}${String(n).padStart(2, "0")}` : floorStyle === "tens" ? `${f}${n}` : `${f}${letters(i + 1)}`;
          const custom = floorNames[f];
          const label = (custom !== undefined ? custom : floorName(f, floorLabel) ?? "").trim().slice(0, 40);
          out.push({ name: `${prefix}${num}`, floor: label || null });
        }
      }
    } else if (mode === "sequence") {
      for (let i = 0; i < count; i++) out.push({ name: `${prefix}${String(start + i).padStart(pad, "0")}`, floor: singleFloor.trim() || null });
    } else if (mode === "letters") {
      for (let i = 0; i < count; i++) out.push({ name: `${prefix}${letters(i + 1)}`, floor: singleFloor.trim() || null });
    } else {
      for (const line of list.split(/\r?\n|,/)) {
        const name = line.trim().slice(0, 60);
        if (name) out.push({ name: `${prefix}${name}`.slice(0, 60), floor: singleFloor.trim() || null });
      }
    }
    return out.slice(0, 500);
  }, [mode, prefix, floorStart, floorCount, perFloor, floorOverrides, floorStyle, firstRoom, floorLabel, floorNames, count, start, pad, singleFloor, list, perFloorMax]);

  const drafts: Draft[] = useMemo(() => {
    const seen = new Set<string>();
    return generated.map((g, i) => {
      const k = g.name.toLowerCase();
      const t = tweaks[k];
      const status: Draft["status"] = taken.has(k) ? "exists" : seen.has(k) ? "duplicate" : t?.off ? "off" : "new";
      seen.add(k);
      return { key: `${k}-${i}`, name: g.name, floor: g.floor, capacity: t?.capacity ?? capacity, status };
    });
  }, [generated, tweaks, taken, capacity]);

  const creating = drafts.filter((d) => d.status === "new");
  const beds = creating.reduce((s, d) => s + d.capacity, 0);
  const skippedExisting = drafts.filter((d) => d.status === "exists").length;
  const tooMany = creating.length > MAX_ROOMS;
  const groups = useMemo(() => {
    const m = new Map<string, Draft[]>();
    for (const d of drafts) {
      const g = d.floor ?? "Rooms";
      m.set(g, [...(m.get(g) ?? []), d]);
    }
    return [...m.entries()];
  }, [drafts]);

  const payload = JSON.stringify(
    creating.map((d) => ({ name: d.name, floor: d.floor, capacity: d.capacity, rent_cents: rentInvalid ? null : rentCents, features })),
  );

  const tweak = (name: string, patch: { capacity?: number; off?: boolean }) =>
    setTweaks((prev) => ({ ...prev, [name.toLowerCase()]: { ...prev[name.toLowerCase()], ...patch } }));
  const toggleFeature = (f: string) => setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : prev.length >= 12 ? prev : [...prev, f]));
  const addCustom = () => {
    const f = customFeature.trim().slice(0, 40);
    if (f && !features.includes(f)) toggleFeature(f);
    setCustomFeature("");
  };
  const sample = generated[0]?.name;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="rooms" value={payload} />
      <FormMessage state={state} />
      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="1. Numbering" description="How your rooms are labeled on the doors." />
            <CardBody className="space-y-5">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Numbering format">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() => setMode(m.id)}
                    className={cx(
                      "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      mode === m.id ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong hover:bg-subtle/40",
                    )}
                  >
                    <span className={cx("flex items-center gap-1.5 text-[13px] font-medium", mode === m.id ? "text-accent" : "text-ink")}>
                      <m.icon className="size-3.5" aria-hidden />
                      {m.label}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">{m.example}</span>
                  </button>
                ))}
              </div>

              {mode === "floors" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Floors" htmlFor="rb-floors">
                      <NumberStepper id="rb-floors" label="floors" value={floorCount} min={1} max={12} onChange={setFloorCount} />
                    </Field>
                    <Field label="Rooms per floor" htmlFor="rb-per">
                      <NumberStepper id="rb-per" label="rooms per floor" value={Math.min(perFloor, perFloorMax)} min={1} max={perFloorMax} onChange={(n) => { setPerFloor(n); setFloorOverrides({}); }} />
                    </Field>
                  </div>
                  <Field label="Room numbers look like" htmlFor="rb-style">
                    <Select id="rb-style" value={floorStyle} onChange={(e) => setFloorStyle(e.target.value as FloorStyle)}>
                      <option value="hundreds">Floor then two digits (101, 102, 201)</option>
                      <option value="tens">Floor then one digit (11, 12, 21)</option>
                      <option value="letter">Floor then a letter (1A, 1B, 2A)</option>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Lowest floor" htmlFor="rb-floor-start">
                      <NumberStepper id="rb-floor-start" label="lowest floor" value={floorStart} min={1} max={12} onChange={setFloorStart} />
                    </Field>
                    {floorStyle !== "letter" ? (
                      <Field label="First room on a floor" htmlFor="rb-first">
                        <Select id="rb-first" value={firstRoom} onChange={(e) => setFirstRoom(Number(e.target.value))}>
                          <option value={1}>{floorStyle === "hundreds" ? "x01" : "x1"}</option>
                          <option value={0}>{floorStyle === "hundreds" ? "x00" : "x0"}</option>
                        </Select>
                      </Field>
                    ) : null}
                  </div>
                  <Field label="Name style" htmlFor="rb-floor-label" hint="Each floor can still have its own name.">
                    <Select
                      id="rb-floor-label"
                      value={floorLabel}
                      onChange={(e) => {
                        setFloorLabel(e.target.value as FloorLabel);
                        setFloorNames({});
                      }}
                    >
                      <option value="floor_n">Floor 1, Floor 2</option>
                      <option value="ordinal">1st floor, 2nd floor</option>
                      <option value="word">First floor, Second floor</option>
                      <option value="none">Start blank</option>
                    </Select>
                  </Field>
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-ink">Each floor</p>
                    <ul className="space-y-2">
                      {Array.from({ length: floorCount }, (_, i) => floorStart + i).map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <Input
                            aria-label={`Name for floor ${f}`}
                            value={floorNames[f] ?? floorName(f, floorLabel) ?? ""}
                            maxLength={40}
                            placeholder="Name this floor"
                            onChange={(e) => setFloorNames((prev) => ({ ...prev, [f]: e.target.value }))}
                          />
                          {floorCount > 1 ? (
                            <div className="w-36 shrink-0">
                              <NumberStepper
                                id={`rb-floor-${f}`}
                                label={`rooms on floor ${f}`}
                                value={Math.min(floorOverrides[f] ?? perFloor, perFloorMax)}
                                min={0}
                                max={perFloorMax}
                                onChange={(n) => setFloorOverrides((prev) => ({ ...prev, [f]: n }))}
                              />
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {mode === "sequence" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="How many rooms" htmlFor="rb-count">
                      <NumberStepper id="rb-count" label="rooms" value={count} min={1} max={MAX_ROOMS} onChange={setCount} />
                    </Field>
                    <Field label="Start at" htmlFor="rb-start">
                      <NumberStepper id="rb-start" label="starting number" value={start} min={0} max={9999} onChange={setStart} />
                    </Field>
                  </div>
                  <Field label="Digits" htmlFor="rb-pad">
                    <Select id="rb-pad" value={pad} onChange={(e) => setPad(Number(e.target.value))}>
                      <option value={0}>As is (1, 2, 10)</option>
                      <option value={2}>Two digits (01, 02, 10)</option>
                      <option value={3}>Three digits (001, 002, 010)</option>
                    </Select>
                  </Field>
                </div>
              ) : null}

              {mode === "letters" ? (
                <Field label="How many rooms" htmlFor="rb-count-l" hint="After Z it continues with AA, AB.">
                  <NumberStepper id="rb-count-l" label="rooms" value={count} min={1} max={78} onChange={setCount} />
                </Field>
              ) : null}

              {mode === "list" ? (
                <Field label="Room names" htmlFor="rb-list" hint="One per line, or separated by commas.">
                  <Textarea id="rb-list" rows={6} value={list} onChange={(e) => setList(e.target.value)} placeholder={"Front suite\nAttic\nGarden room"} />
                </Field>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Prefix" htmlFor="rb-prefix" hint={sample ? `Shows as "${sample}"` : "Optional"}>
                  <Input id="rb-prefix" value={prefix} maxLength={20} placeholder="Room " onChange={(e) => setPrefix(e.target.value.replace(/^\s+/, ""))} />
                </Field>
                {mode !== "floors" ? (
                  <Field label="Floor" htmlFor="rb-single-floor" hint="Optional">
                    <Input id="rb-single-floor" value={singleFloor} maxLength={40} placeholder="Second floor" onChange={(e) => setSingleFloor(e.target.value)} />
                  </Field>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Room details" description="Applied to every room. Adjust single rooms in the preview." />
            <CardBody className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sleeps" htmlFor="rb-cap">
                  <NumberStepper id="rb-cap" label="beds" value={capacity} min={1} max={12} onChange={setCapacity} />
                </Field>
                <Field label="Rent per resident" htmlFor="rb-rent" error={rentInvalid ? "Enter an amount like 850.00" : undefined} hint="Optional">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$</span>
                    <Input id="rb-rent" inputMode="decimal" className="pl-6" value={rent} placeholder="0.00" aria-invalid={rentInvalid} onChange={(e) => setRent(e.target.value)} />
                  </div>
                </Field>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink">Features</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...PRESET_FEATURES, ...features.filter((f) => !PRESET_FEATURES.includes(f))].map((f) => {
                    const on = features.includes(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleFeature(f)}
                        className={cx("rounded-full border px-2.5 py-1 text-[12px] transition-colors", on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2 hover:border-line-strong")}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    aria-label="Add a feature"
                    value={customFeature}
                    maxLength={40}
                    placeholder="Add your own"
                    className="h-8"
                    onChange={(e) => setCustomFeature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addCustom} disabled={!customFeature.trim()}>Add</Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="flex min-h-0 flex-col">
          <CardHeader
            title="3. Preview"
            description="Click a room to leave it out. Use the arrows to change how many it sleeps."
            actions={Object.keys(tweaks).length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setTweaks({})}>
                <RotateCcw className="size-3.5" aria-hidden />
                Reset changes
              </Button>
            ) : null}
          />
          <div className="flex-1 space-y-6 px-5 py-4">
            {drafts.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-3">{mode === "list" ? "Type some room names to see them here." : "Nothing to add yet."}</p>
            ) : (
              groups.map(([floor, rooms]) => (
                <div key={floor}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{floor}</h3>
                    <span className="text-[12px] text-ink-3">{rooms.filter((r) => r.status === "new").length} rooms</span>
                  </div>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                    {rooms.map((r) => {
                      const locked = r.status === "exists" || r.status === "duplicate";
                      const off = r.status === "off";
                      return (
                        <li
                          key={r.key}
                          className={cx(
                            "group relative rounded-lg border px-3 py-2.5 transition-colors",
                            locked ? "border-dashed border-line bg-canvas" : off ? "border-dashed border-line-strong bg-surface opacity-60" : "border-accent/40 bg-accent-soft/40",
                          )}
                        >
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => tweak(r.name, { off: !off })}
                            aria-pressed={!off && !locked}
                            aria-label={locked ? `${r.name} already exists` : off ? `Include ${r.name}` : `Leave out ${r.name}`}
                            className="block w-full truncate text-left font-mono text-sm font-semibold text-ink disabled:cursor-default"
                          >
                            {r.name}
                          </button>
                          {locked ? (
                            <Badge className="mt-1.5">{r.status === "exists" ? "Already added" : "Duplicate"}</Badge>
                          ) : off ? (
                            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-3"><X className="size-3" aria-hidden />Left out</p>
                          ) : (
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="flex items-center gap-0.5" aria-hidden>
                                {Array.from({ length: Math.min(r.capacity, 6) }, (_, i) => <span key={i} className="size-1.5 rounded-full bg-accent" />)}
                                {r.capacity > 6 ? <span className="text-[10px] text-ink-3">+{r.capacity - 6}</span> : null}
                              </span>
                              <span className="flex items-center">
                                <button type="button" aria-label={`${r.name} sleeps fewer`} disabled={r.capacity <= 1} onClick={() => tweak(r.name, { capacity: r.capacity - 1 })} className="grid size-5 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink disabled:opacity-30">
                                  <Minus className="size-3" aria-hidden />
                                </button>
                                <span className="w-4 text-center text-[12px] font-medium text-ink tnum">{r.capacity}</span>
                                <button type="button" aria-label={`${r.name} sleeps more`} disabled={r.capacity >= 12} onClick={() => tweak(r.name, { capacity: r.capacity + 1 })} className="grid size-5 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink disabled:opacity-30">
                                  <Plus className="size-3" aria-hidden />
                                </button>
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line-strong bg-surface/95 px-5 py-3 shadow-lg backdrop-blur">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          <div className="flex gap-1.5"><dt className="text-ink-3">New rooms</dt><dd className="font-semibold text-ink tnum">{creating.length}</dd></div>
          <div className="flex gap-1.5"><dt className="text-ink-3">Beds</dt><dd className="font-semibold text-ink tnum">{beds}</dd></div>
          {rentCents && !rentInvalid ? (
            <div className="flex gap-1.5"><dt className="text-ink-3">Rent when full</dt><dd className="font-semibold text-ink tnum">{formatCents(rentCents * beds)}</dd></div>
          ) : null}
          {skippedExisting ? <div className="flex gap-1.5"><dt className="text-ink-3">Already added</dt><dd className="font-semibold text-ink-2 tnum">{skippedExisting}</dd></div> : null}
        </dl>
        <div className="flex items-center gap-3">
          {tooMany ? <span className="text-[13px] text-danger">Add up to {MAX_ROOMS} at a time</span> : null}
          <SubmitButton pendingLabel="Adding rooms" disabled={creating.length === 0 || tooMany || rentInvalid}>
            {creating.length ? `Add ${creating.length} room${creating.length === 1 ? "" : "s"}` : "Add rooms"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
