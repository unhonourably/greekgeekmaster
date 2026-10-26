import { notFound } from "next/navigation";
import { Card, CardBody, Notice } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/format";
import { checkIn } from "../../actions";
import { CheckInButton } from "./check-in-button";

export default async function ScanPage({ params, searchParams }: PageProps<"/c/[slug]/events/[eventId]/scan">) {
  const { slug, eventId } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t.slice(0, 400) : "";
  const { chapter } = await requireChapter(slug);
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("id, title, location, starts_at, ends_at").eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!e) notFound();
  return (
    <div className="mx-auto max-w-sm pt-6">
      <Card>
        <CardBody className="space-y-5 py-6">
          <div className="text-center">
            <p className="text-[13px] text-ink-3">{chapter.organization_name}</p>
            <h1 className="mt-1 text-lg font-semibold text-ink">{e.title}</h1>
            <p className="text-[13px] text-ink-3 tnum">
              {formatTime(e.starts_at, chapter.timezone)} – {formatTime(e.ends_at, chapter.timezone, true)}
              {e.location ? ` · ${e.location}` : ""}
            </p>
          </div>
          {token ? (
            <CheckInButton action={checkIn.bind(null, slug, e.id, token)} eventHref={`/c/${slug}/events/${e.id}`} />
          ) : (
            <Notice tone="warning">This link is missing its check-in code. Scan the code on screen again.</Notice>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
