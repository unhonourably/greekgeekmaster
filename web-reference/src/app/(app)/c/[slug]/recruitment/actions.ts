"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { z } from "zod";
import { getMyProfile, requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { createAndSendInvitation } from "@/lib/invitations";
import { membershipsWithPermission } from "@/lib/roles";
import { zonedTimeToUtc } from "@/lib/timezone";
import { ACTIVITY_KINDS, parseInterests } from "@/lib/recruitment";
import type { ActionState } from "@/lib/action-state";
import { setupLockState, setupLocked } from "@/lib/setup-access";

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const prospectSchema = z.object({
  full_name: z.string().trim().min(2, "Enter their full name").max(120),
  preferred_name: optional(60),
  email: z.union([z.literal(""), z.email("Enter a valid email").max(254)]).optional().transform((v) => (v ? v.toLowerCase() : null)),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[0-9+() .-]{7,24}$/, "Enter a valid phone number")]).optional().transform((v) => (v ? v : null)),
  class_year: z.union([z.literal(""), z.coerce.number().int().min(1990, "Enter a valid year").max(2100, "Enter a valid year")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  major: optional(120),
  hometown: optional(120),
  source: optional(80),
  interests: z.string().max(600).optional(),
  follow_up: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

function fieldErrors(error: z.ZodError): ActionState {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return { fieldErrors: out };
}

export async function saveProspect(slug: string, prospectId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user, membership, can } = await requireChapter(slug, "recruitment.view");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = prospectSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { interests, follow_up, ...d } = parsed.data;
  const followUp = follow_up ? zonedTimeToUtc(follow_up, "09:00", chapter.timezone)?.toISOString() ?? null : null;
  const supabase = await createClient();
  const row: Record<string, unknown> = { ...d, interests: parseInterests(interests ?? ""), next_follow_up_at: followUp };
  if (can("recruitment.manage") && formData.has("owner")) {
    const owner = String(formData.get("owner") ?? "");
    if (owner) {
      const eligible = await membershipsWithPermission(chapter.id, "recruitment.view");
      if (!eligible.has(owner)) return { fieldErrors: { owner: "This member cannot see recruitment" } };
    }
    row.owner_membership_id = owner || null;
  }
  if (prospectId) {
    const { data, error } = await supabase.from("prospects").update(row).eq("id", prospectId).eq("chapter_id", chapter.id).select("id");
    if (error) return { error: dbErrorMessage(error) };
    if (!data?.length) return { error: "Only the assigned recruiter or the recruitment chair can edit this prospect." };
    revalidatePath(`/c/${slug}/recruitment`, "layout");
    return { ok: true, message: "Saved." };
  }
  const { data: stage } = await supabase.from("recruitment_stages").select("id").eq("chapter_id", chapter.id).eq("outcome", "open").order("position").limit(1).maybeSingle();
  if (!stage) return { error: "The pipeline has not been set up yet." };
  const { data, error } = await supabase
    .from("prospects")
    .insert({ ...row, chapter_id: chapter.id, stage_id: stage.id, created_by: user.id, owner_membership_id: row.owner_membership_id ?? membership.id })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "A prospect with this email is already in the pipeline." : dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/recruitment`, "layout");
  redirect(`/c/${slug}/recruitment/${data.id}`);
}

export async function moveProspect(slug: string, prospectId: string, formData: FormData): Promise<void> {
  const { chapter } = await requireChapter(slug, "recruitment.view");
  if (await setupLocked(chapter.id)) return;
  const stage = String(formData.get("stage") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.from("prospects").update({ stage_id: stage }).eq("id", prospectId).eq("chapter_id", chapter.id).select("id");
  if (error || !data?.length) redirect(`/c/${slug}/recruitment/${prospectId}?error=${encodeURIComponent(error ? dbErrorMessage(error) : "Only the assigned recruiter or the recruitment chair can move this prospect.")}`);
  revalidatePath(`/c/${slug}/recruitment`, "layout");
}

export async function setProspectStatus(slug: string, prospectId: string, status: "active" | "archived"): Promise<void> {
  const { chapter } = await requireChapter(slug, "recruitment.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("prospects").update({ status }).eq("id", prospectId).eq("chapter_id", chapter.id);
  if (error) redirect(`/c/${slug}/recruitment/${prospectId}?error=${encodeURIComponent(error.code === "23505" ? "Another active prospect already uses this email." : dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}/recruitment`, "layout");
}

export async function addNote(slug: string, prospectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "recruitment.view");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { fieldErrors: { body: "Write a note" } };
  if (body.length > 4000) return { fieldErrors: { body: "Keep notes under 4,000 characters" } };
  const supabase = await createClient();
  const { error } = await supabase.from("prospect_notes").insert({ chapter_id: chapter.id, prospect_id: prospectId, author_id: user.id, body, restricted: formData.get("restricted") === "on" });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/recruitment/${prospectId}`);
  return { ok: true, message: "Note added." };
}

export async function logActivity(slug: string, prospectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "recruitment.view");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const kind = z.enum(ACTIVITY_KINDS).safeParse(formData.get("kind"));
  if (!kind.success) return { fieldErrors: { kind: "Pick a type" } };
  const date = String(formData.get("date") ?? "");
  const occurred = date ? zonedTimeToUtc(date, "12:00", chapter.timezone) : new Date();
  if (!occurred) return { fieldErrors: { date: "Enter a valid date" } };
  if (occurred.getTime() > Date.now() + 24 * 60 * 60_000) return { fieldErrors: { date: "Activity cannot be in the future" } };
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const eventId = String(formData.get("event_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("recruitment_activities")
    .insert({ chapter_id: chapter.id, prospect_id: prospectId, kind: kind.data, event_id: kind.data === "event" ? eventId : null, occurred_at: occurred.toISOString(), notes, logged_by: user.id });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/recruitment/${prospectId}`);
  return { ok: true, message: "Activity logged." };
}

export async function inviteProspect(slug: string, prospectId: string): Promise<void> {
  const { chapter, can } = await requireChapter(slug);
  if (!can("members.manage") && !can("recruitment.manage")) forbidden();
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { data: p } = await supabase.from("prospects").select("full_name, email").eq("id", prospectId).eq("chapter_id", chapter.id).maybeSingle();
  const back = `/c/${slug}/recruitment/${prospectId}`;
  if (!p?.email) redirect(`${back}?error=${encodeURIComponent("Add an email address before inviting.")}`);
  const profile = await getMyProfile();
  const result = await createAndSendInvitation(supabase, chapter, profile?.display_name ?? "A chapter officer", { email: p.email, fullName: p.full_name, memberClass: "new_member", roleKeys: [] });
  if (!result.ok) redirect(`${back}?error=${encodeURIComponent(dbErrorMessage(result.error))}`);
  redirect(`${back}?invited=1${result.devLink ? `&dev=${encodeURIComponent(result.devLink)}` : ""}`);
}

export async function setupPipeline(slug: string): Promise<void> {
  const { chapter } = await requireChapter(slug, "recruitment.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  await supabase.rpc("ensure_recruitment_stages", { p_chapter: chapter.id });
  revalidatePath(`/c/${slug}/recruitment`, "layout");
}

const stageSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(40),
  outcome: z.enum(["open", "offered", "joined", "closed"]).catch("open"),
  position: z.coerce.number().int().min(1).max(99),
});

export async function saveStage(slug: string, stageId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug, "recruitment.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = stageSchema.safeParse({ name: formData.get("name"), outcome: formData.get("outcome"), position: formData.get("position") });
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = stageId
    ? await supabase.from("recruitment_stages").update(parsed.data).eq("id", stageId).eq("chapter_id", chapter.id)
    : await supabase.from("recruitment_stages").insert({ ...parsed.data, chapter_id: chapter.id });
  if (error) return { error: error.code === "23505" ? "A stage with this name already exists." : dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/recruitment`, "layout");
  return { ok: true, message: stageId ? "Saved." : "Stage added." };
}

export async function deleteStage(slug: string, stageId: string): Promise<void> {
  const { chapter } = await requireChapter(slug, "recruitment.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("recruitment_stages").delete().eq("id", stageId).eq("chapter_id", chapter.id);
  if (error) redirect(`/c/${slug}/recruitment/stages?error=${encodeURIComponent(error.code === "23503" ? "Stages that have ever held a prospect cannot be deleted. Rename it instead." : dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}/recruitment`, "layout");
}
