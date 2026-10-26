import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConversationListItem = {
  id: string;
  kind: string;
  name: string | null;
  topic: string | null;
  visibility: string;
  posting_policy: string;
  last_message_at: string | null;
  unread_count: number;
  notify: string;
  muted_until: string | null;
  is_moderator: boolean;
  other_user_id: string | null;
  other_display_name: string | null;
  member_count: number;
};

export type ChatQuote = { id: string; sender_id: string; body: string; deleted: boolean; has_attachment: boolean };

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  parent_id: string | null;
  body: string;
  mentions: string[];
  mention_role_ids: string[];
  mention_all: boolean;
  reply_count: number;
  edited_at: string | null;
  deleted_at: string | null;
  pinned_at: string | null;
  created_at: string;
  reply_to_id: string | null;
  reply_to: ChatQuote | null;
  reactions: Array<{ user_id: string; emoji: string }>;
  attachments: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number; url: string | null }>;
};

export type ChatMember = { user_id: string; name: string; avatar_path: string | null; role: string };

export function conversationTitle(c: { kind: string; name: string | null; other_display_name?: string | null }): string {
  if (c.kind === "direct") return c.other_display_name || "Direct message";
  return c.name || "Group";
}

export async function listMyConversations(chapterId: string): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_conversations", { p_chapter: chapterId });
  return ((data ?? []) as ConversationListItem[]).map((c) => ({ ...c, unread_count: Number(c.unread_count), member_count: Number(c.member_count) }));
}

export async function loadMessages(conversationId: string, options: { before?: string; parentId?: string; ids?: string[]; pinned?: boolean; limit?: number } = {}): Promise<ChatMessage[]> {
  const supabase = await createClient();
  let q = supabase.from("messages").select("*").eq("conversation_id", conversationId);
  if (options.ids) q = q.in("id", options.ids);
  else if (options.pinned) q = q.not("pinned_at", "is", null).is("deleted_at", null);
  else q = options.parentId ? q.eq("parent_id", options.parentId) : q.is("parent_id", null);
  if (options.before) q = q.lt("created_at", options.before);
  const { data } = await q.order("created_at", { ascending: false }).limit(options.limit ?? 50);
  const rows = ((data ?? []) as Array<Record<string, unknown>>).reverse().map((raw) => {
    const r = { ...raw };
    delete r.search;
    delete r.chapter_id;
    delete r.deleted_by;
    delete r.pinned_by;
    return { ...r, reply_to_id: (raw.reply_to_id as string | null | undefined) ?? null } as Omit<ChatMessage, "reactions" | "attachments" | "reply_to">;
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter((v): v is string => !!v))];
  const [{ data: reactions }, { data: attachments }, { data: quoted }] = await Promise.all([
    supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", ids),
    supabase.from("message_attachments").select("id, message_id, storage_path, file_name, mime_type, size_bytes").in("message_id", ids),
    replyIds.length
      ? supabase.from("messages").select("id, sender_id, body, deleted_at, message_attachments(id)").in("id", replyIds)
      : Promise.resolve({ data: [] as Array<{ id: string; sender_id: string; body: string; deleted_at: string | null; message_attachments: Array<{ id: string }> | null }> }),
  ]);
  const quotedById = new Map(
    (quoted ?? []).map((q) => [
      q.id as string,
      {
        id: q.id as string,
        sender_id: q.sender_id as string,
        body: q.deleted_at ? "" : (q.body as string),
        deleted: !!q.deleted_at,
        has_attachment: !q.deleted_at && (q.message_attachments?.length ?? 0) > 0,
      },
    ]),
  );
  const paths = (attachments ?? []).map((a) => a.storage_path as string);
  const signed = paths.length ? (await supabase.storage.from("chat-attachments").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({
    ...r,
    reply_to: r.reply_to_id ? quotedById.get(r.reply_to_id) ?? { id: r.reply_to_id, sender_id: "", body: "", deleted: true, has_attachment: false } : null,
    reactions: (reactions ?? []).filter((x) => x.message_id === r.id).map((x) => ({ user_id: x.user_id as string, emoji: x.emoji as string })),
    attachments: (attachments ?? [])
      .filter((a) => a.message_id === r.id)
      .map((a) => ({ id: a.id as string, file_name: a.file_name as string, mime_type: a.mime_type as string, size_bytes: a.size_bytes as number, url: urlByPath.get(a.storage_path as string) ?? null })),
  }));
}

export async function loadConversationMembers(conversationId: string): Promise<ChatMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_members")
    .select("user_id, role, profile:profiles(display_name, full_name, avatar_path)")
    .eq("conversation_id", conversationId)
    .is("removed_at", null)
    .limit(1000);
  return (data ?? [])
    .map((m) => {
      const p = (m.profile ?? {}) as unknown as { display_name: string | null; full_name: string | null; avatar_path: string | null };
      return { user_id: m.user_id as string, role: m.role as string, name: p.display_name?.trim() || p.full_name?.trim() || "Member", avatar_path: p.avatar_path ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
