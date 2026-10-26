import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge, Card, CardBody, EmptyState, buttonClass } from "@/components/ui";
import { personName } from "@/components/people";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { resolveReport } from "../actions";
import { ResolveReportForm } from "../chat-forms";

const REASON: Record<string, string> = {
  harassment: "Harassment or bullying",
  hazing: "Hazing",
  threat: "Threat or safety concern",
  privacy: "Private information",
  spam: "Spam",
  other: "Other",
};

export default async function ReportsPage({ params, searchParams }: PageProps<"/c/[slug]/chat/reports">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug, "chat.moderate");
  const showClosed = sp.status === "closed";
  const supabase = await createClient();
  let q = supabase
    .from("message_reports")
    .select("id, reason, details, message_snapshot, status, action, resolution_note, created_at, reviewed_at, conversation_id, reported_user_id, reporter_id")
    .eq("chapter_id", ctx.chapter.id)
    .order("created_at", { ascending: false })
    .limit(100);
  q = showClosed ? q.neq("status", "open") : q.eq("status", "open");
  const { data: reports } = await q;
  const userIds = [...new Set((reports ?? []).flatMap((r) => [r.reported_user_id as string, r.reporter_id as string]))];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id, display_name, full_name").in("id", userIds) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, personName(p)]));
  const tz = ctx.chapter.timezone;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold text-ink">Reports</h1>
            <p className="text-sm text-ink-3">Messages members flagged for review. Reports about you go to another moderator.</p>
          </div>
          <nav className="flex gap-1">
            <Link href={`/c/${slug}/chat/reports`} className={buttonClass(showClosed ? "ghost" : "secondary", "sm")}>Open</Link>
            <Link href={`/c/${slug}/chat/reports?status=closed`} className={buttonClass(showClosed ? "secondary" : "ghost", "sm")}>Resolved</Link>
          </nav>
        </div>
        {(reports ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title={showClosed ? "No resolved reports" : "Nothing to review"} />
        ) : (
          <ul className="space-y-4">
            {(reports ?? []).map((r) => (
              <li key={r.id as string}>
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={r.reason === "threat" || r.reason === "hazing" ? "danger" : "warning"}>{REASON[r.reason as string]}</Badge>
                      <span className="text-ink-2">Message from <span className="font-medium text-ink">{names.get(r.reported_user_id as string) ?? "Member"}</span></span>
                      <span className="ml-auto text-xs text-ink-3">{formatDateTime(r.created_at as string, tz)}</span>
                    </div>
                    <blockquote className="whitespace-pre-wrap rounded-md border-l-2 border-line bg-subtle px-3 py-2 text-sm text-ink">{(r.message_snapshot as string) || "(attachment only)"}</blockquote>
                    {r.details ? <p className="text-sm text-ink-2"><span className="text-ink-3">Reporter note:</span> {r.details as string}</p> : null}
                    <p className="text-xs text-ink-3">Reported by {names.get(r.reporter_id as string) ?? "a member"}</p>
                    {r.status === "open" ? (
                      r.reported_user_id === ctx.user.id ? (
                        <p className="text-sm text-ink-3">Another moderator needs to review this report.</p>
                      ) : (
                        <ResolveReportForm action={resolveReport.bind(null, slug, r.id as string)} />
                      )
                    ) : (
                      <p className="text-sm text-ink-2">
                        {r.status === "dismissed" ? "Dismissed" : r.action === "restrict_sender" ? "Message removed and sender restricted" : "Message removed"}
                        {r.reviewed_at ? ` on ${formatDateTime(r.reviewed_at as string, tz)}` : ""}
                        {r.resolution_note ? `. ${r.resolution_note}` : ""}
                      </p>
                    )}
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
