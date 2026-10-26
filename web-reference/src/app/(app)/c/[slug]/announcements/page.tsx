import { Megaphone, Pin } from "lucide-react";
import { Avatar, personName } from "@/components/people";
import { PhotoStrip, RichContent } from "@/components/rich-view";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { acknowledge, addComment, archiveAnnouncement, deleteComment, publishAnnouncement, setAnnouncementComments, setPinned } from "./actions";
import { AnnouncementComposer, CommentForm } from "./composer";
import { uploadChapterImage } from "../media-actions";

type Person = { display_name: string | null; full_name: string | null; avatar_path: string | null };
type Row = {
  id: string;
  title: string;
  body: string;
  audience: "all" | "officers";
  pinned: boolean;
  requires_ack: boolean;
  comments_enabled: boolean;
  image_paths: string[];
  published_at: string;
  author_id: string;
  author: Person | null;
};
type CommentRow = {
  id: string;
  announcement_id: string;
  body: string;
  created_at: string;
  author_id: string;
  author: Person | null;
};

export default async function AnnouncementsPage({ params }: PageProps<"/c/[slug]/announcements">) {
  const { slug } = await params;
  const { chapter, user, can } = await requireChapter(slug);
  const canPublish = can("announcements.publish");
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, audience, pinned, requires_ack, comments_enabled, image_paths, published_at, author_id, author:profiles!announcements_author_id_fkey(display_name, full_name, avatar_path)")
    .eq("chapter_id", chapter.id)
    .is("archived_at", null)
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id);
  const commentsByAnnouncement = new Map<string, CommentRow[]>();
  if (ids.length) {
    const { data: commentRows } = await supabase
      .from("announcement_comments")
      .select("id, announcement_id, body, created_at, author_id, author:profiles!announcement_comments_author_id_fkey(display_name, full_name, avatar_path)")
      .in("announcement_id", ids)
      .order("created_at");
    for (const comment of (commentRows ?? []) as unknown as CommentRow[]) {
      commentsByAnnouncement.set(comment.announcement_id, [...(commentsByAnnouncement.get(comment.announcement_id) ?? []), comment]);
    }
  }
  const canModerate = can("announcements.officers");
  const ackIds = rows.filter((r) => r.requires_ack).map((r) => r.id);
  const acks = new Map<string, number>();
  const mine = new Set<string>();
  let memberCount = 0;
  if (ackIds.length) {
    const { data: ackRows } = await supabase.from("announcement_acks").select("announcement_id, user_id").in("announcement_id", ackIds);
    for (const a of ackRows ?? []) {
      acks.set(a.announcement_id, (acks.get(a.announcement_id) ?? 0) + 1);
      if (a.user_id === user.id) mine.add(a.announcement_id);
    }
    if (canPublish) {
      const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id).eq("status", "active");
      memberCount = count ?? 0;
    }
  }

  return (
    <>
      <PageHeader title="Announcements" description="Updates from chapter officers. New announcements notify every member." />
      {canPublish ? (
        <Card className="mb-8">
          <CardHeader title="New announcement" />
          <CardBody>
            <AnnouncementComposer action={publishAnnouncement.bind(null, slug)} canOfficers={can("announcements.officers")} upload={uploadChapterImage.bind(null, slug)} />
          </CardBody>
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements yet">
            {canPublish ? "Publish the first one above." : "Officer updates will appear here."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((a) => {
            const name = a.author ? personName(a.author) : "Former member";
            const comments = commentsByAnnouncement.get(a.id) ?? [];
            const isAuthor = a.author_id === user.id;
            return (
              <Card key={a.id} id={a.id} className="scroll-mt-20">
                <div className="flex items-start gap-3 px-5 pt-4">
                  <Avatar name={name} path={a.author?.avatar_path} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold text-ink">{a.title}</h2>
                      {a.pinned ? (
                        <Badge tone="accent">
                          <Pin className="size-3" aria-hidden />
                          Pinned
                        </Badge>
                      ) : null}
                      {a.audience === "officers" ? <Badge tone="info">Officers only</Badge> : null}
                    </div>
                    <p className="text-[12px] text-ink-3">
                      {name} · {formatDateTime(a.published_at, chapter.timezone)}
                    </p>
                  </div>
                </div>
                <CardBody className="space-y-4">
                  <RichContent value={a.body} />
                  <PhotoStrip paths={a.image_paths ?? []} />
                  <div className="border-t border-line pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-medium text-ink">Comments</p>
                      {isAuthor ? (
                        <form action={setAnnouncementComments.bind(null, slug, a.id, !a.comments_enabled)}>
                          <Button type="submit" variant="ghost" size="sm">{a.comments_enabled ? "Turn comments off" : "Turn comments on"}</Button>
                        </form>
                      ) : null}
                    </div>
                    {comments.length === 0 ? <p className="mt-2 text-[13px] text-ink-3">{a.comments_enabled ? "No comments yet." : "Comments are turned off."}</p> : null}
                    {comments.length > 0 ? (
                      <ul className="mt-3 space-y-3">
                        {comments.map((comment) => {
                          const commentName = comment.author ? personName(comment.author) : "Former member";
                          return (
                            <li key={comment.id} className="flex items-start gap-2">
                              <Avatar name={commentName} path={comment.author?.avatar_path} size="xs" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-ink">
                                  <span className="font-medium">{commentName}</span>
                                  <span className="text-ink-3"> · {formatDateTime(comment.created_at, chapter.timezone)}</span>
                                </p>
                                <p className="whitespace-pre-wrap text-sm text-ink-2">{comment.body}</p>
                              </div>
                              {canModerate || comment.author_id === user.id ? (
                                <form action={deleteComment.bind(null, slug, comment.id)}>
                                  <Button type="submit" variant="ghost" size="sm">Delete</Button>
                                </form>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {a.comments_enabled ? <CommentForm action={addComment.bind(null, slug, a.id)} /> : comments.length > 0 ? <p className="mt-3 text-[13px] text-ink-3">Comments are turned off.</p> : null}
                  </div>
                </CardBody>
                {a.requires_ack || canPublish ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                    <div className="text-[13px] text-ink-3">
                      {a.requires_ack ? (
                        mine.has(a.id) ? (
                          <span className="text-positive">You acknowledged this</span>
                        ) : (
                          <form action={acknowledge.bind(null, slug, a.id)}>
                            <SubmitButton size="sm" pendingLabel="Saving">I have read this</SubmitButton>
                          </form>
                        )
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      {canPublish && a.requires_ack ? (
                        <span className="text-[13px] text-ink-3 tnum">
                          {acks.get(a.id) ?? 0} of {memberCount} acknowledged
                        </span>
                      ) : null}
                      {canPublish ? (
                        <>
                          <form action={setPinned.bind(null, slug, a.id, !a.pinned)}>
                            <Button type="submit" variant="ghost" size="sm">{a.pinned ? "Unpin" : "Pin"}</Button>
                          </form>
                          <form action={archiveAnnouncement.bind(null, slug, a.id)}>
                            <Button type="submit" variant="ghost" size="sm">Archive</Button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
