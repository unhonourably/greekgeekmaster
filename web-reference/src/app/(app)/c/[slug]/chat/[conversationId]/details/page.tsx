import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Archive, LogOut, ShieldCheck, UserMinus } from "lucide-react";
import { Avatar } from "@/components/people";
import { Badge, Card, CardBody, CardHeader, Notice } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadConversationMembers } from "@/lib/chat";
import { requestTime } from "@/lib/format";
import { addMembers, archiveChannel, leaveConversation, manageMember, toggleBlock, updateChannel, updateNotify } from "../../actions";
import { AddMembersForm, ChannelSettingsForm, NotifyForm } from "../../chat-forms";

const KIND_LABEL: Record<string, string> = {
  chapter_main: "Chapter-wide channel",
  announcement: "Announcement channel",
  exec: "Executive board",
  channel: "Channel",
  committee: "Committee",
  recruitment: "Recruitment",
  event: "Event",
  alumni: "Alumni",
  direct: "Direct message",
  group: "Group message",
};

export default async function ConversationDetailsPage({ params, searchParams }: PageProps<"/c/[slug]/chat/[conversationId]/details">) {
  const { slug, conversationId } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug);
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("conversations").select("id, kind, name, topic, visibility, posting_policy, auto_membership, archived_at").eq("id", conversationId).eq("chapter_id", ctx.chapter.id).maybeSingle();
  if (!c) notFound();
  const { data: mine } = await supabase.from("conversation_members").select("role, notify, muted_until, removed_at").eq("conversation_id", c.id).eq("user_id", ctx.user.id).maybeSingle();
  if (!mine || mine.removed_at) notFound();
  const members = await loadConversationMembers(c.id as string);
  const isDirect = c.kind === "direct";
  const canManage = !isDirect && (mine.role === "moderator" || ctx.can("chat.manage") || (c.kind !== "group" && ctx.can("chat.moderate")));
  const editable = canManage && c.kind !== "group" && !["chapter_main", "announcement", "exec"].includes(c.kind as string);
  const autoManaged = c.auto_membership !== "none";
  const other = isDirect ? members.find((m) => m.user_id !== ctx.user.id) : null;
  const { data: block } = other ? await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", ctx.user.id).eq("blocked_id", other.user_id).maybeSingle() : { data: null };
  let candidates: Array<{ user_id: string; name: string }> = [];
  if (canManage && !autoManaged) {
    const { data } = await supabase.rpc("chapter_directory", { p_chapter: ctx.chapter.id, p_search: null, p_class: null, p_role: null, p_status: "active", p_limit: 200, p_offset: 0 });
    const inside = new Set(members.map((m) => m.user_id));
    candidates = ((data ?? []) as Array<{ user_id: string; display_name: string | null; full_name: string | null }>)
      .filter((d) => !inside.has(d.user_id))
      .map((d) => ({ user_id: d.user_id, name: d.display_name?.trim() || d.full_name?.trim() || "Member" }));
  }
  const muted = Boolean(mine.muted_until && new Date(mine.muted_until as string).getTime() > requestTime());
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  const title = isDirect ? other?.name ?? "Direct message" : (c.name as string | null) ?? "Group";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <Link href={`/c/${slug}/chat/${c.id}`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to conversation
        </Link>
        <div>
          <h1 className="font-serif text-xl font-semibold text-ink">{title}</h1>
          <p className="text-sm text-ink-3">{KIND_LABEL[c.kind as string]} · {members.length} {members.length === 1 ? "person" : "people"}{c.archived_at ? " · Archived" : ""}</p>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            {editable ? (
              <Card>
                <CardHeader title="Channel settings" />
                <CardBody>
                  <ChannelSettingsForm action={updateChannel.bind(null, slug, c.id as string)} initial={{ name: (c.name as string) ?? "", topic: (c.topic as string) ?? "", posting_policy: c.posting_policy as string, visibility: c.visibility as string }} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="People" description={autoManaged ? "Membership is managed automatically from member roles and classes." : undefined} />
              <ul className="divide-y divide-line">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar name={m.name} path={m.avatar_path} />
                    <Link href={`/c/${slug}/members/${m.user_id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">{m.name}{m.user_id === ctx.user.id ? " (you)" : ""}</Link>
                    {m.role === "moderator" ? <Badge tone="accent">Moderator</Badge> : null}
                    {canManage && m.user_id !== ctx.user.id ? (
                      <div className="flex gap-1">
                        <form action={manageMember.bind(null, slug, c.id as string, m.user_id, m.role === "moderator" ? "demote" : "promote")}>
                          <SubmitButton variant="ghost" size="sm">
                            <ShieldCheck className="size-4" aria-hidden />
                            <span className="sr-only sm:not-sr-only">{m.role === "moderator" ? "Remove moderator" : "Make moderator"}</span>
                          </SubmitButton>
                        </form>
                        {!autoManaged ? (
                          <form action={manageMember.bind(null, slug, c.id as string, m.user_id, "remove")}>
                            <ConfirmSubmit message={`Remove ${m.name} from this conversation?`} variant="ghost">
                              <UserMinus className="size-4" aria-hidden />
                              <span className="sr-only">Remove</span>
                            </ConfirmSubmit>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage && !autoManaged && candidates.length > 0 ? (
                <CardBody className="border-t border-line">
                  <AddMembersForm action={addMembers.bind(null, slug, c.id as string)} people={candidates} />
                </CardBody>
              ) : null}
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Notifications" />
              <CardBody>
                <NotifyForm action={updateNotify.bind(null, slug, c.id as string)} notify={mine.notify as string} muted={muted} />
              </CardBody>
            </Card>
            {other ? (
              <Card>
                <CardHeader title="Privacy" />
                <CardBody className="space-y-3">
                  <p className="text-sm text-ink-2">{block ? `You blocked ${other.name}. They cannot message you directly.` : `Blocking stops ${other.name} from messaging you directly and hides notifications from them.`}</p>
                  <form action={toggleBlock.bind(null, slug, other.user_id, !block)}>
                    {block ? <SubmitButton variant="secondary" size="sm">Unblock</SubmitButton> : <ConfirmSubmit message={`Block ${other.name}?`}>Block</ConfirmSubmit>}
                  </form>
                </CardBody>
              </Card>
            ) : null}
            {!isDirect && !autoManaged ? (
              <form action={leaveConversation.bind(null, slug, c.id as string)}>
                <ConfirmSubmit message="Leave this conversation?" variant="secondary">
                  <LogOut className="size-4" aria-hidden />
                  Leave
                </ConfirmSubmit>
              </form>
            ) : null}
            {editable && !c.archived_at ? (
              <form action={archiveChannel.bind(null, slug, c.id as string)}>
                <ConfirmSubmit message="Archive this channel? Its messages will be hidden for everyone and no one can post.">
                  <Archive className="size-4" aria-hidden />
                  Archive channel
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
