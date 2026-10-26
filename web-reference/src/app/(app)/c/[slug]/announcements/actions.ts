"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { parseImagePaths, richTextIsEmpty, sanitizeRichText } from "@/lib/rich-text";
import type { ActionState } from "@/lib/action-state";

const schema = z.object({
  title: z.string().trim().min(2, "Use at least 2 characters").max(140),
  body: z.string().max(20000),
  audience: z.enum(["all", "officers"]).catch("all"),
  pinned: z.boolean(),
  requires_ack: z.boolean(),
  comments_enabled: z.boolean(),
});

export async function publishAnnouncement(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user, can } = await requireChapter(slug, "announcements.publish");
  if (!rateLimit(`announce:${user.id}`, 10, 60 * 60_000)) return { error: "You have published a lot recently. Try again later." };
  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    audience: formData.get("audience"),
    pinned: formData.get("pinned") === "on",
    requires_ack: formData.get("requires_ack") === "on",
    comments_enabled: formData.get("comments_enabled") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const body = sanitizeRichText(parsed.data.body);
  if (richTextIsEmpty(body)) return { fieldErrors: { body: "Write the announcement" } };
  if (body.length > 20000) return { fieldErrors: { body: "Shorten the announcement" } };
  if (parsed.data.audience === "officers" && !can("announcements.officers")) return { error: "You cannot post officer-only announcements." };
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    chapter_id: chapter.id,
    author_id: user.id,
    title: parsed.data.title,
    body,
    audience: parsed.data.audience,
    pinned: parsed.data.pinned,
    requires_ack: parsed.data.requires_ack,
    comments_enabled: parsed.data.comments_enabled,
    image_paths: parseImagePaths(String(formData.get("image_paths") ?? "[]"), chapter.id),
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/announcements`);
  return { ok: true, message: "Announcement published. Members have been notified." };
}

async function update(slug: string, id: string, patch: Record<string, unknown>) {
  const { chapter } = await requireChapter(slug, "announcements.publish");
  const supabase = await createClient();
  await supabase.from("announcements").update(patch).eq("id", id).eq("chapter_id", chapter.id);
  revalidatePath(`/c/${slug}/announcements`);
}

export async function setPinned(slug: string, id: string, pinned: boolean): Promise<void> {
  await update(slug, id, { pinned });
}

export async function archiveAnnouncement(slug: string, id: string): Promise<void> {
  await update(slug, id, { archived_at: new Date().toISOString(), pinned: false });
}

export async function acknowledge(slug: string, id: string): Promise<void> {
  const { user } = await requireChapter(slug);
  const supabase = await createClient();
  await supabase.from("announcement_acks").upsert({ announcement_id: id, user_id: user.id }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
  revalidatePath(`/c/${slug}/announcements`);
}

const commentSchema = z.object({ body: z.string().trim().min(1, "Write a comment").max(2000, "Keep comments under 2000 characters") });

export async function addComment(slug: string, announcementId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug);
  if (!rateLimit(`comment:${user.id}`, 40, 60 * 60_000)) return { error: "Too many comments. Try again later." };
  const parsed = commentSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { fieldErrors: { body: parsed.error.issues[0]?.message ?? "Write a comment" } };
  const supabase = await createClient();
  const { error } = await supabase.from("announcement_comments").insert({
    announcement_id: announcementId,
    chapter_id: chapter.id,
    author_id: user.id,
    body: parsed.data.body,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/announcements`);
  return { ok: true };
}

export async function deleteComment(slug: string, commentId: string): Promise<void> {
  const { chapter } = await requireChapter(slug);
  const supabase = await createClient();
  await supabase.from("announcement_comments").delete().eq("id", commentId).eq("chapter_id", chapter.id);
  revalidatePath(`/c/${slug}/announcements`);
}

export async function setAnnouncementComments(slug: string, id: string, enabled: boolean): Promise<void> {
  const { chapter, user } = await requireChapter(slug);
  const supabase = await createClient();
  await supabase.from("announcements").update({ comments_enabled: enabled }).eq("id", id).eq("chapter_id", chapter.id).eq("author_id", user.id);
  revalidatePath(`/c/${slug}/announcements`);
}
