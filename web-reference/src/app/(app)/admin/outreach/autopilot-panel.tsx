"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Pause, Play, Rocket, Square } from "lucide-react";
import { SubmitButton } from "@/components/forms";
import { Badge, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import type { AutopilotRow } from "./autopilot";
import { pauseAutopilot, resumeAutopilot, startAutopilot, stopAutopilot } from "./autopilot-actions";

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

export function AutopilotPanel({ initial, initialWaiting, sendAt, atOnce, totalSchools }: { initial: AutopilotRow; initialWaiting: number; sendAt: number; atOnce: number; totalSchools: number }) {
  const router = useRouter();
  const [row, setRow] = useState(initial);
  const [waiting, setWaiting] = useState(initialWaiting);
  const [now, setNow] = useState(() => Date.now());
  const [state, startAction] = useActionState<ActionState, FormData>(startAutopilot, {});
  const driving = useRef(false);
  const status = row.status;

  useEffect(() => {
    if (status !== "running" && status !== "paused") return;
    const poll = window.setInterval(async () => {
      setNow(Date.now());
      const response = await fetch("/api/outreach/autopilot", { cache: "no-store" }).catch(() => null);
      const data = response?.ok ? ((await response.json().catch(() => null)) as { row: AutopilotRow | null; waiting: number } | null) : null;
      if (data?.row) {
        setRow(data.row);
        setWaiting(data.waiting);
        if (data.row.status !== "running" && data.row.status !== "paused") router.refresh();
      }
    }, 5_000);
    return () => window.clearInterval(poll);
  }, [status, router]);

  useEffect(() => {
    if (status !== "running" || driving.current) return;
    driving.current = true;
    let cancelled = false;
    const drive = async () => {
      while (!cancelled) {
        if (document.visibilityState !== "visible") {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          continue;
        }
        const response = await fetch("/api/outreach/autopilot", { method: "POST" }).catch(() => null);
        const data = response?.ok ? ((await response.json().catch(() => null)) as { ran: boolean; row: AutopilotRow | null; waiting: number } | null) : null;
        if (data?.row) {
          setRow(data.row);
          setWaiting(data.waiting);
          if (data.row.status !== "running") break;
        }
        if (!response || response.status === 401 || response.status === 403) break;
        if (!data?.ran) await new Promise((resolve) => setTimeout(resolve, 8_000));
      }
      driving.current = false;
    };
    drive();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const processed = row.schools_read + row.schools_skipped + row.schools_failed;
  const total = Math.max(row.schools_total, processed, 1);
  const progress = Math.min(1, processed / total);
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : now;
  const elapsed = (row.finished_at ? new Date(row.finished_at).getTime() : now) - startedAt;
  const perSchool = processed > 0 ? elapsed / processed : 0;
  const remaining = perSchool > 0 ? (total - processed) * perSchool : 0;
  const pausedSending = row.send_paused_until && new Date(row.send_paused_until).getTime() > now;
  const active = status === "running" || status === "paused";

  return (
    <section className="rounded-lg border border-line bg-surface" aria-label="Autopilot for every state">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <Rocket className="size-4 text-accent" aria-hidden />Autopilot: every state
            {status === "running" ? <Badge tone="accent">Running</Badge> : status === "paused" ? <Badge tone="warning">Paused</Badge> : status === "done" ? <Badge tone="positive">Done</Badge> : null}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Gathers every school in all 50 states and DC, {atOnce} at a time{active ? (row.skip_recent ? ", skipping schools read in the last 30 days" : ", reading every school again") : ""}. Contacts that were never emailed go on the bulk list, and the list sends by itself every time it reaches {sendAt}. It runs on the server every minute, and faster while this page is open.
          </p>
        </div>
        {active ? (
          <div className="flex flex-wrap items-center gap-2">
            {status === "running" ? (
              <form action={pauseAutopilot}><SubmitButton size="sm" variant="secondary" pendingLabel="Pausing"><Pause className="size-3.5" aria-hidden />Pause</SubmitButton></form>
            ) : (
              <form action={resumeAutopilot}><SubmitButton size="sm" pendingLabel="Resuming"><Play className="size-3.5" aria-hidden />Resume</SubmitButton></form>
            )}
            <form action={stopAutopilot}><SubmitButton size="sm" variant="ghost" pendingLabel="Stopping"><Square className="size-3.5" aria-hidden />Stop</SubmitButton></form>
          </div>
        ) : null}
      </div>

      {!active ? (
        <form action={startAction} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-5 py-4">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" name="include_form" defaultChecked={row.include_form} className="size-4 accent-[var(--color-accent)]" />
            Include the school form link
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" name="skip_recent" defaultChecked={row.skip_recent} className="size-4 accent-[var(--color-accent)]" />
            Skip schools read in the last 30 days
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" name="confirm" required className="size-4 accent-[var(--color-accent)]" />
            I understand emails will send on their own, {sendAt} at a time
          </label>
          <SubmitButton size="sm" pendingLabel="Starting"><Rocket className="size-3.5" aria-hidden />{`Start for ${totalSchools.toLocaleString("en-US")} schools`}</SubmitButton>
          {state.error ? <p className="w-full text-sm text-danger">{state.error}</p> : null}
          {waiting > 0 ? <p className="w-full text-[12px] text-ink-3">{waiting.toLocaleString("en-US")} already on the <Link href="/admin/outreach/bulk" className="underline hover:text-ink">bulk list</Link> will go out with the first send, including any letters you edited.</p> : null}
        </form>
      ) : null}

      {row.started_at ? (
        <div className="space-y-4 border-t border-line px-5 py-4">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium text-ink">
                {processed.toLocaleString("en-US")} of {total.toLocaleString("en-US")} schools · {Math.round(progress * 100)}%{row.current_state && active ? ` · now in ${row.current_state}` : ""}
              </span>
              <span className="tabular-nums text-ink-3">{clock(elapsed)} elapsed{status === "running" && remaining > 0 ? ` · about ${clock(remaining)} left` : ""}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed} aria-label="Schools handled">
              <div className={cx("relative h-full rounded-full transition-[width] duration-500 ease-out", status === "done" ? "bg-positive" : status === "paused" ? "bg-warning" : "bg-accent")} style={{ width: `${Math.max(progress * 100, status === "running" ? 1.5 : 0)}%` }}>
                {status === "running" ? <span className="absolute inset-0 animate-pulse rounded-full bg-white/15" /> : null}
              </div>
            </div>
            {row.last_message ? <p className="mt-1.5 text-[12px] text-ink-3">{row.last_message}</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Schools read", row.schools_read],
              ["Skipped", row.schools_skipped],
              ["Read failed", row.schools_failed],
              ["Added to bulk list", row.contacts_added],
              [`On the list (sends at ${sendAt})`, waiting],
              ["Emails sent", row.emails_sent],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-line bg-canvas px-3 py-2">
                <dt className="text-[12px] text-ink-3">{label}</dt>
                <dd className={cx("text-lg font-semibold tabular-nums", label === "Read failed" && Number(value) > 0 ? "text-danger" : "text-ink")}>{Number(value).toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
          {pausedSending && row.send_error ? (
            <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-warning">
              Sending is paused until {new Date(row.send_paused_until!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} and will try again then. Reason: {row.send_error}
            </p>
          ) : null}
          {row.emails_failed > 0 ? <p className="text-[13px] text-danger">{row.emails_failed} email{row.emails_failed === 1 ? "" : "s"} failed and stayed on the bulk list.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
