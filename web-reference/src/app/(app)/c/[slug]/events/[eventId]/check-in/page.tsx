import { forbidden, notFound } from "next/navigation";
import { Card, CardBody, Notice, PageHeader, Stat, StatGrid, TextLink } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTime, requestTime } from "@/lib/format";
import { EVENT_COLUMNS, checkInOpen, type EventRow } from "@/lib/events";
import { issueCheckInCode } from "../../actions";
import { CheckInDisplay } from "./check-in-display";

export default async function CheckInPage({ params }: PageProps<"/c/[slug]/events/[eventId]/check-in">) {
  const { slug, eventId } = await params;
  const { chapter, can } = await requireChapter(slug);
  if (!can("attendance.manage") && !can("events.manage")) forbidden();
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!data) notFound();
  const e = data as EventRow;
  const open = checkInOpen(e, requestTime());
  const counts = { present: 0, late: 0 };
  if (can("attendance.view")) {
    const { data: rows } = await supabase.from("event_attendance").select("status").eq("event_id", e.id).in("status", ["present", "late"]);
    for (const r of rows ?? []) counts[r.status as "present" | "late"] += 1;
  }
  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/events/${e.id}`}>{e.title}</TextLink>}
        title="Check-in"
        description={`Members scan this with their phone camera while signed in. Open from ${formatTime(new Date(new Date(e.starts_at).getTime() - 3_600_000), chapter.timezone)} until ${formatTime(new Date(new Date(e.ends_at).getTime() + 1_800_000), chapter.timezone)}. Arrivals more than 15 minutes after the start are marked late.`}
      />
      {open ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardBody className="py-8">
              <CheckInDisplay issue={issueCheckInCode.bind(null, slug, e.id)} />
            </CardBody>
          </Card>
          {can("attendance.view") ? (
            <StatGrid className="h-fit lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
              <Stat label="Checked in" value={counts.present + counts.late} />
              <Stat label="Late" value={counts.late} tone={counts.late ? "warning" : undefined} />
            </StatGrid>
          ) : null}
        </div>
      ) : (
        <Notice tone="info" title="Check-in is closed">
          {e.cancelled_at ? "This event was cancelled." : "Check-in opens one hour before the event and closes 30 minutes after it ends. Officers can still record attendance manually."}
        </Notice>
      )}
    </>
  );
}
