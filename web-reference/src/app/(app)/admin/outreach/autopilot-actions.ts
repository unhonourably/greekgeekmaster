"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { serverEnv } from "@/lib/env";
import type { ActionState } from "@/lib/action-state";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readAutopilot, totalSchools } from "./autopilot";

async function kick() {
  let secret: string;
  try {
    secret = serverEnv.cronSecret();
  } catch {
    return;
  }
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  if (!host) return;
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  after(async () => {
    await fetch(`${proto}://${host}/api/outreach/autopilot`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5_000) }).catch(() => null);
  });
}

export async function startAutopilot(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff(["admin"]);
  if (formData.get("confirm") !== "on") return { error: "Check the box to confirm emails will send on their own." };
  const supabase = await createClient();
  const { row, missing } = await readAutopilot(supabase);
  if (missing || !row) return { error: "The autopilot migration is not on this database yet. Run npx supabase db push." };
  if (row.status === "running") return { error: "Autopilot is already running." };
  const now = new Date().toISOString();
  const { error } = await supabase.from("outreach_autopilot").update({
    status: "running",
    started_by: user.id,
    started_at: now,
    finished_at: null,
    include_form: formData.get("include_form") === "on",
    skip_recent: formData.get("skip_recent") === "on",
    state_index: 0,
    school_offset: 0,
    current_state: null,
    schools_total: await totalSchools(supabase),
    schools_read: 0,
    schools_skipped: 0,
    schools_failed: 0,
    contacts_added: 0,
    emails_sent: 0,
    emails_failed: 0,
    send_runs: 0,
    lease_until: null,
    send_paused_until: null,
    last_message: "Starting.",
    updated_at: now,
  }).eq("id", 1);
  if (error) return { error: "Autopilot could not start." };
  await kick();
  revalidatePath("/admin/outreach");
  return { ok: true, message: "Autopilot started." };
}

async function setStatus(from: string[], to: "running" | "paused" | "idle", extra: Record<string, unknown> = {}) {
  await requireStaff(["admin"]);
  const supabase = await createClient();
  await supabase.from("outreach_autopilot").update({ status: to, updated_at: new Date().toISOString(), ...extra }).eq("id", 1).in("status", from);
  revalidatePath("/admin/outreach");
}

export async function pauseAutopilot(): Promise<void> {
  await setStatus(["running"], "paused", { last_message: "Paused. Nothing new will be read or sent until you resume." });
}

export async function resumeAutopilot(): Promise<void> {
  await setStatus(["paused"], "running", { last_message: "Resumed." });
  await kick();
}

export async function stopAutopilot(): Promise<void> {
  await setStatus(["running", "paused", "done"], "idle", { last_message: "Stopped.", lease_until: null, finished_at: new Date().toISOString() });
}
