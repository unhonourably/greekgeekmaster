"use client";

import { useState } from "react";
import { ArrowLeft, BellRing, Lock, Search } from "lucide-react";
import { Avatar } from "@/components/people";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Notice, Select, Stat, StatGrid, Textarea, buttonClass, cx } from "@/components/ui";
import { OUTCOME_LABEL, OUTCOME_TONE, type StageOutcome } from "@/lib/recruitment";
import { AppFrame, MockHeader, TryIt, addDays, mediumDate, useToday } from "./shared";

const STAGES: Array<{ name: string; outcome: StageOutcome }> = [
  { name: "Interested", outcome: "open" },
  { name: "Met the chapter", outcome: "open" },
  { name: "Invited back", outcome: "open" },
  { name: "Offer extended", outcome: "offered" },
  { name: "Accepted", outcome: "joined" },
  { name: "Not continuing", outcome: "closed" },
];

const ME = "Jordan Lee";
const RECRUITERS = [ME, "Tyler Brooks", "Chris Nguyen"];

type Note = { id: number; author: string; body: string; restricted: boolean; when: string };
type Prospect = { id: string; full: string; preferred: string; year: string; major: string; owner: string; follow: number | null; stage: number; archived: boolean; added: number; notes: Note[]; history: Array<{ from: number | null; to: number; when: number }> };

const START: Prospect[] = [
  { id: "p1", full: "Ethan Carter", preferred: "", year: "2030", major: "Finance", owner: ME, follow: 0, stage: 0, archived: false, added: -6, notes: [{ id: 1, author: "Tyler Brooks", body: "Met at the involvement fair. Plays club soccer.", restricted: false, when: "Oct 27, 7:10 PM" }], history: [{ from: null, to: 0, when: -6 }] },
  { id: "p2", full: "Noah Kim", preferred: "", year: "2029", major: "Computer science", owner: "Tyler Brooks", follow: 2, stage: 0, archived: false, added: -5, notes: [], history: [{ from: null, to: 0, when: -5 }] },
  { id: "p3", full: "Benjamin Alvarez", preferred: "Ben", year: "2030", major: "Biology", owner: ME, follow: -1, stage: 1, archived: false, added: -9, notes: [{ id: 2, author: "Chris Nguyen", body: "Asked about dues. Worried about cost, wants to know about payment plans.", restricted: true, when: "Oct 30, 9:02 PM" }], history: [{ from: null, to: 0, when: -9 }, { from: 0, to: 1, when: -4 }] },
  { id: "p4", full: "Liam Foster", preferred: "", year: "2029", major: "", owner: "", follow: null, stage: 1, archived: false, added: -8, notes: [], history: [{ from: null, to: 0, when: -8 }, { from: 0, to: 1, when: -3 }] },
  { id: "p5", full: "Owen Patel", preferred: "", year: "2030", major: "Marketing", owner: "Chris Nguyen", follow: 3, stage: 2, archived: false, added: -12, notes: [], history: [{ from: null, to: 0, when: -12 }, { from: 0, to: 2, when: -2 }] },
  { id: "p6", full: "Mason Reed", preferred: "", year: "2029", major: "History", owner: ME, follow: null, stage: 3, archived: false, added: -14, notes: [], history: [{ from: null, to: 0, when: -14 }, { from: 0, to: 3, when: -1 }] },
];

function Board({ prospects, open, today }: { prospects: Prospect[]; open: (id: string) => void; today: string }) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [view, setView] = useState("");
  const [applied, setApplied] = useState({ q: "", owner: "", view: "" });
  const archived = applied.view === "archived";
  const shown = prospects
    .filter((p) => p.archived === archived)
    .filter((p) => !applied.q.trim() || `${p.full} ${p.preferred}`.toLowerCase().includes(applied.q.trim().toLowerCase()))
    .filter((p) => (applied.owner === "me" ? p.owner === ME : applied.owner === "none" ? !p.owner : true));
  const active = prospects.filter((p) => !p.archived);
  const due = active.filter((p) => p.follow !== null && p.follow <= 0).length;
  const offered = active.filter((p) => STAGES[p.stage].outcome === "offered").length;
  const joined = active.filter((p) => STAGES[p.stage].outcome === "joined").length;

  return (
    <>
      <MockHeader
        title="Recruitment"
        description="Prospect records are visible only to members with recruitment access. Platform staff cannot read them."
        actions={
          <>
            <span className={buttonClass("secondary", "sm")}>Stages</span>
            <span className={buttonClass("primary", "sm")}>Add prospect</span>
          </>
        }
      />
      {!archived ? (
        <StatGrid className="mb-6">
          <Stat label="Active prospects" value={active.length} />
          <Stat label="Follow-ups due" value={due} tone={due ? "warning" : undefined} />
          <Stat label="Offers out" value={offered} />
          <Stat label="Joined" value={joined} tone={joined ? "positive" : undefined} />
        </StatGrid>
      ) : null}
      <form className="mb-5 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setApplied({ q, owner, view }); }}>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search prospects" className="pl-8" aria-label="Search prospects" />
        </div>
        <Select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Recruiter" className="w-44">
          <option value="">All recruiters</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
        </Select>
        <Select value={view} onChange={(event) => setView(event.target.value)} aria-label="Status" className="w-36">
          <option value="">Active</option>
          <option value="archived">Archived</option>
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
      </form>
      {archived ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {shown.length === 0 ? <li className="px-5 py-8 text-center text-sm text-ink-3">No archived prospects</li> : null}
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => open(p.id)} className="flex w-full items-center justify-between px-5 py-3 text-sm hover:bg-canvas/50">
                <span className="font-medium text-ink">{p.full}</span>
                <span className="text-[13px] text-ink-3">{STAGES[p.stage].name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
          <div className="flex min-w-max gap-3">
            {STAGES.map((stage, index) => {
              const items = shown.filter((p) => p.stage === index);
              return (
                <section key={stage.name} className="w-64 shrink-0 rounded-lg border border-line bg-canvas/60">
                  <header className="flex items-center justify-between border-b border-line px-3 py-2">
                    <p className="truncate text-[13px] font-semibold text-ink">{stage.name}</p>
                    <Badge tone={OUTCOME_TONE[stage.outcome]}>{items.length}</Badge>
                  </header>
                  <ul className="space-y-2 p-2">
                    {items.length === 0 ? <li className="px-1 py-3 text-center text-[12px] text-ink-3">Empty</li> : null}
                    {items.map((p) => (
                      <li key={p.id} className="fade-up">
                        <button type="button" onClick={() => open(p.id)} className="block w-full rounded-md border border-line bg-surface px-3 py-2 text-left hover:border-ink-3/40">
                          <span className="block truncate text-sm font-medium text-ink">{p.preferred ? `${p.preferred} (${p.full})` : p.full}</span>
                          <span className="block truncate text-[12px] text-ink-3">{[p.year, p.major].filter(Boolean).join(" · ") || "No details yet"}</span>
                          <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
                            <span className="truncate text-ink-3">{p.owner || "Unassigned"}</span>
                            {p.follow !== null ? (
                              <span className={cx("flex shrink-0 items-center gap-1", p.follow <= 0 ? "text-warning" : "text-ink-3")}>
                                <BellRing className="size-3" aria-hidden />
                                {mediumDate(addDays(today, p.follow)).replace(/, \d{4}$/, "")}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ prospect, viewer, today, back, change }: { prospect: Prospect; viewer: "chair" | "team"; today: string; back: () => void; change: (fn: (p: Prospect) => Prospect) => void }) {
  const [stage, setStage] = useState(prospect.stage);
  const [owner, setOwner] = useState(prospect.owner);
  const [follow, setFollow] = useState(prospect.follow === null ? "" : addDays(today, prospect.follow));
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [restricted, setRestricted] = useState(false);
  const viewerName = viewer === "chair" ? ME : "Tyler Brooks";
  const notes = prospect.notes.filter((n) => !n.restricted || viewer === "chair" || n.author === viewerName);
  const canEdit = viewer === "chair" || prospect.owner === viewerName;
  const dayOffset = (iso: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);

  return (
    <>
      <button type="button" onClick={back} className="mb-1 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
        <ArrowLeft className="size-3.5" aria-hidden />
        Recruitment
      </button>
      <MockHeader
        title={<span className="flex flex-wrap items-center gap-2">{prospect.full}{prospect.archived ? <Badge>Archived</Badge> : null}</span>}
        description={`Assigned to ${prospect.owner || "nobody"} · added ${mediumDate(addDays(today, prospect.added))}`}
        actions={viewer === "chair" ? <Button variant="secondary" size="sm" onClick={() => change((p) => ({ ...p, archived: !p.archived }))}>{prospect.archived ? "Restore" : "Archive"}</Button> : null}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" description={canEdit ? undefined : "Only the assigned recruiter or the recruitment chair can edit."} />
            <CardBody className="py-5">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  change((p) => ({ ...p, owner, follow: follow ? dayOffset(follow) : null }));
                  setSaved(true);
                }}
              >
                {saved ? <Notice tone="positive">Saved.</Notice> : null}
                <fieldset disabled={!canEdit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name" htmlFor="rp-full"><Input id="rp-full" defaultValue={prospect.full} /></Field>
                    <Field label="Preferred name" htmlFor="rp-pref"><Input id="rp-pref" defaultValue={prospect.preferred} /></Field>
                    <Field label="Graduation year" htmlFor="rp-year"><Input id="rp-year" type="number" defaultValue={prospect.year} /></Field>
                    <Field label="Major" htmlFor="rp-major"><Input id="rp-major" defaultValue={prospect.major} /></Field>
                    <Field label="Next follow-up" htmlFor="rp-follow" hint="The recruiter gets a reminder that morning.">
                      <Input id="rp-follow" type="date" value={follow} onChange={(event) => { setFollow(event.target.value); setSaved(false); }} />
                    </Field>
                    <Field label="Assigned recruiter" htmlFor="rp-owner">
                      <Select id="rp-owner" value={owner} onChange={(event) => { setOwner(event.target.value); setSaved(false); }}>
                        <option value="">Unassigned</option>
                        {RECRUITERS.map((name) => <option key={name}>{name}</option>)}
                      </Select>
                    </Field>
                  </div>
                </fieldset>
                {canEdit ? <div className="flex justify-end"><Button type="submit">Save</Button></div> : null}
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notes" description="Restricted notes are visible only to their author and the recruitment chair." />
            <CardBody className="space-y-5">
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!note.trim()) return;
                  change((p) => ({ ...p, notes: [{ id: Date.now(), author: viewerName, body: note.trim(), restricted, when: "Just now" }, ...p.notes] }));
                  setNote("");
                  setRestricted(false);
                }}
              >
                <Field label="Add a note" htmlFor="rp-note"><Textarea id="rp-note" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20" /></Field>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Checkbox checked={restricted} onChange={(event) => setRestricted(event.target.checked)} label="Restricted" description="Only you and the recruitment chair can read it." />
                  <Button type="submit" size="sm">Add note</Button>
                </div>
              </form>
              {notes.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {notes.map((n) => (
                    <li key={n.id} className="fade-up flex gap-3 py-3">
                      <Avatar name={n.author} size="xs" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                          <span className="font-medium text-ink-2">{n.author}</span>
                          {n.when}
                          {n.restricted ? <span className="inline-flex items-center gap-1 text-warning"><Lock className="size-3" aria-hidden />Restricted</span> : null}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{n.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {canEdit && !prospect.archived ? (
            <Card>
              <CardHeader title="Stage" />
              <CardBody>
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (stage !== prospect.stage) change((p) => ({ ...p, stage, history: [...p.history, { from: p.stage, to: stage, when: 0 }] })); }}>
                  <Select value={stage} onChange={(event) => setStage(Number(event.target.value))} aria-label="Stage" className="flex-1">
                    {STAGES.map((s, index) => <option key={s.name} value={index}>{s.name} ({OUTCOME_LABEL[s.outcome]})</option>)}
                  </Select>
                  <Button type="submit" variant="secondary">Move</Button>
                </form>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Stage history" />
            <CardBody>
              <ol className="space-y-2 text-[13px]">
                {prospect.history.map((h, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="text-ink-2">{h.from === null ? `Added to ${STAGES[h.to].name}` : `${STAGES[h.from].name} to ${STAGES[h.to].name}`}</span>
                    <span className="shrink-0 text-ink-3">{mediumDate(addDays(today, h.when))}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

export function RecruitmentDemo() {
  const today = useToday();
  return <RecruitmentScreen key={today} today={today} />;
}

function RecruitmentScreen({ today }: { today: string }) {
  const [prospects, setProspects] = useState(START);
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<"chair" | "team">("chair");
  const [round, setRound] = useState(0);
  const prospect = prospects.find((p) => p.id === openId) ?? null;

  return (
    <div>
      <TryIt>Open a prospect, move them to another stage, and add a restricted note. Then switch who is signed in and see which notes come back.</TryIt>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
        Signed in as
        <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist" aria-label="Signed in as">
          {([["chair", "Recruitment chair"], ["team", "Recruitment team member"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={viewer === key} onClick={() => setViewer(key)} className={cx("rounded px-3 py-1 transition-colors", viewer === key ? "bg-subtle font-medium text-ink" : "text-ink-3 hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <AppFrame path={prospect ? `/recruitment/${prospect.id}` : "/recruitment"} active="recruitment" onReset={() => { setProspects(START); setOpenId(null); setViewer("chair"); setRound((value) => value + 1); }}>
        {prospect ? (
          <Detail key={`${prospect.id}-${viewer}-${round}`} prospect={prospect} viewer={viewer} today={today} back={() => setOpenId(null)} change={(fn) => setProspects((list) => list.map((p) => (p.id === prospect.id ? fn(p) : p)))} />
        ) : (
          <Board key={round} prospects={prospects} open={setOpenId} today={today} />
        )}
      </AppFrame>
    </div>
  );
}
