import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, QrCode, Users } from "lucide-react";
import { Avatar, personName } from "@/components/people";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Notice, PageHeader, TextLink, cx } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatTime, requestTime } from "@/lib/format";
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, EVENT_CATEGORY_LABEL, EVENT_COLUMNS, RSVP_LABEL, checkInOpen, type AttendanceStatus, type EventRow, type RsvpStatus } from "@/lib/events";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { PhotoStrip, RichContent } from "@/components/rich-view";
import { cancelEvent, rsvp } from "../actions";

type Rsvp = { user_id: string; status: RsvpStatus; profile: { display_name: string | null; full_name: string | null; avatar_path: string | null } | null };

export default async function EventPage({ params, searchParams }: PageProps<"/c/[slug]/events/[eventId]">) {
  const { slug, eventId } = await params;
  const sp = await searchParams;
  const { chapter, user, membership, can } = await requireChapter(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!data) notFound();
  const e = data as EventRow;
  const [{ data: rsvpData }, { data: attendance }] = await Promise.all([
    supabase.from("event_rsvps").select("user_id, status, profile:profiles(display_name, full_name, avatar_path)").eq("event_id", e.id).order("responded_at"),
    supabase.from("event_attendance").select("status, method, checked_in_at").eq("event_id", e.id).eq("membership_id", membership.id).maybeSingle(),
  ]);
  const rsvps = (rsvpData ?? []) as unknown as Rsvp[];
  const mine = rsvps.find((r) => r.user_id === user.id)?.status ?? null;
  const goingList = rsvps.filter((r) => r.status === "going");
  const maybeList = rsvps.filter((r) => r.status === "maybe");
  const now = requestTime();
  const tz = chapter.timezone;
  const ended = new Date(e.ends_at).getTime() < now;
  const rsvpClosed = Boolean(e.cancelled_at) || ended || (e.rsvp_deadline !== null && new Date(e.rsvp_deadline).getTime() < now);
  const full = e.capacity !== null && goingList.length >= e.capacity && mine !== "going";
  const isOfficer = can("events.manage") || can("attendance.manage");
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  const base = `/c/${slug}/events/${e.id}`;
  const requiredFor = e.required_classes.length ? e.required_classes.map((c) => MEMBER_CLASS_LABEL[c as MemberClass] ?? c).join(", ") : "all members";

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/events`}>Events</TextLink>}
        title={<span className={cx(e.cancelled_at && "text-ink-3 line-through")}>{e.title}</span>}
        actions={
          isOfficer ? (
            <>
              {can("attendance.manage") || can("attendance.view") ? <ButtonLink href={`${base}/attendance`} variant="secondary" size="sm">Attendance</ButtonLink> : null}
              {can("events.manage") && !e.cancelled_at ? <ButtonLink href={`${base}/edit`} variant="secondary" size="sm">Edit</ButtonLink> : null}
              {checkInOpen(e, now) ? (
                <ButtonLink href={`${base}/check-in`} size="sm">
                  <QrCode className="size-4" aria-hidden />
                  Show check-in code
                </ButtonLink>
              ) : null}
            </>
          ) : null
        }
      />
      {error ? <Notice tone="danger" className="mb-6">{error}</Notice> : null}
      {e.cancelled_at ? (
        <Notice tone="danger" title="This event was cancelled" className="mb-6">
          Cancelled {formatDateTime(e.cancelled_at, tz)}.
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-3 py-5">
              <p className="flex items-center gap-2 text-sm text-ink">
                <CalendarDays className="size-4 text-ink-3" aria-hidden />
                {formatDate(e.starts_at, tz)}
              </p>
              <p className="flex items-center gap-2 text-sm text-ink">
                <Clock className="size-4 text-ink-3" aria-hidden />
                <span className="tnum">{formatTime(e.starts_at, tz)} – {formatTime(e.ends_at, tz, true)}</span>
              </p>
              {e.location ? (
                <p className="flex items-center gap-2 text-sm text-ink">
                  <MapPin className="size-4 text-ink-3" aria-hidden />
                  {e.location}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge>{EVENT_CATEGORY_LABEL[e.category]}</Badge>
                {e.attendance_required ? <Badge tone="warning">Required for {requiredFor}</Badge> : null}
                {e.visibility === "officers" ? <Badge tone="info">Officers only</Badge> : null}
              </div>
              {e.description || (e.image_paths ?? []).length ? (
                <div className="space-y-4 border-t border-line pt-4">
                  {e.description ? <RichContent value={e.description} /> : null}
                  <PhotoStrip paths={e.image_paths ?? []} />
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Who's going"
              description={`${goingList.length}${e.capacity ? ` of ${e.capacity}` : ""} going${maybeList.length ? `, ${maybeList.length} maybe` : ""}`}
            />
            <CardBody>
              {goingList.length === 0 && maybeList.length === 0 ? (
                <p className="text-sm text-ink-3">No RSVPs yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {[...goingList, ...maybeList].map((r) => {
                    const name = r.profile ? personName(r.profile) : "Member";
                    return (
                      <li key={r.user_id}>
                        <Link href={`/c/${slug}/members/${r.user_id}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm hover:border-ink-3/40">
                          <Avatar name={name} path={r.profile?.avatar_path} size="xs" />
                          {name}
                          {r.status === "maybe" ? <span className="text-[12px] text-ink-3">maybe</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your RSVP" description={e.rsvp_deadline ? `RSVPs close ${formatDateTime(e.rsvp_deadline, tz)}` : undefined} />
            <CardBody className="space-y-3">
              {rsvpClosed ? (
                <p className="text-sm text-ink-3">{mine ? `You responded: ${RSVP_LABEL[mine]}.` : "RSVPs are closed."}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(["going", "maybe", "not_going"] as const).map((s) => (
                    <form key={s} action={rsvp.bind(null, slug, e.id, s)}>
                      <SubmitButton size="sm" variant={mine === s ? "primary" : "secondary"} className="w-full" disabled={s === "going" && full}>
                        {RSVP_LABEL[s]}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              )}
              {full && !rsvpClosed ? <p className="text-[13px] text-ink-3">This event is at capacity.</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Your attendance" />
            <CardBody>
              {attendance ? (
                <p className="flex items-center gap-2 text-sm">
                  <Badge tone={ATTENDANCE_TONE[attendance.status as AttendanceStatus]}>{ATTENDANCE_LABEL[attendance.status as AttendanceStatus]}</Badge>
                  <span className="text-ink-3">
                    {attendance.method === "qr" ? "Checked in" : "Recorded"} {formatTime(attendance.checked_in_at, tz, true)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-ink-3">
                  {checkInOpen(e, now) ? "Scan the code an officer shows at the event to check in." : ended ? "No attendance recorded." : "Check-in opens one hour before the event."}
                </p>
              )}
            </CardBody>
          </Card>
          {can("events.manage") && !e.cancelled_at && !ended ? (
            <Card>
              <CardBody className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <Users className="size-4 text-ink-3" aria-hidden />
                  Cancel for everyone
                </span>
                <form action={cancelEvent.bind(null, slug, e.id)}>
                  <ConfirmSubmit message="Cancel this event? RSVPs and check-in will close.">Cancel event</ConfirmSubmit>
                </form>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
