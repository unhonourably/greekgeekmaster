"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Radar, Square } from "lucide-react";
import { Badge, Button, cx } from "@/components/ui";

export type GatherTarget = { id: string; name: string; status: string | null; finishedAt: string | null };

type Summary = {
  id: string;
  name: string;
  status: "done" | "failed" | "busy" | "missing";
  chapters: number;
  emails: number;
  newContacts: number;
  facts: number;
  sites: number;
  pages: number;
  error: string | null;
};

type Running = { id: string; name: string; startedAt: number };

const AT_ONCE = 3;
const FIRST_GUESS_MS = 60_000;
const MAX_READ_MS = 100_000;
const FRESH_DAYS = 30;

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function fresh(target: GatherTarget, now: number): boolean {
  if (target.status !== "done" || !target.finishedAt) return false;
  return now - new Date(target.finishedAt).getTime() < FRESH_DAYS * 24 * 60 * 60 * 1000;
}

export function GatherAll({ schools, state }: { schools: GatherTarget[]; state: string }) {
  const router = useRouter();
  const [skipFresh, setSkipFresh] = useState(true);
  const [phase, setPhase] = useState<"idle" | "running" | "stopping" | "finished">("idle");
  const [queue, setQueue] = useState<GatherTarget[]>([]);
  const [running, setRunning] = useState<Running[]>([]);
  const [results, setResults] = useState<Summary[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [fatal, setFatal] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [loadedAt] = useState(() => Date.now());

  const pending = useMemo(() => schools.filter((school) => !skipFresh || !fresh(school, loadedAt)), [schools, skipFresh, loadedAt]);
  const skipped = schools.length - pending.length;
  const active = phase === "running" || phase === "stopping";

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", warn);
    };
  }, [active]);

  const start = useCallback(async () => {
    const list = pending;
    if (list.length === 0) return;
    stopRef.current = false;
    setFatal(null);
    setQueue(list);
    setResults([]);
    setDurations([]);
    setRunning([]);
    setStartedAt(Date.now());
    setNow(Date.now());
    setPhase("running");
    let next = 0;
    const worker = async () => {
      while (!stopRef.current && next < list.length) {
        const target = list[next++];
        const began = Date.now();
        setRunning((current) => [...current, { id: target.id, name: target.name, startedAt: began }]);
        let summary: Summary;
        try {
          const response = await fetch("/api/outreach/gather", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: target.id }) });
          if (response.status === 403 || response.status === 401) {
            stopRef.current = true;
            setFatal("Your session ended or you are no longer an admin. Sign in again and restart.");
          }
          const data = (await response.json().catch(() => null)) as Summary | null;
          summary = response.ok && data ? data : { id: target.id, name: target.name, status: "failed", chapters: 0, emails: 0, newContacts: 0, facts: 0, sites: 0, pages: 0, error: response.status === 504 ? "The read ran out of time." : `The server answered ${response.status}.` };
        } catch {
          summary = { id: target.id, name: target.name, status: "failed", chapters: 0, emails: 0, newContacts: 0, facts: 0, sites: 0, pages: 0, error: "The request did not reach the server." };
        }
        const took = Date.now() - began;
        setRunning((current) => current.filter((item) => item.id !== target.id));
        setResults((current) => [...current, summary]);
        if (summary.status !== "busy") setDurations((current) => [...current, took]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, list.length) }, worker));
    setFinishedAt(Date.now());
    setPhase("finished");
    router.refresh();
  }, [pending, router]);

  const stop = () => {
    stopRef.current = true;
    setPhase("stopping");
  };

  const total = queue.length;
  const done = results.length;
  const average = durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : FIRST_GUESS_MS;
  const longest = durations.length > 0 ? Math.max(...durations) : FIRST_GUESS_MS;
  const expected = (startedAtMs: number) => {
    const spent = now - startedAtMs;
    return Math.min(Math.max(average, spent * 1.3, spent + 3_000), Math.max(longest, spent + 3_000, MAX_READ_MS));
  };
  const partial = running.reduce((sum, item) => sum + (now - item.startedAt) / expected(item.startedAt), 0);
  const progress = total === 0 ? 0 : Math.min(1, (done + partial) / total);
  const elapsed = (phase === "finished" ? finishedAt : now) - startedAt;
  const left = Math.max(0, total - done - running.length);
  const inFlight = running.map((item) => expected(item.startedAt) - (now - item.startedAt));
  const remainingMs = phase === "stopping" ? Math.max(0, ...inFlight) : Math.max(left * average / AT_ONCE + inFlight.reduce((sum, value) => sum + value, 0) / AT_ONCE, ...inFlight, 0);
  const totals = results.reduce((sum, row) => ({
    emails: sum.emails + row.emails,
    newContacts: sum.newContacts + row.newContacts,
    chapters: sum.chapters + row.chapters,
    sites: sum.sites + row.sites,
    failed: sum.failed + (row.status === "failed" ? 1 : 0),
  }), { emails: 0, newContacts: 0, chapters: 0, sites: 0, failed: 0 });
  const estimate = (pending.length * FIRST_GUESS_MS) / AT_ONCE;

  return (
    <section className="rounded-lg border border-line bg-surface" aria-label={`Gather all schools in ${state}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-ink"><Radar className="size-4 text-accent" aria-hidden />Gather all in {state}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {phase === "idle"
              ? `Reads ${pending.length.toLocaleString("en-US")} of ${schools.length.toLocaleString("en-US")} school${schools.length === 1 ? "" : "s"}, ${AT_ONCE} at a time, including the chapter websites each one links to. About ${clock(estimate)}. Keep this tab open.`
              : phase === "finished"
                ? `Finished ${done.toLocaleString("en-US")} school${done === 1 ? "" : "s"} in ${clock(elapsed)}.`
                : phase === "stopping"
                  ? `Stopping. Waiting for the ${running.length} school${running.length === 1 ? "" : "s"} already being read.`
                  : `Reading ${running.length} at a time. Keep this tab open.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" || phase === "finished" ? (
            <>
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={skipFresh} onChange={(event) => setSkipFresh(event.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                Skip schools gathered in the last {FRESH_DAYS} days{skipped > 0 ? ` (${skipped})` : ""}
              </label>
              <Button size="sm" onClick={start} disabled={pending.length === 0}>
                {phase === "finished" ? "Run again" : `Gather all ${pending.length.toLocaleString("en-US")}`}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={stop} disabled={phase === "stopping"}>
              <Square className="size-3.5" aria-hidden />{phase === "stopping" ? "Stopping" : "Stop"}
            </Button>
          )}
        </div>
      </div>

      {phase !== "idle" ? (
        <div className="space-y-4 border-t border-line px-5 py-4">
          {fatal ? <p className="text-sm text-danger">{fatal}</p> : null}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium text-ink">{done.toLocaleString("en-US")} of {total.toLocaleString("en-US")} schools · {Math.round(progress * 100)}%</span>
              <span className="tabular-nums text-ink-3">
                {clock(elapsed)} elapsed{active ? ` · about ${clock(remainingMs)} left` : ""}
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Schools gathered">
              <div
                className={cx("relative h-full rounded-full transition-[width] duration-500 ease-out", phase === "finished" ? "bg-positive" : "bg-accent")}
                style={{ width: `${Math.max(progress * 100, active ? 1.5 : 0)}%` }}
              >
                {active ? <span className="absolute inset-0 animate-pulse rounded-full bg-white/15" /> : null}
              </div>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">
              {durations.length > 0 ? `Averaging ${clock(average)} per school.` : "The estimate sharpens after the first school finishes."}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Emails found", totals.emails],
              ["New contacts", totals.newContacts],
              ["Chapters", totals.chapters],
              ["Chapter sites read", totals.sites],
              ["Failed", totals.failed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-line bg-canvas px-3 py-2">
                <dt className="text-[12px] text-ink-3">{label}</dt>
                <dd className={cx("text-lg font-semibold tabular-nums", label === "Failed" && Number(value) > 0 ? "text-danger" : "text-ink")}>{Number(value).toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>

          {running.length > 0 ? (
            <ul className="space-y-1.5">
              {running.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-ink-2">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" aria-hidden />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[12px] text-ink-3">{clock(now - item.startedAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {results.length > 0 ? (
            <details className="group rounded-md border border-line" open={results.length <= 12}>
              <summary className="cursor-pointer px-3 py-2 text-[13px] text-ink-2">Finished schools ({results.length})</summary>
              <ul className="max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
                {[...results].reverse().map((row) => (
                  <li key={`${row.id}-${row.status}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link href={`/admin/outreach/schools/${row.id}`} className="flex min-w-0 items-center gap-2 text-ink hover:text-accent">
                      {row.status === "done" ? <CheckCircle2 className="size-3.5 shrink-0 text-positive" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 text-danger" aria-hidden />}
                      <span className="truncate">{row.name}</span>
                    </Link>
                    {row.status === "done" ? (
                      <span className="flex flex-wrap gap-1.5">
                        <Badge tone={row.emails > 0 ? "positive" : "neutral"}>{row.emails} email{row.emails === 1 ? "" : "s"}{row.newContacts > 0 ? ` · ${row.newContacts} new` : ""}</Badge>
                        <Badge>{row.chapters} chapters</Badge>
                        {row.sites > 0 ? <Badge tone="info">{row.sites} chapter site{row.sites === 1 ? "" : "s"}</Badge> : null}
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-3">{row.status === "busy" ? "Already being read" : row.error ?? "Failed"}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
