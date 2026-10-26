"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorMessage } from "@/lib/errors";
import { loadMessages, type ChatMessage } from "@/lib/chat";
import type { ActionState } from "@/lib/action-state";

const channelSchema = z.object({
  kind: z.enum(["channel", "committee", "recruitment", "event", "alumni", "group"]),
  name: z.string().trim().max(80),
  topic: z.string().trim().max(300),
  visibility: z.enum(["open", "restricted"]).catch("open"),
  posting_policy: z.enum(["all", "moderators"]).catch("all"),
});

export async function createConversation(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug);
  const parsed = channelSchema.safeParse({
    kind: formData.get("kind"),
    name: String(formData.get("name") ?? ""),
    topic: String(formData.get("topic") ?? ""),
    visibility: formData.get("visibility"),
    posting_policy: formData.get("posting_policy"),
  });
  if (!parsed.success) return { error: "Check the conversation details." };
  const d = parsed.data;
  if (d.kind !== "group" && d.name.length < 2) return { fieldErrors: { name: "Name the channel" } };
  const members = formData.getAll("members").map(String).filter((v) => z.uuid().safeParse(v).success);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_conversation", {
    p_chapter: chapter.id,
    p_kind: d.kind,
    p_name: d.name || null,
    p_topic: d.topic || null,
    p_visibility: d.visibility,
    p_posting_policy: d.posting_policy,
    p_member_ids: members,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/chat/${data as string}`);
}

export async function startConversation(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug);
  const members = [...new Set(formData.getAll("members").map(String))].filter((v) => z.uuid().safeParse(v).success && v !== user.id);
  if (members.length === 0) return { error: "Pick at least one person." };
  if (members.length > 30) return { error: "Group messages can include up to 30 people." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  const { data, error } =
    members.length === 1
      ? await supabase.rpc("start_direct_conversation", { p_chapter: chapter.id, p_other: members[0] })
      : await supabase.rpc("create_conversation", {
          p_chapter: chapter.id,
          p_kind: "group",
          p_name: name || null,
          p_topic: null,
          p_visibility: null,
          p_posting_policy: null,
          p_member_ids: members,
        });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/chat/${data as string}`);
}

export async function joinChannel(slug: string, conversationId: string): Promise<void> {
  await requireChapter(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_open_conversation", { p_conversation: conversationId });
  if (error) redirect(`/c/${slug}/chat/browse?error=${encodeURIComponent(dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/chat/${conversationId}`);
}

export async function leaveConversation(slug: string, conversationId: string): Promise<void> {
  const { user } = await requireChapter(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_conversation_member", { p_conversation: conversationId, p_user: user.id, p_action: "remove" });
  if (error) redirect(`/c/${slug}/chat/${conversationId}/details?error=${encodeURIComponent(dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/chat`);
}

export async function manageMember(slug: string, conversationId: string, userId: string, action: "add" | "remove" | "promote" | "demote"): Promise<void> {
  await requireChapter(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_conversation_member", { p_conversation: conversationId, p_user: userId, p_action: action });
  if (error) redirect(`/c/${slug}/chat/${conversationId}/details?error=${encodeURIComponent(dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}/chat/${conversationId}`, "layout");
}

export async function addMembers(slug: string, conversationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug);
  const ids = formData.getAll("members").map(String).filter((v) => z.uuid().safeParse(v).success).slice(0, 100);
  if (ids.length === 0) return { error: "Choose at least one member." };
  const supabase = await createClient();
  for (const id of ids) {
    const { error } = await supabase.rpc("manage_conversation_member", { p_conversation: conversationId, p_user: id, p_action: "add" });
    if (error) return { error: dbErrorMessage(error) };
  }
  revalidatePath(`/c/${slug}/chat/${conversationId}`, "layout");
  return { ok: true, message: `Added ${ids.length} ${ids.length === 1 ? "person" : "people"}.` };
}

export async function updateChannel(slug: string, conversationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug);
  const name = String(formData.get("name") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const posting = z.enum(["all", "moderators"]).catch("all").parse(formData.get("posting_policy"));
  const visibility = z.enum(["open", "restricted"]).catch("restricted").parse(formData.get("visibility"));
  if (name.length < 2 || name.length > 80) return { fieldErrors: { name: "Use 2 to 80 characters" } };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("conversations")
    .update({ name, topic: topic.slice(0, 300) || null, posting_policy: posting, visibility }, { count: "exact" })
    .eq("id", conversationId);
  if (error) return { error: dbErrorMessage(error) };
  if (!count) return { error: "You do not have permission to change this conversation." };
  revalidatePath(`/c/${slug}/chat`, "layout");
  return { ok: true, message: "Saved." };
}

export async function archiveChannel(slug: string, conversationId: string): Promise<void> {
  await requireChapter(slug);
  const supabase = await createClient();
  await supabase.from("conversations").update({ archived_at: new Date().toISOString() }).eq("id", conversationId);
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/chat`);
}

export async function updateNotify(slug: string, conversationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireChapter(slug);
  const notify = z.enum(["all", "mentions", "none"]).catch("mentions").parse(formData.get("notify"));
  const mute = String(formData.get("mute") ?? "");
  const hours = { "1h": 1, "8h": 8, "24h": 24, "7d": 168 }[mute];
  const supabase = await createClient();
  let mutedUntil = hours ? new Date(Date.now() + hours * 3600_000).toISOString() : mute === "forever" ? "2999-01-01T00:00:00Z" : null;
  if (mute === "keep") {
    const { data } = await supabase.from("conversation_members").select("muted_until").eq("conversation_id", conversationId).eq("user_id", user.id).maybeSingle();
    mutedUntil = (data?.muted_until as string | null) ?? null;
  }
  const { error } = await supabase.rpc("update_conversation_settings", { p_conversation: conversationId, p_notify: notify, p_muted_until: mutedUntil });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Notification settings saved." };
}

export async function resolveReport(slug: string, reportId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "chat.moderate");
  const action = z.enum(["dismiss", "remove_message", "restrict_sender"]).safeParse(formData.get("action"));
  if (!action.success) return { error: "Choose an action." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_message_report", { p_report: reportId, p_action: action.data, p_note: note || null });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/chat/reports`);
  return { ok: true, message: "Report resolved." };
}

export async function fetchMessages(slug: string, conversationId: string, options: { before?: string; parentId?: string; ids?: string[]; pinned?: boolean }): Promise<ChatMessage[]> {
  await requireChapter(slug);
  if (!z.uuid().safeParse(conversationId).success) return [];
  if (options.before && Number.isNaN(Date.parse(options.before))) return [];
  if (options.parentId && !z.uuid().safeParse(options.parentId).success) return [];
  if (options.ids) {
    const ids = options.ids.filter((id) => z.uuid().safeParse(id).success).slice(0, 20);
    return ids.length ? loadMessages(conversationId, { ids }) : [];
  }
  if (options.pinned) return loadMessages(conversationId, { pinned: true, limit: 50 });
  return loadMessages(conversationId, { before: options.before, parentId: options.parentId, limit: options.parentId ? 200 : 50 });
}

const ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

async function memberConversation(slug: string, conversationId: string) {
  const { chapter, user } = await requireChapter(slug);
  if (!z.uuid().safeParse(conversationId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_members")
    .select("conversation_id, conversation:conversations!inner(chapter_id, archived_at)")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  const c = data?.conversation as unknown as { chapter_id: string; archived_at: string | null } | null;
  if (!c || c.chapter_id !== chapter.id || c.archived_at) return null;
  return { chapterId: chapter.id, userId: user.id, prefix: `${chapter.id}/${conversationId}/` };
}

export async function createAttachmentUpload(
  slug: string,
  conversationId: string,
  file: { name: string; type: string; size: number },
): Promise<{ path: string; token: string } | { error: string }> {
  const ctx = await memberConversation(slug, conversationId);
  if (!ctx) return { error: "You are not in this conversation." };
  if (!ATTACHMENT_TYPES.has(file.type)) return { error: `${file.name} is not a supported file type.` };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 15 * 1024 * 1024) return { error: `${file.name} is larger than 15 MB.` };
  const safe = String(file.name).replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";
  const path = `${ctx.prefix}${randomUUID()}-${safe}`;
  const { data, error } = await createAdminClient().storage.from("chat-attachments").createSignedUploadUrl(path);
  if (error || !data) return { error: `Could not prepare the upload for ${file.name}.` };
  return { path: data.path, token: data.token };
}

export async function removePendingAttachment(slug: string, conversationId: string, path: string): Promise<void> {
  const ctx = await memberConversation(slug, conversationId);
  if (!ctx || !path.startsWith(ctx.prefix) || path.includes("..")) return;
  const admin = createAdminClient();
  const { data } = await admin.from("message_attachments").select("id").eq("storage_path", path).maybeSingle();
  if (data) return;
  await admin.storage.from("chat-attachments").remove([path]);
}

export async function purgeDeletedAttachments(slug: string, conversationId: string, paths: string[]): Promise<void> {
  const ctx = await memberConversation(slug, conversationId);
  const list = paths.filter((p) => typeof p === "string" && p.startsWith(ctx?.prefix ?? "\u0000")).slice(0, 20);
  if (!ctx || list.length === 0) return;
  const admin = createAdminClient();
  const { data } = await admin.from("message_attachments").select("storage_path").in("storage_path", list);
  const stillAttached = new Set((data ?? []).map((r) => r.storage_path as string));
  const orphaned = list.filter((p) => !stillAttached.has(p));
  if (orphaned.length) await admin.storage.from("chat-attachments").remove(orphaned);
}

export async function toggleBlock(slug: string, userId: string, block: boolean): Promise<void> {
  const { user } = await requireChapter(slug);
  if (userId === user.id || !z.uuid().safeParse(userId).success) return;
  const supabase = await createClient();
  if (block) await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: userId });
  else await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
  revalidatePath(`/c/${slug}/chat`, "layout");
}
