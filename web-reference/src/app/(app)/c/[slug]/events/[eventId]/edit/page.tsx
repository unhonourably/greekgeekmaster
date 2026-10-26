import { notFound } from "next/navigation";
import { Card, CardBody, PageHeader, TextLink } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { utcToZonedParts } from "@/lib/timezone";
import { EVENT_COLUMNS, type EventRow } from "@/lib/events";
import { uploadChapterImage } from "../../../media-actions";
import { saveEvent } from "../../actions";
import { EventForm } from "../../event-form";

export default async function EditEventPage({ params }: PageProps<"/c/[slug]/events/[eventId]/edit">) {
  const { slug, eventId } = await params;
  const { chapter } = await requireChapter(slug, "events.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!data || data.cancelled_at) notFound();
  const e = data as EventRow;
  const tz = chapter.timezone;
  const start = utcToZonedParts(e.starts_at, tz);
  const end = utcToZonedParts(e.ends_at, tz);
  const deadline = e.rsvp_deadline ? utcToZonedParts(e.rsvp_deadline, tz) : null;
  return (
    <>
      <PageHeader eyebrow={<TextLink href={`/c/${slug}/events/${e.id}`}>{e.title}</TextLink>} title="Edit event" />
      <Card className="max-w-3xl">
        <CardBody className="py-6">
          <EventForm
            action={saveEvent.bind(null, slug, e.id)}
            timezone={tz}
            upload={uploadChapterImage.bind(null, slug)}
            initial={{
              title: e.title,
              description: e.description ?? "",
              location: e.location ?? "",
              category: e.category,
              date: start.date,
              start: start.time,
              end: end.time,
              visibility: e.visibility,
              attendance_required: e.attendance_required,
              required_classes: e.required_classes,
              capacity: e.capacity ? String(e.capacity) : "",
              rsvp_deadline_date: deadline?.date ?? "",
              rsvp_deadline_time: deadline?.time ?? "",
              image_paths: e.image_paths ?? [],
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
