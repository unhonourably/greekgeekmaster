import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTime, requestTime } from "@/lib/format";
import { EVENT_CATEGORY_LABEL, EVENT_COLUMNS, RSVP_LABEL, type EventRow, type RsvpStatus } from "@/lib/events";

export default async function EventsPage({ params, searchParams }: PageProps<"/c/[slug]/events">) {
  const { slug } = await params;
  const sp = await searchParams;
  const past = sp.view === "past";
  const { chapter, user, can } = await requireChapter(slug);
  const now = new Date(requestTime()).toISOString();
  const supabase = await createClient();
  let query = supabase.from("events").select(EVENT_COLUMNS).eq("chapter_id", chapter.id);
  query = past ? query.lt("ends_at", now).order("starts_at", { ascending: false }) : query.gte("ends_at", now).order("starts_at", { ascending: true });
  const { data } = await query.limit(100);
  const events = (data ?? []) as EventRow[];
  const ids = events.map((e) => e.id);
  const mine = new Map<string, RsvpStatus>();
  const going = new Map<string, number>();
  if (ids.length) {
    const { data: rsvps } = await supabase.from("event_rsvps").select("event_id, user_id, status").in("event_id", ids);
    for (const r of rsvps ?? []) {
      if (r.user_id === user.id) mine.set(r.event_id, r.status as RsvpStatus);
      if (r.status === "going") going.set(r.event_id, (going.get(r.event_id) ?? 0) + 1);
    }
  }
  const tz = chapter.timezone;
  const dayKey = (v: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(v));
  const dayLabel = (v: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(v));
  const groups = events.reduce<Array<{ key: string; label: string; items: EventRow[] }>>((acc, e) => {
    const key = dayKey(e.starts_at);
    const last = acc[acc.length - 1];
    if (last && last.key === key) last.items.push(e);
    else acc.push({ key, label: dayLabel(e.starts_at), items: [e] });
    return acc;
  }, []);
  const base = `/c/${slug}/events`;

  return (
    <>
      <PageHeader
        title="Events"
        description="Chapter meetings, socials, and service. RSVP so officers can plan."
        actions={can("events.manage") ? <ButtonLink href={`${base}/new`}>New event</ButtonLink> : null}
      />
      <nav className="mb-6 flex gap-1 border-b border-line text-sm" aria-label="Event views">
        {[
          { label: "Upcoming", href: base, active: !past },
          { label: "Past", href: `${base}?view=past`, active: past },
        ].map((t) => (
          <Link key={t.label} href={t.href} aria-current={t.active ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2", t.active ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title={past ? "No past events" : "Nothing scheduled"}>
            {!past && can("events.manage") ? "Create an event to start collecting RSVPs." : null}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-[13px] font-medium text-ink-3">{g.label}</h2>
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/${e.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 hover:bg-canvas/50">
                      <span className="w-32 shrink-0 text-sm text-ink-2 tnum">
                        {formatTime(e.starts_at, tz)} – {formatTime(e.ends_at, tz, true)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate font-medium", e.cancelled_at ? "text-ink-3 line-through" : "text-ink")}>{e.title}</span>
                        {e.location ? (
                          <span className="flex items-center gap-1 truncate text-[13px] text-ink-3">
                            <MapPin className="size-3" aria-hidden />
                            {e.location}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {e.cancelled_at ? <Badge tone="danger">Cancelled</Badge> : null}
                        {e.attendance_required ? <Badge tone="warning">Required</Badge> : null}
                        {e.visibility === "officers" ? <Badge tone="info">Officers</Badge> : null}
                        <Badge>{EVENT_CATEGORY_LABEL[e.category]}</Badge>
                        <span className="text-[13px] text-ink-3 tnum">
                          {going.get(e.id) ?? 0}
                          {e.capacity ? ` / ${e.capacity}` : ""} going
                        </span>
                        {mine.has(e.id) ? <Badge tone={mine.get(e.id) === "going" ? "positive" : "neutral"}>You: {RSVP_LABEL[mine.get(e.id)!]}</Badge> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
