"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Camera, CircleCheck } from "lucide-react";
import { Avatar } from "@/components/people";
import { Badge, Button, Card, CardBody, CardHeader, Input, Select, Stat, StatGrid, Table, Td, Th, Tr, cx } from "@/components/ui";
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, type AttendanceStatus } from "@/lib/events";
import { AppFrame, MockHeader, SAMPLE_CHAPTER, TryIt } from "./shared";

type Mark = { status: AttendanceStatus; method: "qr" | "manual"; at: string };
type Correction = { id: number; member: string; from: AttendanceStatus; to: AttendanceStatus; reason: string; at: string };

const EVENT = { title: "Chapter meeting", start: "7:30 PM", end: "8:30 PM", opens: "6:30 PM", closes: "9:00 PM", location: "Student Union 204" };

const ROSTER = [
  { name: "Marcus Hill", detail: "Active · required" },
  { name: "Devin Ortiz", detail: "Active · required" },
  { name: "Chris Nguyen", detail: "Active · required" },
  { name: "Sam Patel", detail: "Active · required" },
  { name: "Tyler Brooks", detail: "New member · required" },
  { name: "Alex Rivera", detail: "New member · required" },
];

const START: Record<string, Mark> = {
  "Marcus Hill": { status: "present", method: "qr", at: "7:21 PM" },
  "Devin Ortiz": { status: "present", method: "qr", at: "7:26 PM" },
};

const ARRIVALS = [
  { value: "7:28 PM", label: "7:28 PM, on time" },
  { value: "7:52 PM", label: "7:52 PM, 22 minutes after the start" },
];

function token(): string {
  return Math.random().toString(36).slice(2, 12);
}

function QrCard() {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const draw = async () => {
      const markup = await QRCode.toString(`https://greekgeek.org/c/${SAMPLE_CHAPTER.slug}/events/sample/scan?t=${token()}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });
      if (alive) setSvg(markup);
    };
    void draw();
    const timer = window.setInterval(draw, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <div className="flex flex-col items-center gap-4">
      {svg ? (
        <div className="aspect-square w-full max-w-[15rem] rounded-lg border border-line bg-white p-4 [&>svg]:size-full" aria-label="Check-in QR code" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="aspect-square w-full max-w-[15rem] animate-pulse rounded-lg border border-line bg-subtle" aria-label="Loading check-in code" />
      )}
      <p className="text-center text-[13px] text-ink-3">The code changes every 30 seconds, so screenshots stop working quickly.</p>
    </div>
  );
}

function AttendanceControl({ current, onSave }: { current: AttendanceStatus | null; onSave: (status: AttendanceStatus, reason: string) => void }) {
  const [status, setStatus] = useState<AttendanceStatus>(current ?? "present");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsReason = current !== null && status !== current;
  return (
    <form
      className="flex flex-wrap items-center justify-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (needsReason && reason.trim().length < 3) {
          setError("Give a reason for the change.");
          return;
        }
        onSave(status, reason.trim());
        setReason("");
        setError(null);
      }}
    >
      <Select value={status} onChange={(event) => setStatus(event.target.value as AttendanceStatus)} aria-label="Attendance status" className="h-8 w-32 text-[13px]">
        {(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((s) => <option key={s} value={s}>{ATTENDANCE_LABEL[s]}</option>)}
      </Select>
      {needsReason ? <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for change" maxLength={500} className="h-8 w-48 text-[13px]" aria-label="Reason for change" /> : null}
      <Button type="submit" size="sm" variant="secondary" disabled={current !== null && !needsReason}>{current ? "Update" : "Record"}</Button>
      {error ? <span className="w-full text-right text-[12px] text-danger">{error}</span> : null}
    </form>
  );
}

export function CheckInDemo() {
  const [view, setView] = useState<"check-in" | "attendance">("check-in");
  const [records, setRecords] = useState(START);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [phone, setPhone] = useState<"camera" | "scan" | "done">("camera");
  const [scanner, setScanner] = useState("Sam Patel");
  const [arrival, setArrival] = useState(ARRIVALS[0].value);
  const [message, setMessage] = useState("");

  const waiting = ROSTER.filter((m) => !records[m.name]).map((m) => m.name);
  const values = Object.values(records);
  const tally: Record<AttendanceStatus, number> = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const record of values) tally[record.status] += 1;
  const missing = ROSTER.length - values.length;

  function reset() {
    setRecords(START);
    setCorrections([]);
    setPhone("camera");
    setScanner("Sam Patel");
    setArrival(ARRIVALS[0].value);
    setView("check-in");
  }

  function checkIn() {
    const late = arrival !== ARRIVALS[0].value;
    setRecords((map) => ({ ...map, [scanner]: { status: late ? "late" : "present", method: "qr", at: arrival } }));
    setMessage(late ? `Checked in at ${arrival}. This event starts at ${EVENT.start}, and arrivals more than 15 minutes after that are marked late.` : `Checked in at ${arrival}.`);
    setPhone("done");
  }

  function nextScanner() {
    const left = waiting.filter((name) => name !== scanner);
    if (left[0]) setScanner(left[0]);
    setPhone("camera");
  }

  return (
    <div>
      <TryIt>Use the phone to scan the code on the officer&apos;s screen and check in. Then open the Attendance page and correct a record.</TryIt>
      <div className="mb-3 inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist" aria-label="Officer screen">
        {(["check-in", "attendance"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={cx("rounded px-3 py-1 text-[13px] transition-colors", view === key ? "bg-subtle font-medium text-ink" : "text-ink-3 hover:text-ink")}>
            {key === "check-in" ? "Check-in screen" : "Attendance page"}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <AppFrame path={`/events/sample/${view}`} active="events" onReset={reset}>
          {view === "check-in" ? (
            <>
              <MockHeader
                eyebrow={<span className="text-accent">{EVENT.title}</span>}
                title="Check-in"
                description={`Members scan this with their phone camera while signed in. Open from ${EVENT.opens} until ${EVENT.closes}. Arrivals more than 15 minutes after the start are marked late.`}
              />
              <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
                <Card>
                  <CardBody className="py-8">
                    <QrCard />
                  </CardBody>
                </Card>
                <StatGrid className="h-fit lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
                  <Stat label="Checked in" value={tally.present + tally.late} />
                  <Stat label="Late" value={tally.late} tone={tally.late ? "warning" : undefined} />
                </StatGrid>
              </div>
            </>
          ) : (
            <>
              <MockHeader eyebrow={<span className="text-accent">{EVENT.title}</span>} title="Attendance" description="Record attendance for anyone who could not scan in. Changing an existing record requires a reason and is kept in the correction log." />
              <StatGrid className="mb-6">
                <Stat label="Present" value={tally.present} />
                <Stat label="Late" value={tally.late} tone={tally.late ? "warning" : undefined} />
                <Stat label="Excused" value={tally.excused} />
                <Stat label="Not recorded (required)" value={missing} tone={missing ? "danger" : undefined} />
              </StatGrid>
              <Card>
                <Table>
                  <thead>
                    <tr>
                      <Th>Member</Th>
                      <Th>Status</Th>
                      <Th>Recorded</Th>
                      <Th align="right">Update</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROSTER.map((m) => {
                      const record = records[m.name];
                      return (
                        <Tr key={m.name}>
                          <Td>
                            <span className="flex items-center gap-2">
                              <Avatar name={m.name} size="xs" />
                              <span>
                                <span className="block">{m.name}</span>
                                <span className="block text-[12px] text-ink-3">{m.detail}</span>
                              </span>
                            </span>
                          </Td>
                          <Td>{record ? <Badge tone={ATTENDANCE_TONE[record.status]}>{ATTENDANCE_LABEL[record.status]}</Badge> : <span className="text-[13px] text-ink-3">Not recorded</span>}</Td>
                          <Td className="text-[13px] text-ink-3">{record ? `${record.method === "qr" ? "QR scan" : "Manual"} · ${record.at}` : ""}</Td>
                          <Td align="right">
                            <AttendanceControl
                              key={record?.status ?? "none"}
                              current={record?.status ?? null}
                              onSave={(status, reason) => {
                                if (record) setCorrections((list) => [{ id: list.length + 1, member: m.name, from: record.status, to: status, reason, at: "Today, 8:41 PM" }, ...list]);
                                setRecords((map) => ({ ...map, [m.name]: { status, method: record?.method ?? "manual", at: record?.at ?? "8:41 PM" } }));
                              }}
                            />
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
              {corrections.length ? (
                <Card className="mt-6">
                  <CardHeader title="Correction log" description="Every change to an existing attendance record." />
                  <Table>
                    <thead>
                      <tr>
                        <Th>When</Th>
                        <Th>Member</Th>
                        <Th>Change</Th>
                        <Th>Reason</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {corrections.map((c) => (
                        <Tr key={c.id} className="fade-up">
                          <Td className="whitespace-nowrap text-[13px]">{c.at}</Td>
                          <Td>{c.member}</Td>
                          <Td className="text-[13px]">{ATTENDANCE_LABEL[c.from]} to {ATTENDANCE_LABEL[c.to]}</Td>
                          <Td className="text-[13px] text-ink-2">{c.reason}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ) : null}
            </>
          )}
        </AppFrame>

        <div className="mx-auto w-full max-w-[280px]">
          <p className="mb-2 text-center text-[12px] text-ink-3">A member&apos;s phone</p>
          <div className="rounded-[2rem] border border-line-strong bg-surface p-2.5">
            <div className="flex min-h-[26rem] flex-col overflow-hidden rounded-[1.6rem] border border-line bg-canvas">
              <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-line-strong" aria-hidden />
              {phone === "camera" ? (
                <div className="flex flex-1 flex-col gap-3 p-4">
                  {waiting.length === 0 ? (
                    <p className="my-auto text-center text-[13px] text-ink-3">Everyone on the roster is checked in. Press Reset to start over.</p>
                  ) : (
                    <>
                      <label className="block text-[12px] text-ink-3">
                        Signed in as
                        <Select value={waiting.includes(scanner) ? scanner : waiting[0]} onChange={(event) => setScanner(event.target.value)} className="mt-1 h-8 text-[13px]">
                          {waiting.map((name) => <option key={name}>{name}</option>)}
                        </Select>
                      </label>
                      <label className="block text-[12px] text-ink-3">
                        Arrives at
                        <Select value={arrival} onChange={(event) => setArrival(event.target.value)} className="mt-1 h-8 text-[13px]">
                          {ARRIVALS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </Select>
                      </label>
                      <div className="mt-1 grid flex-1 place-items-center rounded-xl border border-dashed border-line-strong bg-black/40 text-center">
                        <div className="space-y-2 px-4">
                          <Camera className="mx-auto size-6 text-ink-3" aria-hidden />
                          <p className="text-[12px] text-ink-3">Camera pointed at the code on the screen</p>
                        </div>
                      </div>
                      <Button onClick={() => { if (!waiting.includes(scanner)) setScanner(waiting[0]); setPhone("scan"); }}>Scan the code</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 p-3 pt-6">
                  <Card>
                    <CardBody className="space-y-5 py-6">
                      <div className="text-center">
                        <p className="text-[13px] text-ink-3">{SAMPLE_CHAPTER.name}</p>
                        <p className="mt-1 text-lg font-semibold text-ink">{EVENT.title}</p>
                        <p className="text-[13px] text-ink-3 tnum">{EVENT.start} – {EVENT.end} · {EVENT.location}</p>
                      </div>
                      {phone === "scan" ? (
                        <Button className="w-full" onClick={checkIn}>Check in</Button>
                      ) : (
                        <div className="fade-up flex flex-col items-center gap-3 text-center">
                          <CircleCheck className="size-10 text-positive" aria-hidden />
                          <p className="text-sm font-medium text-ink">{message}</p>
                          <span className="text-sm text-accent">View event</span>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>
          </div>
          {phone === "done" && waiting.length ? (
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={nextScanner}>Next member scans in</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
