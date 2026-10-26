import Link from "next/link";
import { Compass, Hash } from "lucide-react";
import { Badge, EmptyState, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { joinChannel } from "../actions";

export default async function BrowseChannelsPage({ params, searchParams }: PageProps<"/c/[slug]/chat/browse">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug);
  const supabase = await createClient();
  const [{ data: channels }, { data: mine }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, kind, name, topic, last_message_at")
      .eq("chapter_id", ctx.chapter.id)
      .eq("visibility", "open")
      .is("archived_at", null)
      .not("kind", "in", "(direct,group)")
      .order("name"),
    supabase.from("conversation_members").select("conversation_id").eq("user_id", ctx.user.id).eq("chapter_id", ctx.chapter.id).is("removed_at", null),
  ]);
  const joined = new Set((mine ?? []).map((m) => m.conversation_id as string));
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <h1 className="font-serif text-xl font-semibold text-ink">Browse channels</h1>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {(channels ?? []).length === 0 ? (
          <EmptyState icon={Compass} title="No open channels">Officers who manage chat can create channels anyone can join.</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {(channels ?? []).map((c) => (
              <li key={c.id as string} className="flex items-center gap-3 px-4 py-3">
                <Hash className="size-4 shrink-0 text-ink-3" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link href={`/c/${slug}/chat/${c.id}`} className="block truncate text-sm font-medium text-ink hover:underline">{c.name as string}</Link>
                  {c.topic ? <p className="truncate text-xs text-ink-3">{c.topic as string}</p> : null}
                </div>
                {joined.has(c.id as string) ? (
                  <Badge>Joined</Badge>
                ) : (
                  <form action={joinChannel.bind(null, slug, c.id as string)}>
                    <SubmitButton size="sm" variant="secondary">Join</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
