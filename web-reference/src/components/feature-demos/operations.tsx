"use client";

import { useState, type FormEvent } from "react";
import { Bold, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Pin, Quote, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { Avatar } from "@/components/people";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Notice, Select, Stat, StatGrid, Table, Td, Textarea, Th, Tr } from "@/components/ui";
import { AppFrame, MockHeader, TryIt, addDays, mediumDate, useToday } from "./shared";

const ME = "Jordan Lee";
const MEMBER_COUNT = 48;

type Comment = { id: number; author: string; body: string; at: string };
type Post = { id: number; title: string; body: string; author: string; at: string; officers: boolean; pinned: boolean; ack: boolean; acks: number; acked: boolean; commentsOn: boolean; comments: Comment[] };

function startPosts(today: string): Post[] {
  return [
    { id: 1, title: "Chapter meeting moved to Thursday", body: "We're meeting Thursday at 7:00 PM in the Union, room 214, because of the home game. Attendance is still required.", author: "Maya Patel", at: `${mediumDate(addDays(today, -1))}, 4:12 PM`, officers: false, pinned: true, ack: true, acks: 31, acked: false, commentsOn: true, comments: [{ id: 1, author: "Devin Ortiz", body: "Will it be streamed for people at the away game?", at: `${mediumDate(addDays(today, -1))}, 5:03 PM` }] },
    { id: 2, title: "Officer retreat agenda", body: "Draft agenda for Saturday is in the officer channel. Add anything you want covered by Friday.", author: ME, at: `${mediumDate(addDays(today, -3))}, 9:40 AM`, officers: true, pinned: false, ack: false, acks: 0, acked: false, commentsOn: true, comments: [] },
  ];
}

function EditorMock({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tools = [Bold, Italic, Underline, Strikethrough, null, Heading2, List, ListOrdered, Quote, Link2, ImagePlus, null, Undo2, Redo2];
  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-surface">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-canvas px-1.5 py-1" title="Formatting works in the real editor">
        {tools.map((Icon, i) => (Icon ? <span key={i} className="grid size-8 place-items-center rounded-md text-ink-3" aria-hidden><Icon className="size-3.5" /></span> : <span key={i} className="mx-1 h-4 w-px bg-line" aria-hidden />))}
      </div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} aria-label="Message" placeholder="Write the announcement" className="block min-h-28 w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-3" />
    </div>
  );
}

export function AnnouncementDemo() {
  const today = useToday();
  return <AnnouncementScreen key={today} today={today} />;
}

function AnnouncementScreen({ today }: { today: string }) {
  const [posts, setPosts] = useState<Post[]>(() => startPosts(today));
  const [title, setTitle] = useState("Formal tickets close Friday");
  const [body, setBody] = useState("Buy your formal ticket from My dues by Friday at noon. Dates can be added at checkout.");
  const [audience, setAudience] = useState("all");
  const [pinned, setPinned] = useState(false);
  const [ack, setAck] = useState(true);
  const [commentsOn, setCommentsOn] = useState(true);
  const [notice, setNotice] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const ordered = [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.id - a.id);

  const update = (id: number, change: (post: Post) => Post) => setPosts((list) => list.map((post) => (post.id === id ? change(post) : post)));

  function publish(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setNotice({ tone: "danger", text: "Add a title and a message." });
      return;
    }
    const id = Math.max(0, ...posts.map((p) => p.id)) + 1;
    setPosts((list) => [...list, { id, title: title.trim(), body: body.trim(), author: ME, at: `${mediumDate(today)}, 10:15 AM`, officers: audience === "officers", pinned, ack, acks: 0, acked: false, commentsOn, comments: [] }]);
    setNotice({ tone: "positive", text: "Announcement published. Members have been notified." });
    setTitle("");
    setBody("");
    setPinned(false);
    setAck(false);
    setCommentsOn(true);
    setAudience("all");
  }

  function comment(id: number) {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    update(id, (post) => ({ ...post, comments: [...post.comments, { id: Date.now(), author: ME, body: text, at: `${mediumDate(today)}, 10:20 AM` }] }));
    setDrafts((d) => ({ ...d, [id]: "" }));
  }

  function reset() {
    setPosts(startPosts(today));
    setTitle("Formal tickets close Friday");
    setBody("Buy your formal ticket from My dues by Friday at noon. Dates can be added at checkout.");
    setAudience("all");
    setPinned(false);
    setAck(true);
    setCommentsOn(true);
    setNotice(null);
    setDrafts({});
  }

  return (
    <div>
      <TryIt>Publish the drafted post, acknowledge the pinned one, leave a comment, or pin and archive. You are signed in as the secretary.</TryIt>
      <AppFrame path="/announcements" active="announcements" onReset={reset}>
        <MockHeader title="Announcements" description="Updates from chapter officers. New announcements notify every member." />
        <Card className="mb-8">
          <CardHeader title="New announcement" />
          <CardBody>
            <form className="space-y-4" onSubmit={publish}>
              {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
              <Field label="Title" htmlFor="an-title"><Input id="an-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} /></Field>
              <Field label="Message" htmlFor="an-body" hint="Format the message, add links, and insert pictures in the text.">
                <EditorMock value={body} onChange={setBody} />
              </Field>
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-ink">Pictures</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-3">Add a picture</span>
                  <span className="text-[12px] text-ink-3">0 of 6</span>
                </div>
                <p className="text-[13px] text-ink-3">Up to 6. These show under the announcement.</p>
              </div>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <Field label="Audience" htmlFor="an-audience" className="w-48">
                  <Select id="an-audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
                    <option value="all">Whole chapter</option>
                    <option value="officers">Officers only</option>
                  </Select>
                </Field>
                <div className="space-y-2 pt-1">
                  <Checkbox checked={pinned} onChange={(event) => setPinned(event.target.checked)} label="Pin to the top" />
                  <Checkbox checked={ack} onChange={(event) => setAck(event.target.checked)} label="Ask members to acknowledge" description="Track who has read it." />
                  <Checkbox checked={commentsOn} onChange={(event) => setCommentsOn(event.target.checked)} label="Allow comments" description="You can turn comments off later. Other officers cannot." />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Publish</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-4">
          {ordered.length === 0 ? <Card><p className="px-5 py-10 text-center text-sm text-ink-3">No announcements yet. Publish the first one above.</p></Card> : null}
          {ordered.map((a) => (
            <Card key={a.id} className="fade-up">
              <div className="flex items-start gap-3 px-5 pt-4">
                <Avatar name={a.author} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-ink">{a.title}</p>
                    {a.pinned ? <Badge tone="accent"><Pin className="size-3" aria-hidden />Pinned</Badge> : null}
                    {a.officers ? <Badge tone="info">Officers only</Badge> : null}
                  </div>
                  <p className="text-[12px] text-ink-3">{a.author} · {a.at}</p>
                </div>
              </div>
              <CardBody className="space-y-4">
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{a.body}</p>
                <div className="border-t border-line pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-ink">Comments</p>
                    {a.author === ME ? <Button variant="ghost" size="sm" onClick={() => update(a.id, (p) => ({ ...p, commentsOn: !p.commentsOn }))}>{a.commentsOn ? "Turn comments off" : "Turn comments on"}</Button> : null}
                  </div>
                  {a.comments.length === 0 ? <p className="mt-2 text-[13px] text-ink-3">{a.commentsOn ? "No comments yet." : "Comments are turned off."}</p> : null}
                  {a.comments.length > 0 ? (
                    <ul className="mt-3 space-y-3">
                      {a.comments.map((c) => (
                        <li key={c.id} className="fade-up flex items-start gap-2">
                          <Avatar name={c.author} size="xs" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-ink"><span className="font-medium">{c.author}</span><span className="text-ink-3"> · {c.at}</span></p>
                            <p className="whitespace-pre-wrap text-sm text-ink-2">{c.body}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => update(a.id, (p) => ({ ...p, comments: p.comments.filter((x) => x.id !== c.id) }))}>Delete</Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {a.commentsOn ? (
                    <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); comment(a.id); }}>
                      <Input value={drafts[a.id] ?? ""} onChange={(event) => setDrafts((d) => ({ ...d, [a.id]: event.target.value }))} maxLength={2000} placeholder="Write a comment" aria-label="Comment" />
                      <Button type="submit" size="sm">Post</Button>
                    </form>
                  ) : a.comments.length > 0 ? <p className="mt-3 text-[13px] text-ink-3">Comments are turned off.</p> : null}
                </div>
              </CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                <div className="text-[13px] text-ink-3">
                  {a.ack ? (a.acked ? <span className="text-positive">You acknowledged this</span> : <Button size="sm" onClick={() => update(a.id, (p) => ({ ...p, acked: true, acks: p.acks + 1 }))}>I have read this</Button>) : null}
                </div>
                <div className="flex items-center gap-3">
                  {a.ack ? <span className="tnum text-[13px] text-ink-3">{a.acks} of {MEMBER_COUNT} acknowledged</span> : null}
                  <Button variant="ghost" size="sm" onClick={() => update(a.id, (p) => ({ ...p, pinned: !p.pinned }))}>{a.pinned ? "Unpin" : "Pin"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setPosts((list) => list.filter((p) => p.id !== a.id))}>Archive</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AppFrame>
    </div>
  );
}

type Hours = { id: number; member: string; organization: string; description: string; hours: number; date: string; status: "submitted" | "approved" | "rejected" };

const HOURS_TONE = { submitted: "warning", approved: "positive", rejected: "danger" } as const;
const HOURS_LABEL = { submitted: "Pending review", approved: "Approved", rejected: "Not approved" } as const;
const hoursLabel = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;

function startHours(today: string): Hours[] {
  return [
    { id: 1, member: "Devin Ortiz", organization: "City Food Bank", description: "Sorted donations for the weekend pantry", hours: 3, date: addDays(today, -2), status: "submitted" },
    { id: 2, member: "Sam Rivera", organization: "Riverside Elementary", description: "Reading buddies after school", hours: 1.5, date: addDays(today, -4), status: "submitted" },
    { id: 3, member: ME, organization: "Habitat for Humanity", description: "Framing crew, Saturday build", hours: 4, date: addDays(today, -1), status: "submitted" },
    { id: 4, member: ME, organization: "City Food Bank", description: "Pantry shift", hours: 2.5, date: addDays(today, -20), status: "approved" },
    { id: 5, member: ME, organization: "Campus cleanup", description: "", hours: 1, date: addDays(today, -35), status: "rejected" },
  ];
}

export function HoursDemo() {
  const today = useToday();
  return <HoursScreen key={today} today={today} />;
}

function HoursScreen({ today }: { today: string }) {
  const [rows, setRows] = useState<Hours[]>(() => startHours(today));
  const [notice, setNotice] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [form, setForm] = useState({ organization: "Animal shelter", date: today, hours: "2", description: "Walked dogs and cleaned kennels" });
  const year = today.slice(0, 4);
  const mine = rows.filter((r) => r.member === ME).sort((a, b) => b.date.localeCompare(a.date));
  const pending = rows.filter((r) => r.status === "submitted");
  const sum = (list: Hours[]) => list.reduce((t, r) => t + r.hours, 0);
  const myApproved = sum(mine.filter((r) => r.status === "approved" && r.date.startsWith(year)));
  const myPending = sum(mine.filter((r) => r.status === "submitted"));
  const chapterApproved = 212.5 + sum(rows.filter((r) => r.status === "approved" && r.date.startsWith(year)));
  const decide = (id: number, status: Hours["status"]) => setRows((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));

  function submit(event: FormEvent) {
    event.preventDefault();
    const hours = Number(form.hours);
    if (!form.organization.trim()) return setNotice({ tone: "danger", text: "Enter the organization you served." });
    if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) return setNotice({ tone: "danger", text: "Hours must be between 0.25 and 24." });
    if (form.date > today) return setNotice({ tone: "danger", text: "The date cannot be in the future." });
    setRows((list) => [...list, { id: Date.now(), member: ME, organization: form.organization.trim(), description: form.description.trim(), hours, date: form.date, status: "submitted" }]);
    setNotice({ tone: "positive", text: "Hours submitted for review." });
    setForm({ organization: "", date: today, hours: "", description: "" });
  }

  function reset() {
    setRows(startHours(today));
    setNotice(null);
    setForm({ organization: "Animal shelter", date: today, hours: "2", description: "Walked dogs and cleaned kennels" });
  }

  return (
    <div>
      <TryIt>Approve or reject submissions, then log your own hours. Your own entries can&apos;t be approved by you, so another officer has to review them.</TryIt>
      <AppFrame path="/philanthropy" active="philanthropy" onReset={reset}>
        <MockHeader title="Philanthropy" description="Service hours, volunteer shifts, and fundraising campaigns." />
        <StatGrid className="mb-8">
          <Stat label={`My approved hours, ${year}`} value={hoursLabel(myApproved)} />
          <Stat label="My hours pending review" value={hoursLabel(myPending)} />
          <Stat label={`Chapter approved hours, ${year}`} value={hoursLabel(chapterApproved)} />
          <Stat label="Submissions to review" value={pending.length} tone={pending.length ? "warning" : undefined} />
        </StatGrid>

        {pending.length ? (
          <Card className="mb-8">
            <CardHeader title="Review service hours" description="You cannot approve your own submissions." />
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Organization</Th>
                    <Th>Date</Th>
                    <Th align="right">Hours</Th>
                    <Th align="right">Decision</Th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((h) => (
                    <Tr key={h.id}>
                      <Td>{h.member}</Td>
                      <Td>
                        <p className="text-ink">{h.organization}</p>
                        {h.description ? <p className="max-w-md text-[12px] text-ink-3">{h.description}</p> : null}
                      </Td>
                      <Td>{mediumDate(h.date)}</Td>
                      <Td align="right" className="tnum">{hoursLabel(h.hours)}</Td>
                      <Td align="right">
                        {h.member === ME ? (
                          <span className="text-[12px] text-ink-3">Another officer must review</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => decide(h.id, "rejected")}>Reject</Button>
                            <Button size="sm" variant="secondary" onClick={() => decide(h.id, "approved")}>Approve</Button>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <Card className="self-start">
            <CardHeader title="My service hours" />
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Organization</Th>
                    <Th align="right">Hours</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((h) => (
                    <Tr key={h.id}>
                      <Td>{mediumDate(h.date)}</Td>
                      <Td>{h.organization}</Td>
                      <Td align="right" className="tnum">{hoursLabel(h.hours)}</Td>
                      <Td align="right"><Badge tone={HOURS_TONE[h.status]}>{HOURS_LABEL[h.status]}</Badge></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card className="self-start">
            <CardHeader title="Log service hours" description="An officer reviews each submission." />
            <CardBody>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
                {notice ? <div className="sm:col-span-2"><Notice tone={notice.tone}>{notice.text}</Notice></div> : null}
                <Field label="Organization served" htmlFor="sh-org" className="sm:col-span-2"><Input id="sh-org" value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} maxLength={120} /></Field>
                <Field label="Date" htmlFor="sh-date"><Input id="sh-date" type="date" max={today} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
                <Field label="Hours" htmlFor="sh-hours"><Input id="sh-hours" type="number" min="0.25" max="24" step="0.25" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></Field>
                <Field label="What you did" htmlFor="sh-desc" className="sm:col-span-2"><Textarea id="sh-desc" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={1000} /></Field>
                <div className="flex justify-end sm:col-span-2"><Button type="submit">Submit hours</Button></div>
              </form>
            </CardBody>
          </Card>
        </div>
      </AppFrame>
    </div>
  );
}

type Version = { version: number; date: string; summary: string; body: string; by: string };

const POLICY_V1 = "1. Every event with alcohol needs a registered risk plan filed with the risk management chair at least 7 days ahead.\n2. Sober monitors wear identifying wristbands and stay sober for the whole event.\n3. Guest lists are checked at the door. No one under 21 is served.";
const POLICY_V2 = `${POLICY_V1}\n4. Third-party vendors must provide proof of insurance before the event.`;
const FIRSTS = ["Avery", "Devin", "Noah", "Priya", "Sam", "Tyler", "Chris", "Maya", "Eli", "Grace", "Marcus", "Lena", "Owen", "Rosa", "Theo", "Zoe"];
const LASTS = ["Brooks", "Ortiz", "Kim", "Shah", "Rivera", "Grant", "Nguyen", "Patel", "Hayes", "Lopez", "Reed", "Chen", "Ward", "Diaz", "Price", "Young", "Foster", "Bell", "Cruz", "Hart", "Moss", "Lane", "Ross", "Vega"];
const ROSTER = [ME, ...Array.from({ length: 47 }, (_, i) => `${FIRSTS[(i + 1) % 16]} ${LASTS[((i + 1) * 7) % 24]}`)];
const ACTIVE = ROSTER.length;
const WAITING = ROSTER.slice(1, 7);

function startVersions(today: string): Version[] {
  return [
    { version: 2, date: addDays(today, -6), summary: "Added the vendor insurance requirement.", body: POLICY_V2, by: "Maya Patel" },
    { version: 1, date: addDays(today, -140), summary: "", body: POLICY_V1, by: "Maya Patel" },
  ];
}

export function PolicyDemo() {
  const today = useToday();
  return <PolicyScreen key={today} today={today} />;
}

function PolicyScreen({ today }: { today: string }) {
  const [versions, setVersions] = useState<Version[]>(() => startVersions(today));
  const [waiting, setWaiting] = useState<string[]>([ME, ...WAITING]);
  const [mine, setMine] = useState<string | null>(null);
  const [summary, setSummary] = useState("Monitors now check in with the risk chair every hour.");
  const [text, setText] = useState(`${POLICY_V2}\n5. Sober monitors check in with the risk management chair every hour.`);
  const [notice, setNotice] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const current = versions[0];

  function acknowledge() {
    setMine(`${mediumDate(today)}, 10:30 AM`);
    setWaiting((list) => list.filter((name) => name !== ME));
  }

  function publish(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return setNotice({ tone: "danger", text: "Enter the policy text." });
    const next = current.version + 1;
    setVersions((list) => [{ version: next, date: today, summary: summary.trim(), body: text.trim(), by: ME }, ...list]);
    setWaiting(ROSTER);
    setMine(null);
    setSummary("");
    setNotice({ tone: "positive", text: `Version ${next} published. Members must acknowledge it again.` });
  }

  function reset() {
    setVersions(startVersions(today));
    setWaiting([ME, ...WAITING]);
    setMine(null);
    setSummary("Monitors now check in with the risk chair every hour.");
    setText(`${POLICY_V2}\n5. Sober monitors check in with the risk management chair every hour.`);
    setNotice(null);
  }

  const acknowledged = ACTIVE - waiting.length;

  return (
    <div>
      <TryIt>You are signed in as the risk management chair. Acknowledge the policy, then publish a revision and watch everyone, including you, get asked again.</TryIt>
      <AppFrame path="/standards/policies/event-risk" active="standards" onReset={reset}>
        <MockHeader eyebrow={<span className="text-accent">Standards</span>} title="Event risk management" description={`Risk management · version ${current.version} · published ${mediumDate(current.date)} by ${current.by}`} />
        {mine ? (
          <Notice tone="positive" className="mb-6">You acknowledged version {current.version} on {mine}.</Notice>
        ) : (
          <Notice tone="warning" className="mb-6" title="Your acknowledgment is needed" action={<Button size="sm" onClick={acknowledge}>I have read this policy</Button>}>
            Read the policy below, then confirm.
          </Notice>
        )}
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            <Card>
              <CardBody>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{current.body}</div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Publish a revision" description="Everyone who must acknowledge will be asked again." />
              <CardBody>
                <form className="space-y-4" onSubmit={publish}>
                  {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
                  <Field label="What changed" htmlFor="pol-summary"><Input id="pol-summary" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} /></Field>
                  <Field label="Policy text" htmlFor="pol-text"><Textarea id="pol-text" value={text} onChange={(event) => setText(event.target.value)} className="min-h-40" /></Field>
                  <div className="flex justify-end"><Button type="submit">Publish version {current.version + 1}</Button></div>
                </form>
              </CardBody>
            </Card>
          </div>
          <div className="space-y-8">
            <Card>
              <CardHeader title="Acknowledgments" description={`${acknowledged} of ${ACTIVE} active members.${waiting.length ? " Still waiting on:" : ""}`} />
              {waiting.length ? (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {waiting.map((name) => <li key={name} className="px-5 py-2 text-[13px] text-ink-2">{name}</li>)}
                </ul>
              ) : (
                <p className="px-5 py-4 text-[13px] text-ink-3">Every active member has acknowledged this version.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Version history" />
              <ul className="divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.version} className="fade-up px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">Version {v.version}</p>
                      {v.version === current.version ? <Badge tone="accent">Current</Badge> : null}
                    </div>
                    <p className="text-[12px] text-ink-3">{mediumDate(v.date)}</p>
                    {v.summary ? <p className="mt-1 text-[13px] text-ink-2">{v.summary}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </AppFrame>
    </div>
  );
}
