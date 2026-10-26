"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { parseDollarsToCents } from "@/lib/money";
import { formField, optionalText, requireModule, todayIn } from "@/lib/modules";
import { zonedTimeToUtc } from "@/lib/timezone";
import type { ActionState } from "@/lib/action-state";
import { setupLockState, setupLocked } from "@/lib/setup-access";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const hoursSchema = z.object({
  organization: z.string().min(2, "Name the organization you served").max(120),
  description: z.string().max(1000).nullable(),
  hours: z.coerce.number({ message: "Enter the hours" }).min(0.25, "Log at least 15 minutes").max(24, "Log at most 24 hours per entry"),
  served_on: z.string().regex(DATE, "Pick a date"),
});

export async function logServiceHours(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "philanthropy");
  if (!rateLimit(`hours:${user.id}`, 30, 60 * 60_000)) return { error: "Too many submissions. Try again later." };
  const parsed = hoursSchema.safeParse({
    organization: formField(formData, "organization"),
    description: optionalText(formData, "description"),
    hours: formField(formData, "hours") || undefined,
    served_on: formField(formData, "served_on"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const today = todayIn(chapter.timezone, Date.now());
  if (parsed.data.served_on > today) return { fieldErrors: { served_on: "Service hours can only be logged after they happen" } };
  const supabase = await createClient();
  const { error } = await supabase.from("service_hours").insert({
    chapter_id: chapter.id,
    user_id: user.id,
    organization: parsed.data.organization,
    description: parsed.data.description,
    hours: Math.round(parsed.data.hours * 4) / 4,
    served_on: parsed.data.served_on,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/philanthropy`);
  return { ok: true, message: "Hours submitted for review." };
}

export async function reviewServiceHours(slug: string, id: string, decision: "approved" | "rejected"): Promise<void> {
  const { chapter, user } = await requireModule(slug, "philanthropy", "philanthropy.manage");
  const supabase = await createClient();
  await supabase
    .from("service_hours")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("chapter_id", chapter.id)
    .eq("status", "submitted")
    .neq("user_id", user.id);
  revalidatePath(`/c/${slug}/philanthropy`);
}

const campaignSchema = z
  .object({
    name: z.string().min(2, "Name the campaign").max(120),
    beneficiary: z.string().min(2, "Who does this campaign support?").max(160),
    description: z.string().max(2000).nullable(),
    starts_on: z.string().regex(DATE).nullable(),
    ends_on: z.string().regex(DATE).nullable(),
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { path: ["ends_on"], message: "End date must be after the start" });

export async function saveCampaign(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "philanthropy", "philanthropy.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = campaignSchema.safeParse({
    name: formField(formData, "name"),
    beneficiary: formField(formData, "beneficiary"),
    description: optionalText(formData, "description"),
    starts_on: optionalText(formData, "starts_on"),
    ends_on: optionalText(formData, "ends_on"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const goalInput = formField(formData, "goal");
  const goal = goalInput ? parseDollarsToCents(goalInput) : null;
  if (goalInput && (goal === null || goal <= 0)) return { fieldErrors: { goal: "Enter a dollar amount, or leave it blank" } };
  const supabase = await createClient();
  const { error } = await supabase.from("fundraising_campaigns").insert({ chapter_id: chapter.id, created_by: user.id, goal_cents: goal, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/philanthropy`);
  return { ok: true, message: "Campaign created." };
}

export async function setCampaignStatus(slug: string, id: string, status: "active" | "closed"): Promise<void> {
  const { chapter } = await requireModule(slug, "philanthropy", "philanthropy.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  await supabase.from("fundraising_campaigns").update({ status }).eq("id", id).eq("chapter_id", chapter.id);
  revalidatePath(`/c/${slug}/philanthropy`);
}

const donationSchema = z.object({
  campaign_id: z.string().uuid("Pick a campaign"),
  donor_name: z.string().max(120).nullable(),
  method: z.enum(["cash", "check", "external_platform", "other"], { message: "Pick how it was received" }),
  reference: z.string().max(120).nullable(),
  received_on: z.string().regex(DATE, "Pick a date"),
  note: z.string().max(500).nullable(),
});

export async function recordDonation(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "philanthropy", "philanthropy.manage");
  const parsed = donationSchema.safeParse({
    campaign_id: formField(formData, "campaign_id"),
    donor_name: optionalText(formData, "donor_name"),
    method: formField(formData, "method"),
    reference: optionalText(formData, "reference"),
    received_on: formField(formData, "received_on"),
    note: optionalText(formData, "note"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const amount = parseDollarsToCents(formField(formData, "amount"));
  if (amount === null || amount <= 0) return { fieldErrors: { amount: "Enter the amount received" } };
  if (parsed.data.received_on > todayIn(chapter.timezone, Date.now())) return { fieldErrors: { received_on: "Date cannot be in the future" } };
  const supabase = await createClient();
  const { data: campaign } = await supabase.from("fundraising_campaigns").select("id, status").eq("id", parsed.data.campaign_id).eq("chapter_id", chapter.id).maybeSingle();
  if (!campaign) return { fieldErrors: { campaign_id: "Pick a campaign" } };
  const { error } = await supabase.from("donations").insert({ chapter_id: chapter.id, recorded_by: user.id, amount_cents: amount, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/philanthropy`);
  return { ok: true, message: "Donation recorded." };
}

const shiftSchema = z.object({
  event_id: z.string().uuid("Pick an event"),
  name: z.string().min(2, "Name the shift").max(80),
  date: z.string().regex(DATE, "Pick a date"),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Pick an end time"),
  slots: z.coerce.number({ message: "Enter the number of volunteers" }).int().min(1).max(500),
});

export async function addVolunteerShift(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "philanthropy", "philanthropy.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = shiftSchema.safeParse({
    event_id: formField(formData, "event_id"),
    name: formField(formData, "name"),
    date: formField(formData, "date"),
    start: formField(formData, "start"),
    end: formField(formData, "end"),
    slots: formField(formData, "slots") || undefined,
  });
  if (!parsed.success) return zodState(parsed.error);
  const starts = zonedTimeToUtc(parsed.data.date, parsed.data.start, chapter.timezone);
  const ends = zonedTimeToUtc(parsed.data.date, parsed.data.end, chapter.timezone);
  if (!starts || !ends) return { error: "Check the date and times." };
  if (ends <= starts) return { fieldErrors: { end: "End time must be after the start" } };
  if (starts.getTime() < Date.now()) return { fieldErrors: { date: "Shifts must start in the future" } };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id").eq("id", parsed.data.event_id).eq("chapter_id", chapter.id).is("cancelled_at", null).maybeSingle();
  if (!event) return { fieldErrors: { event_id: "Pick an upcoming event" } };
  const { error } = await supabase.from("volunteer_shifts").insert({
    chapter_id: chapter.id,
    event_id: event.id,
    name: parsed.data.name,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    slots: parsed.data.slots,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/philanthropy`);
  return { ok: true, message: "Shift added." };
}

export async function toggleShift(slug: string, shiftId: string, join: boolean): Promise<void> {
  const { user } = await requireModule(slug, "philanthropy");
  if (!rateLimit(`shift:${user.id}`, 40, 60 * 60_000)) return;
  const supabase = await createClient();
  await supabase.rpc("signup_volunteer_shift", { p_shift: shiftId, p_join: join });
  revalidatePath(`/c/${slug}/philanthropy`);
}

export async function deleteShift(slug: string, shiftId: string): Promise<void> {
  const { chapter } = await requireModule(slug, "philanthropy", "philanthropy.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { count } = await supabase.from("volunteer_signups").select("user_id", { count: "exact", head: true }).eq("shift_id", shiftId);
  if (count) return;
  await supabase.from("volunteer_shifts").delete().eq("id", shiftId).eq("chapter_id", chapter.id);
  revalidatePath(`/c/${slug}/philanthropy`);
}
