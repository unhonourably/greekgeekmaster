"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { formField, optionalText, requireModule } from "@/lib/modules";
import type { ActionState } from "@/lib/action-state";
import { setupLockState } from "@/lib/setup-access";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const groupSchema = z.object({
  name: z.string().min(2, "Name the group").max(100),
  course_code: z.string().max(24).nullable(),
  meeting_info: z.string().max(200).nullable(),
  description: z.string().max(1000).nullable(),
});

export async function createStudyGroup(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "academics");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  if (!rateLimit(`studygroup:${user.id}`, 10, 60 * 60_000)) return { error: "Too many groups created. Try again later." };
  const parsed = groupSchema.safeParse({
    name: formField(formData, "name"),
    course_code: optionalText(formData, "course_code")?.toUpperCase() ?? null,
    meeting_info: optionalText(formData, "meeting_info"),
    description: optionalText(formData, "description"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_groups").insert({ chapter_id: chapter.id, created_by: user.id, ...parsed.data }).select("id").single();
  if (error || !data) return { error: dbErrorMessage(error) };
  await supabase.from("study_group_members").insert({ group_id: data.id, chapter_id: chapter.id, user_id: user.id });
  revalidatePath(`/c/${slug}/academics`);
  return { ok: true, message: "Study group created." };
}

export async function toggleStudyGroup(slug: string, groupId: string, join: boolean): Promise<void> {
  const { chapter, user } = await requireModule(slug, "academics");
  const supabase = await createClient();
  if (join) {
    await supabase.from("study_group_members").upsert({ group_id: groupId, chapter_id: chapter.id, user_id: user.id }, { onConflict: "group_id,user_id", ignoreDuplicates: true });
  } else {
    await supabase.from("study_group_members").delete().eq("group_id", groupId).eq("user_id", user.id);
  }
  revalidatePath(`/c/${slug}/academics`);
}

const goalSchema = z.object({
  title: z.string().min(2, "Describe the goal").max(160),
  target_date: z.string().regex(DATE).nullable(),
  share_with_scholarship: z.boolean(),
});

export async function addGoal(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "academics");
  const parsed = goalSchema.safeParse({ title: formField(formData, "title"), target_date: optionalText(formData, "target_date"), share_with_scholarship: formData.get("share_with_scholarship") === "on" });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("academic_goals").insert({ chapter_id: chapter.id, user_id: user.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/academics`);
  return { ok: true, message: "Goal added." };
}

export async function updateGoal(slug: string, goalId: string, patch: { status?: "active" | "achieved" | "dropped"; share_with_scholarship?: boolean }): Promise<void> {
  const { chapter, user } = await requireModule(slug, "academics");
  const clean: Record<string, unknown> = {};
  if (patch.status && ["active", "achieved", "dropped"].includes(patch.status)) clean.status = patch.status;
  if (typeof patch.share_with_scholarship === "boolean") clean.share_with_scholarship = patch.share_with_scholarship;
  if (!Object.keys(clean).length) return;
  const supabase = await createClient();
  await supabase.from("academic_goals").update(clean).eq("id", goalId).eq("chapter_id", chapter.id).eq("user_id", user.id);
  revalidatePath(`/c/${slug}/academics`);
}

export async function deleteGoal(slug: string, goalId: string): Promise<void> {
  const { chapter, user } = await requireModule(slug, "academics");
  const supabase = await createClient();
  await supabase.from("academic_goals").delete().eq("id", goalId).eq("chapter_id", chapter.id).eq("user_id", user.id);
  revalidatePath(`/c/${slug}/academics`);
}

const pairSchema = z
  .object({ mentor_membership_id: z.string().uuid("Pick a mentor"), mentee_membership_id: z.string().uuid("Pick a mentee") })
  .refine((v) => v.mentor_membership_id !== v.mentee_membership_id, { path: ["mentee_membership_id"], message: "Pick two different members" });

export async function createMentorship(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user, can } = await requireModule(slug, "academics");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  if (!can("academics.manage")) return { error: "You do not have permission to do that." };
  const parsed = pairSchema.safeParse({ mentor_membership_id: formField(formData, "mentor_membership_id"), mentee_membership_id: formField(formData, "mentee_membership_id") });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase
    .from("mentorship_pairs")
    .select("id", { count: "exact", head: true })
    .eq("chapter_id", chapter.id)
    .eq("status", "active")
    .eq("mentee_membership_id", parsed.data.mentee_membership_id);
  if (count) return { error: "This member already has a mentor." };
  const { error } = await supabase.from("mentorship_pairs").insert({ chapter_id: chapter.id, created_by: user.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/academics`);
  return { ok: true, message: "Mentorship pair created." };
}

export async function endMentorship(slug: string, pairId: string): Promise<void> {
  const { chapter, can } = await requireModule(slug, "academics");
  if (!can("academics.manage")) return;
  const supabase = await createClient();
  await supabase.from("mentorship_pairs").update({ status: "ended" }).eq("id", pairId).eq("chapter_id", chapter.id);
  revalidatePath(`/c/${slug}/academics`);
}
