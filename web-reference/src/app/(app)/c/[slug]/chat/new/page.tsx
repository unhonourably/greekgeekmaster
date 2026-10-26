import Link from "next/link";
import { ArrowLeft, Hash } from "lucide-react";
import { Card, CardBody, CardHeader, buttonClass } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { createConversation, startConversation } from "../actions";
import { NewConversationForm, NewMessageForm } from "../chat-forms";

type DirectoryRow = { user_id: string; display_name: string | null; full_name: string | null; avatar_path: string | null; member_class: MemberClass; graduation_year: number | null };

export default async function NewConversationPage({ params, searchParams }: PageProps<"/c/[slug]/chat/new">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug);
  const canManage = ctx.can("chat.manage");
  const canRecruit = ctx.can("recruitment.manage") && Boolean(ctx.chapter.modules?.recruitment);
  const supabase = await createClient();
  const { data } = await supabase.rpc("chapter_directory", { p_chapter: ctx.chapter.id, p_search: null, p_class: null, p_role: null, p_status: "active", p_limit: 500, p_offset: 0 });
  const people = ((data ?? []) as DirectoryRow[])
    .filter((d) => d.user_id !== ctx.user.id)
    .map((d) => ({
      user_id: d.user_id,
      name: d.display_name?.trim() || d.full_name?.trim() || "Member",
      avatar_path: d.avatar_path,
      detail: [MEMBER_CLASS_LABEL[d.member_class], d.graduation_year ? `Class of ${d.graduation_year}` : null].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (sp.kind === "channel" && (canManage || canRecruit)) {
    const kinds: Array<{ value: string; label: string }> = [];
    if (canManage) kinds.push({ value: "channel", label: "Channel" }, { value: "committee", label: "Committee" }, { value: "event", label: "Event" }, { value: "alumni", label: "Alumni" });
    if (canRecruit) kinds.push({ value: "recruitment", label: "Recruitment" });
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
          <Link href={`/c/${slug}/chat/new`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden />
            New message
          </Link>
          <Card>
            <CardHeader title="New channel" description="Channels are for topics, committees, and events. Members can browse open channels and join." />
            <CardBody>
              <NewConversationForm action={createConversation.bind(null, slug)} people={people} kinds={kinds} defaultKind={kinds[0].value} />
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
        <Link href={`/c/${slug}/chat`} className="rounded p-1 text-ink-3 hover:bg-subtle md:hidden" aria-label="All conversations">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <h1 className="flex-1 text-[15px] font-semibold text-ink">New message</h1>
        {canManage || canRecruit ? (
          <Link href={`/c/${slug}/chat/new?kind=channel`} className={buttonClass("ghost", "sm")}>
            <Hash className="size-4" aria-hidden />
            New channel
          </Link>
        ) : null}
      </header>
      <NewMessageForm action={startConversation.bind(null, slug)} people={people} />
    </div>
  );
}
