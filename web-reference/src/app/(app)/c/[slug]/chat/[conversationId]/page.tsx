import { notFound } from "next/navigation";
import { Archive, Hash } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { requestTime } from "@/lib/format";
import { conversationTitle, loadConversationMembers, loadMessages } from "@/lib/chat";
import { listChapterRoles } from "@/lib/roles";
import { joinChannel } from "../actions";
import { ChatRoom } from "./chat-room";

export default async function ConversationPage({ params }: PageProps<"/c/[slug]/chat/[conversationId]">) {
  const { slug, conversationId } = await params;
  const ctx = await requireChapter(slug);
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conversations")
    .select("id, chapter_id, kind, name, topic, visibility, posting_policy, archived_at")
    .eq("id", conversationId)
    .eq("chapter_id", ctx.chapter.id)
    .maybeSingle();
  if (!c) notFound();
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("role, last_read_at, posting_restricted_until, removed_at")
    .eq("conversation_id", c.id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  const isMember = Boolean(mine && !mine.removed_at);
  if (c.archived_at) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState icon={Archive} title={`${c.name ?? "This channel"} is archived`}>
          Archived channels are hidden and closed to new messages.
        </EmptyState>
      </div>
    );
  }
  if (!isMember) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState icon={Hash} title={c.name ?? "Channel"} action={
          c.visibility === "open" && !c.archived_at ? (
            <form action={joinChannel.bind(null, slug, c.id as string)}>
              <SubmitButton>Join channel</SubmitButton>
            </form>
          ) : null
        }>
          {c.topic ?? "Join to read and post messages."}
        </EmptyState>
      </div>
    );
  }
  const [members, messages, roles] = await Promise.all([loadConversationMembers(c.id as string), loadMessages(c.id as string, { limit: 50 }), listChapterRoles(ctx.chapter.id)]);
  const other = c.kind === "direct" ? members.find((m) => m.user_id !== ctx.user.id) : null;
  const title =
    c.kind === "group" && !c.name
      ? members.filter((m) => m.user_id !== ctx.user.id).map((m) => m.name.split(" ")[0]).slice(0, 4).join(", ")
      : conversationTitle({ kind: c.kind as string, name: c.name as string | null, other_display_name: other?.name ?? null });
  const isModerator = mine?.role === "moderator" || (c.kind !== "direct" && c.kind !== "group" && ctx.can("chat.moderate"));
  return (
    <ChatRoom
      key={c.id as string}
      slug={slug}
      supabaseUrl={serverEnv.supabaseUrl()}
      supabaseKey={serverEnv.supabasePublishableKey()}
      timezone={ctx.chapter.timezone}
      conversation={{
        id: c.id as string,
        chapterId: c.chapter_id as string,
        kind: c.kind as string,
        title,
        topic: (c.topic as string | null) ?? null,
        visibility: c.visibility as string,
        postingPolicy: c.posting_policy as string,
        archived: Boolean(c.archived_at),
      }}
      me={{
        id: ctx.user.id,
        isModerator,
        restricted: Boolean(mine?.posting_restricted_until && new Date(mine.posting_restricted_until as string).getTime() > requestTime()),
        lastReadAt: (mine?.last_read_at as string | null) ?? null,
      }}
      members={members}
      roles={c.kind === "direct" ? [] : roles.map((r) => ({ id: r.id, name: r.name }))}
      initialMessages={messages}
      hasMore={messages.length >= 50}
    />
  );
}
