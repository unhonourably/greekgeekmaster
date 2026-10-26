import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { gatherSchool } from "./gather";
import { deliverBulk } from "./send";
import { newContactIds, queueNewContacts, stateSchoolIds, STATES } from "./state-contacts";

type Client = Awaited<ReturnType<typeof createClient>>;

export const AUTOPILOT_SEND_AT = 500;
export const AUTOPILOT_AT_ONCE = 4;
const START_WINDOW_MS = 90_000;
const LEASE_MS = 290_000;
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const SEND_PAUSE_MS = 60 * 60 * 1000;
const STATUS_CHECK_MS = 10_000;
const FLUSH_MS = 4_000;

export type AutopilotStatus = "idle" | "running" | "paused" | "done";

export type AutopilotRow = {
  status: AutopilotStatus;
  started_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  include_form: boolean;
  skip_recent: boolean;
  state_index: number;
  school_offset: number;
  current_state: string | null;
  schools_total: number;
  schools_read: number;
  schools_skipped: number;
  schools_failed: number;
  contacts_added: number;
  emails_sent: number;
  emails_failed: number;
  send_runs: number;
  last_tick_at: string | null;
  lease_until: string | null;
  send_paused_until: string | null;
  send_error: string | null;
  last_message: string | null;
};

export const AUTOPILOT_COLUMNS = "status, started_by, started_at, finished_at, include_form, skip_recent, state_index, school_offset, current_state, schools_total, schools_read, schools_skipped, schools_failed, contacts_added, emails_sent, emails_failed, send_runs, last_tick_at, lease_until, send_paused_until, send_error, last_message";

export async function readAutopilot(supabase: Client): Promise<{ row: AutopilotRow | null; missing: boolean }> {
  const { data, error } = await supabase.from("outreach_autopilot").select(AUTOPILOT_COLUMNS).eq("id", 1).maybeSingle();
  if (error) return { row: null, missing: /does not exist|schema cache/i.test(error.message) };
  return { row: (data ?? null) as AutopilotRow | null, missing: false };
}

export async function totalSchools(supabase: Client): Promise<number> {
  const { count } = await supabase.from("universities").select("id", { count: "exact", head: true }).eq("source", "ipeds").in("state", STATES);
  return count ?? 0;
}

export async function bulkWaiting(supabase: Client): Promise<number> {
  const { count } = await supabase.from("outreach_contacts").select("id", { count: "exact", head: true }).not("bulk_added_at", "is", null).eq("do_not_contact", false);
  return count ?? 0;
}

async function claim(supabase: Client): Promise<AutopilotRow | null> {
  const now = new Date();
  const { data } = await supabase
    .from("outreach_autopilot")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), last_tick_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", 1)
    .eq("status", "running")
    .or(`lease_until.is.null,lease_until.lt."${now.toISOString()}"`)
    .select(AUTOPILOT_COLUMNS)
    .maybeSingle();
  return (data ?? null) as AutopilotRow | null;
}

async function recentlyRead(supabase: Client, ids: string[]): Promise<Set<string>> {
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const recent = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("university_outreach").select("university_id").in("university_id", ids.slice(i, i + 200)).eq("research_status", "done").gte("research_finished_at", since);
    for (const row of data ?? []) recent.add(row.university_id as string);
  }
  return recent;
}

export type TickResult = { ran: boolean; row: AutopilotRow | null };

export async function tickAutopilot(supabase: Client): Promise<TickResult> {
  const job = await claim(supabase);
  if (!job) return { ran: false, row: (await readAutopilot(supabase)).row };
  const started = Date.now();
  let stateIndex = job.state_index;
  let offset = job.school_offset;
  let currentState = job.current_state;
  let read = 0;
  let skipped = 0;
  let failed = 0;
  const touched: string[] = [];
  let running = true;
  let checkedAt = Date.now();
  const stillRunning = async () => {
    if (!running) return false;
    if (Date.now() - checkedAt < STATUS_CHECK_MS) return true;
    checkedAt = Date.now();
    const { data } = await supabase.from("outreach_autopilot").select("status, started_at").eq("id", 1).maybeSingle();
    running = data?.status === "running" && data?.started_at === job.started_at;
    return running;
  };
  const inWindow = () => Date.now() - started < START_WINDOW_MS;
  let flushedAt = 0;
  let flushing: Promise<unknown> | null = null;
  const flush = (note: string, force = false) => {
    if (flushing || (!force && Date.now() - flushedAt < FLUSH_MS)) return;
    flushedAt = Date.now();
    flushing = Promise.resolve(supabase
      .from("outreach_autopilot")
      .update({
        current_state: currentState,
        schools_read: job.schools_read + read,
        schools_skipped: job.schools_skipped + skipped,
        schools_failed: job.schools_failed + failed,
        last_message: note.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .eq("started_at", job.started_at ?? ""))
      .catch(() => null)
      .finally(() => {
        flushing = null;
      });
  };

  while (stateIndex < STATES.length && inWindow() && await stillRunning()) {
    const state = STATES[stateIndex];
    currentState = state;
    const ids = await stateSchoolIds(supabase, state);
    if (offset >= ids.length) {
      stateIndex++;
      offset = 0;
      continue;
    }
    const recent = job.skip_recent ? await recentlyRead(supabase, ids.slice(offset)) : new Set<string>();
    flush(`Reading ${state}, school ${offset + 1} of ${ids.length}.`, true);
    let next = offset;
    await Promise.all(Array.from({ length: AUTOPILOT_AT_ONCE }, async () => {
      while (next < ids.length && inWindow() && await stillRunning()) {
        const id = ids[next++];
        touched.push(id);
        if (recent.has(id)) {
          skipped++;
          continue;
        }
        const summary = await gatherSchool(supabase, id).catch(() => null);
        if (!summary || summary.status === "failed") failed++;
        else if (summary.status === "done") read++;
        else skipped++;
        flush(summary?.status === "done" ? `Reading ${state}, ${Math.min(next, ids.length)} of ${ids.length}. Last: ${summary.name}, ${summary.emails} email${summary.emails === 1 ? "" : "s"}.` : `Reading ${state}, ${Math.min(next, ids.length)} of ${ids.length}.`);
      }
    }));
    offset = next;
    if (offset >= ids.length) {
      stateIndex++;
      offset = 0;
    }
  }

  const { data: latest } = await supabase.from("outreach_autopilot").select("status, started_at").eq("id", 1).maybeSingle();
  const stopped = !latest || latest.started_at !== job.started_at || latest.status === "idle";
  if (stopped) return { ran: true, row: (await readAutopilot(supabase)).row };
  const added = touched.length > 0 ? await queueNewContacts(supabase, await newContactIds(supabase, touched)) : 0;
  const finished = stateIndex >= STATES.length;
  let sent = 0;
  let sendFailed = 0;
  let sendRuns = 0;
  let pausedUntil = job.send_paused_until;
  let message: string | null = null;
  let sendError = job.send_error;
  const sendingPaused = pausedUntil ? new Date(pausedUntil).getTime() > Date.now() : false;
  const waiting = await bulkWaiting(supabase);
  if (await stillRunning() && !sendingPaused && job.started_by && (waiting >= AUTOPILOT_SEND_AT || (finished && waiting > 0))) {
    sendRuns = 1;
    let problem: string | null = null;
    try {
      const result = await deliverBulk(job.started_by, job.include_form, supabase);
      const runId = result.values?.run;
      if (runId) {
        const { data: run } = await supabase.from("outreach_bulk_runs").select("sent, failed, stopped_reason").eq("id", runId).maybeSingle();
        sent = run?.sent ?? 0;
        sendFailed = run?.failed ?? 0;
        if (run?.stopped_reason) problem = run.stopped_reason;
      } else {
        problem = result.error ?? result.message ?? "The bulk send did not start.";
      }
    } catch (error) {
      problem = error instanceof Error ? error.message : "The bulk send crashed.";
    }
    if (problem) {
      console.error("[autopilot] send", problem);
      pausedUntil = new Date(Date.now() + SEND_PAUSE_MS).toISOString();
      sendError = problem.slice(0, 500);
      message = `Sending paused for an hour: ${problem}`;
    } else {
      sendError = null;
      message = `Sent ${sent} email${sent === 1 ? "" : "s"} from the bulk list.`;
    }
  }
  const leftAfter = sendRuns > 0 ? await bulkWaiting(supabase) : waiting;
  const done = finished && leftAfter === 0;
  if (!message) {
    if (done) message = "Every state is gathered and the bulk list is sent.";
    else if (finished) message = sendingPaused ? "Every state is gathered. Waiting to send the rest of the bulk list." : "Every state is gathered. Sending the rest of the bulk list.";
    else message = `Reading ${currentState ?? "schools"}. ${read} read, ${skipped} skipped this round. ${leftAfter} on the bulk list.`;
  }

  await flushing;
  const now = new Date().toISOString();
  await supabase
    .from("outreach_autopilot")
    .update({
      state_index: stateIndex,
      school_offset: offset,
      current_state: finished ? null : STATES[stateIndex] ?? currentState,
      schools_read: job.schools_read + read,
      schools_skipped: job.schools_skipped + skipped,
      schools_failed: job.schools_failed + failed,
      contacts_added: job.contacts_added + added,
      emails_sent: job.emails_sent + sent,
      emails_failed: job.emails_failed + sendFailed,
      send_runs: job.send_runs + sendRuns,
      ...(sendRuns > 0 ? { send_paused_until: pausedUntil, send_error: sendError } : {}),
      last_message: message.slice(0, 500),
      lease_until: null,
      updated_at: now,
    })
    .eq("id", 1)
    .eq("started_at", job.started_at ?? "");
  if (done) await supabase.from("outreach_autopilot").update({ status: "done", finished_at: now }).eq("id", 1).eq("status", "running").eq("started_at", job.started_at ?? "");
  return { ran: true, row: (await readAutopilot(supabase)).row };
}
