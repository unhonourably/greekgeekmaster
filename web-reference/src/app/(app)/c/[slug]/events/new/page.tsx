import { Card, CardBody, PageHeader, TextLink } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { uploadChapterImage } from "../../media-actions";
import { saveEvent } from "../actions";
import { EventForm } from "../event-form";

export default async function NewEventPage({ params }: PageProps<"/c/[slug]/events/new">) {
  const { slug } = await params;
  const { chapter } = await requireChapter(slug, "events.manage");
  return (
    <>
      <PageHeader eyebrow={<TextLink href={`/c/${slug}/events`}>Events</TextLink>} title="New event" />
      <Card className="max-w-3xl">
        <CardBody className="py-6">
          <EventForm action={saveEvent.bind(null, slug, null)} timezone={chapter.timezone} upload={uploadChapterImage.bind(null, slug)} />
        </CardBody>
      </Card>
    </>
  );
}
