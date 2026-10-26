"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireStaff } from "@/lib/auth";
import { BUG_AREAS, BUG_SEVERITIES, BUG_STATUSES } from "@/lib/bugs";
import { sendEmail } from "@/lib/email";
import { renderEmailHtml } from "@/lib/email-template";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const ADMIN = "admin@greekgeek.org";

function refresh(id: string) {
  revalidatePath("/admin/bugs");
  revalidatePath(`/admin/bugs/${id}`);
  revalidatePath("/admin", "layout");
}

function pick<T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]): T | null {
  const text = String(value ?? "");
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

function failure(message: string | undefined, fallback: string): ActionState {
  if (/assignee must be/i.test(message ?? "")) return { error: "Only admin or support staff can be assigned." };
  if (/bug_reports|schema cache|does not exist/i.test(message ?? "")) return { error: "The bug reports migration is not on this database yet. Run npx supabase db push." };
  return { error: fallback };
}

export async function updateTriage(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff(["support"]);
  const status = pick(formData.get("status"), BUG_STATUSES);
  if (!status) return { error: "Pick a status." };
  const severity = pick(formData.get("severity"), BUG_SEVERITIES);
  const area = pick(formData.get("area"), BUG_AREAS);
  const assignee = String(formData.get("assignee_id") ?? "");
  const supabase = await createClient();
  const { data: current } = await supabase.from("bug_reports").select("status, fix_summary").eq("id", id).maybeSingle();
  if (!current) return { error: "This report no longer exists." };
  if (status === "fixed" && current.status !== "fixed") return { error: "Use Log a fix to mark it fixed, so the fix is recorded." };
  let duplicateOf: string | null = null;
  if (status === "duplicate") {
    const number = Number(String(formData.get("duplicate_of") ?? "").replace(/^#/, ""));
    if (!Number.isInteger(number) || number <= 0) return { error: "Enter the number of the report this duplicates.", fieldErrors: { duplicate_of: "Enter a report number, like 12." } };
    const { data: target } = await supabase.from("bug_reports").select("id").eq("number", number).maybeSingle();
    if (!target) return { error: `There is no bug #${number}.`, fieldErrors: { duplicate_of: "No report has that number." } };
    if (target.id === id) return { error: "A report cannot duplicate itself.", fieldErrors: { duplicate_of: "Pick a different report." } };
    duplicateOf = target.id as string;
  }
  const { error } = await supabase
    .from("bug_reports")
    .update({ status, severity, area, assignee_id: /^[0-9a-f-]{36}$/i.test(assignee) ? assignee : null, duplicate_of: duplicateOf })
    .eq("id", id);
  if (error) return failure(error.message, "The changes could not be saved.");
  refresh(id);
  return { ok: true, message: "Saved." };
}

export async function logFix(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff(["support"]);
  const summary = String(formData.get("fix_summary") ?? "").trim();
  const ref = String(formData.get("fix_ref") ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (summary.length < 5) fieldErrors.fix_summary = "Say what changed.";
  if (summary.length > 4000) fieldErrors.fix_summary = "Keep it under 4,000 characters.";
  if (ref && !/^https?:\/\/\S+$/i.test(ref) && !/^[0-9a-f]{7,40}$/i.test(ref)) fieldErrors.fix_ref = "Paste a link or a commit hash.";
  if (ref.length > 300) fieldErrors.fix_ref = "Keep it under 300 characters.";
  if (Object.keys(fieldErrors).length > 0) return { error: "Check the highlighted fields.", fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.from("bug_reports").update({ status: "fixed", fix_summary: summary, fix_ref: ref || null, duplicate_of: null }).eq("id", id).select("id");
  if (error) return failure(error.message, "The fix could not be logged.");
  if (!data || data.length === 0) return { error: "This report no longer exists." };
  refresh(id);
  return { ok: true, message: "Fix logged. The report is closed as fixed." };
}

export async function reopenBug(id: string): Promise<void> {
  await requireStaff(["support"]);
  const supabase = await createClient();
  await supabase.from("bug_reports").update({ status: "triaged" }).eq("id", id);
  refresh(id);
}

export async function addComment(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff(["support"]);
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write a note first.", fieldErrors: { body: "Write a note first." } };
  if (body.length > 4000) return { error: "Keep notes under 4,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("bug_report_events").insert({ report_id: id, actor_id: user.id, kind: "comment", body });
  if (error) return failure(error.message, "The note could not be saved.");
  refresh(id);
  return { ok: true, message: "Note added." };
}

export async function emailReporter(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff(["support"]);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 2 || subject.length > 200) return { error: "Add a subject line.", fieldErrors: { subject: "Add a subject line." } };
  if (body.length < 10 || body.length > 4000) return { error: "Write the message.", fieldErrors: { body: "Write at least a sentence." } };
  if (!serverEnv.resendApiKey()) return { error: "Sending is off because RESEND_API_KEY is not set on the server." };
  const supabase = await createClient();
  const { data: report } = await supabase.from("bug_reports").select("id, number, reporter_email").eq("id", id).maybeSingle();
  if (!report) return { error: "This report no longer exists." };
  if (!report.reporter_email) return { error: "This report has no email address to reply to." };
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  try {
    const result = await sendEmail({
      to: report.reporter_email,
      replyTo: ADMIN,
      subject,
      text: body,
      html: renderEmailHtml({ appUrl: serverEnv.appUrl(), preheader: paragraphs[0] ?? subject, heading: subject, paragraphs, note: `Reply to this email to reach ${ADMIN}.` }),
      idempotencyKey: `bug-reply-${id}-${Date.now()}`,
    });
    if (!result.delivered) return { error: "Email delivery is not configured." };
  } catch (sendError) {
    return { error: `Not sent: ${sendError instanceof Error ? sendError.message : "Send failed"}` };
  }
  await supabase.from("bug_report_events").insert({ report_id: id, actor_id: user.id, kind: "reporter_emailed", body: `${subject}\n\n${body}`.slice(0, 4000) });
  refresh(id);
  return { ok: true, message: `Sent to ${report.reporter_email}.` };
}

export async function deleteBug(id: string): Promise<void> {
  await requireStaff([]);
  const supabase = await createClient();
  await supabase.from("bug_reports").delete().eq("id", id);
  revalidatePath("/admin/bugs");
  revalidatePath("/admin", "layout");
  redirect("/admin/bugs");
}
