"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { BADGE_ICONS } from "@/components/badge-icon";
import type { ActionState } from "@/lib/action-state";

export async function startDirectMessage(slug: string, otherUserId: string): Promise<void> {
  const { chapter } = await requireChapter(slug);
  if (!z.uuid().safeParse(otherUserId).success) redirect(`/c/${slug}/directory`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_direct_conversation", { p_chapter: chapter.id, p_other: otherUserId });
  if (error) redirect(`/c/${slug}/members/${otherUserId}?error=${encodeURIComponent(dbErrorMessage(error))}`);
  redirect(`/c/${slug}/chat/${data as string}`);
}

const badgeSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(60),
  description: z.string().trim().max(300).optional(),
  icon: z.string().refine((v) => v in BADGE_ICONS).catch("award"),
  category: z.enum(["achievement", "service", "academic", "leadership"]).catch("achievement"),
});

export async function awardBadge(slug: string, membershipId: string, userId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "members.manage");
  const supabase = await createClient();
  let badgeId = String(formData.get("badge_id") ?? "");
  if (badgeId === "new") {
    const parsed = badgeSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? undefined,
      icon: formData.get("icon"),
      category: formData.get("category"),
    });
    if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0]?.message ?? "Check the badge details" } };
    const { data, error } = await supabase
      .from("achievement_badges")
      .insert({ chapter_id: chapter.id, name: parsed.data.name, description: parsed.data.description || null, icon: parsed.data.icon, category: parsed.data.category, created_by: user.id })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? "A badge with that name already exists." : dbErrorMessage(error) };
    badgeId = data.id as string;
  }
  if (!z.uuid().safeParse(badgeId).success) return { error: "Choose a badge." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const { error } = await supabase.from("member_achievements").insert({ chapter_id: chapter.id, membership_id: membershipId, badge_id: badgeId, note: note || null, awarded_by: user.id });
  if (error) return { error: error.code === "23505" ? "This member already has that badge." : dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/members/${userId}`);
  return { ok: true, message: "Badge awarded." };
}

export async function revokeBadge(slug: string, achievementId: string, userId: string): Promise<void> {
  const { chapter } = await requireChapter(slug, "members.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("member_achievements").update({ revoked_at: new Date().toISOString() }).eq("id", achievementId).eq("chapter_id", chapter.id).is("revoked_at", null);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/c/${slug}/members/${userId}`);
}
