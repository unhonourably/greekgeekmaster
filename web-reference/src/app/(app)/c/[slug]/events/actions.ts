"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminRpc } from "@/lib/supabase/admin";
import { dbErrorMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { formatTime } from "@/lib/format";
import { zonedTimeToUtc } from "@/lib/timezone";
import { checkInToken, verifyCheckInToken, CHECKIN_WINDOW_MS } from "@/lib/checkin";
import { EVENT_CATEGORIES, type RsvpStatus } from "@/lib/events";
import { parseImagePaths, richTextIsEmpty, sanitizeRichText } from "@/lib/rich-text";
import { MEMBER_CLASS_LABEL } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-state";
import { setupLockState, setupLocked } from "@/lib/setup-access";

const schema = z.object({
  title: z.string().trim().min(2, "Use at least 2 characters").max(140),
  description: z.string().max(20000).optional(),
  location: z.string().trim().max(200).optional(),
  category: z.enum(EVENT_CATEGORIES).catch("chapter"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Pick an end time"),
  visibility: z.enum(["chapter", "officers"]).catch("chapter"),
  attendance_required: z.boolean(),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(1, "At least 1").max(10000)]).optional(),
  rsvp_deadline_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  rsvp_deadline_time: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
});

export async function saveEvent(slug: string, eventId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "events.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    location: formData.get("location") ?? undefined,
    category: formData.get("category"),
    date: formData.get("date"),
    start: formData.get("start"),
    end: formData.get("end"),
    visibility: formData.get("visibility"),
    attendance_required: formData.get("attendance_required") === "on",
    capacity: formData.get("capacity") ?? "",
    rsvp_deadline_date: formData.get("rsvp_deadline_date") ?? "",
    rsvp_deadline_time: formData.get("rsvp_deadline_time") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  const tz = chapter.timezone;
  const startsAt = zonedTimeToUtc(d.date, d.start, tz);
  let endsAt = zonedTimeToUtc(d.date, d.end, tz);
  if (!startsAt || !endsAt) return { fieldErrors: { date: "Enter a valid date and time" } };
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60_000);
  if (endsAt.getTime() - startsAt.getTime() > 3 * 24 * 60 * 60_000) return { fieldErrors: { end: "Events can last at most three days" } };
  let rsvpDeadline: string | null = null;
  if (d.rsvp_deadline_date) {
    const at = zonedTimeToUtc(d.rsvp_deadline_date, d.rsvp_deadline_time || "23:59", tz);
    if (!at) return { fieldErrors: { rsvp_deadline_date: "Enter a valid deadline" } };
    if (at > startsAt) return { fieldErrors: { rsvp_deadline_date: "The deadline must be before the event starts" } };
    rsvpDeadline = at.toISOString();
  }
  const classes = formData.getAll("required_classes").map(String).filter((c) => c in MEMBER_CLASS_LABEL);
  const description = sanitizeRichText(d.description ?? "");
  if (description.length > 20000) return { fieldErrors: { description: "Shorten the details" } };
  const row = {
    title: d.title,
    description: richTextIsEmpty(description) ? null : description,
    image_paths: parseImagePaths(String(formData.get("image_paths") ?? "[]"), chapter.id),
    location: d.location || null,
    category: d.category,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    timezone: tz,
    visibility: d.visibility,
    attendance_required: d.attendance_required,
    required_classes: d.attendance_required ? classes : [],
    capacity: d.capacity === "" || d.capacity === undefined ? null : d.capacity,
    rsvp_deadline: rsvpDeadline,
  };
  const supabase = await createClient();
  if (eventId) {
    const { error } = await supabase.from("events").update(row).eq("id", eventId).eq("chapter_id", chapter.id);
    if (error) return { error: dbErrorMessage(error) };
    revalidatePath(`/c/${slug}/events`, "layout");
    redirect(`/c/${slug}/events/${eventId}`);
  }
  const { data, error } = await supabase.from("events").insert({ ...row, chapter_id: chapter.id, created_by: user.id }).select("id").single();
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/events`, "layout");
  redirect(`/c/${slug}/events/${data.id}`);
}

export async function cancelEvent(slug: string, eventId: string): Promise<void> {
  const { chapter } = await requireChapter(slug, "events.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  await supabase.from("events").update({ cancelled_at: new Date().toISOString() }).eq("id", eventId).eq("chapter_id", chapter.id).is("cancelled_at", null);
  revalidatePath(`/c/${slug}/events`, "layout");
}

export async function rsvp(slug: string, eventId: string, status: RsvpStatus): Promise<void> {
  await requireChapter(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("rsvp_event", { p_event: eventId, p_status: status });
  if (error) redirect(`/c/${slug}/events/${eventId}?error=${encodeURIComponent(dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}/events`, "layout");
}

export async function issueCheckInCode(slug: string, eventId: string): Promise<{ url: string; refreshMs: number } | { error: string }> {
  const { chapter, can } = await requireChapter(slug);
  if (!can("attendance.manage") && !can("events.manage")) return { error: "Not authorized" };
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id").eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!data) return { error: "Event not found" };
  const token = checkInToken(eventId);
  const elapsed = Date.now() % CHECKIN_WINDOW_MS;
  return { url: `${serverEnv.appUrl()}/c/${slug}/events/${eventId}/scan?t=${encodeURIComponent(token)}`, refreshMs: CHECKIN_WINDOW_MS - elapsed + 250 };
}

export async function checkIn(slug: string, eventId: string, token: string): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug);
  if (!rateLimit(`checkin:${user.id}`, 10, 60_000)) return { error: "Too many attempts. Wait a minute and scan again." };
  if (!verifyCheckInToken(token, eventId)) return { error: "This code has expired. Scan the code on screen again." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, starts_at").eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!event) return { error: "Event not found." };
  try {
    const result = await adminRpc()<string>("service_qr_check_in", { p_event: eventId, p_user: user.id });
    revalidatePath(`/c/${slug}/events/${eventId}`, "layout");
    const when = formatTime(new Date(), chapter.timezone, true);
    const start = formatTime(event.starts_at, chapter.timezone, true);
    if (result === "already_checked_in") return { ok: true, message: "You were already checked in." };
    if (result === "late") return { ok: true, message: `Checked in at ${when}. This event starts at ${start}, and arrivals more than 15 minutes after that are marked late.` };
    return { ok: true, message: `Checked in at ${when}.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("closed")) return { error: "Check-in is closed for this event." };
    if (message.includes("not available")) return { error: "This event is no longer available." };
    return { error: "Could not check you in. Ask an officer to record your attendance." };
  }
}

export async function recordAttendance(slug: string, eventId: string, membershipId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "attendance.manage");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance", { p_event: eventId, p_membership: membershipId, p_status: status, p_reason: reason || null });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/events/${eventId}`, "layout");
  return { ok: true, message: "Saved" };
}
