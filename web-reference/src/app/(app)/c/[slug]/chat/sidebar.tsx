import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { requestTime } from "@/lib/format";
import { conversationTitle, listMyConversations } from "@/lib/chat";
import { ChatSidebar } from "./chat-sidebar";

type Preview = { body: string; sender_id: string; created_at: string; deleted_at: string | null; has_files: boolean };

export async function ConversationSidebar({ slug }: { slug: string }) {
  const ctx = await requireChapter(slug);
  const conversations = await listMyConversations(ctx.chapter.id);
  const canModerate = ctx.can("chat.moderate");
  const supabase = await createClient();
  const unnamedGroups = conversations.filter((c) => c.kind === "group" && !c.name).map((c) => c.id);
  const [reports, groupMembers, previews] = await Promise.all([
    canModerate
      ? supabase.from("message_reports").select("id", { count: "exact", head: true }).eq("chapter_id", ctx.chapter.id).eq("status", "open")
      : Promise.resolve({ count: 0 }),
    unnamedGroups.length
      ? supabase
          .from("conversation_members")
          .select("conversation_id, user_id, profile:profiles(display_name, full_name)")
          .in("conversation_id", unnamedGroups)
          .is("removed_at", null)
          .neq("user_id", ctx.user.id)
      : Promise.resolve({ data: [] }),
    Promise.all(
      conversations
        .filter((c) => c.last_message_at)
        .map(async (c) => {
          const { data } = await supabase
            .from("messages")
            .select("body, sender_id, created_at, deleted_at, attachments:message_attachments(id)")
            .eq("conversation_id", c.id)
            .is("parent_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!data) return null;
          const row = data as unknown as Omit<Preview, "has_files"> & { attachments: unknown[] | null };
          return [c.id, { body: row.body, sender_id: row.sender_id, created_at: row.created_at, deleted_at: row.deleted_at, has_files: Boolean(row.attachments?.length) }] as const;
        }),
    ),
  ]);
  const groupNames = new Map<string, string[]>();
  for (const m of (groupMembers.data ?? []) as unknown as Array<{ conversation_id: string; profile: { display_name: string | null; full_name: string | null } | null }>) {
    const name = (m.profile?.display_name?.trim() || m.profile?.full_name?.trim() || "Member").split(" ")[0];
    groupNames.set(m.conversation_id, [...(groupNames.get(m.conversation_id) ?? []), name]);
  }
  const previewById = new Map(previews.filter((p): p is NonNullable<typeof p> => p !== null));
  const now = requestTime();
  return (
    <ChatSidebar
      slug={slug}
      canModerate={canModerate}
      canCreateChannel={ctx.can("chat.manage") || (ctx.can("recruitment.manage") && Boolean(ctx.chapter.modules?.recruitment))}
      openReports={reports.count ?? 0}
      realtime={{ url: serverEnv.supabaseUrl(), key: serverEnv.supabasePublishableKey(), chapterId: ctx.chapter.id, meId: ctx.user.id }}
      conversations={conversations.map((c) => {
        const p = previewById.get(c.id);
        const names = groupNames.get(c.id);
        return {
          id: c.id,
          kind: c.kind,
          title: c.kind === "group" && !c.name && names?.length ? names.sort().join(", ") : conversationTitle(c),
          visibility: c.visibility,
          unread: c.unread_count,
          muted: Boolean(c.muted_until && new Date(c.muted_until).getTime() > now),
          lastAt: p?.created_at ?? c.last_message_at,
          preview: p ? (p.deleted_at ? "Message deleted" : p.body.trim() || (p.has_files ? "Sent an attachment" : "")) : null,
          previewMine: p ? p.sender_id === ctx.user.id : false,
        };
      })}
    />
  );
}
