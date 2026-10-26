import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge, Card, EmptyState, Notice, PageHeader, TextLink } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { INCIDENT_CATEGORY, INCIDENT_STATUS } from "../labels";
import { loadIncidents } from "./data";

export default async function IncidentsPage({ params }: PageProps<"/c/[slug]/standards/incidents">) {
  const { slug } = await params;
  const { ctx, incidents, error } = await loadIncidents(slug);
  const open = incidents.filter((i) => i.status === "submitted" || i.status === "under_review");
  const done = incidents.filter((i) => i.status === "resolved" || i.status === "closed");
  return (
    <>
      <PageHeader eyebrow={<TextLink href={`/c/${slug}/standards`}>Standards</TextLink>} title="Incident reports" description="Viewing this list is recorded in the chapter audit log." />
      {error ? (
        <Notice tone="danger" title="Reports could not be loaded" className="mb-6">
          {error}
        </Notice>
      ) : null}
      <Notice tone="info" className="mb-6">
        Reports are retained for seven years. Case notes are permanent once added. Handle them according to your university and national organization policies.
      </Notice>
      {incidents.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title="No reports">Reports filed by members will appear here.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {[
            { title: "Open", rows: open },
            { title: "Resolved and closed", rows: done },
          ]
            .filter((g) => g.rows.length)
            .map((g) => (
              <section key={g.title}>
                <h2 className="mb-3 text-sm font-semibold text-ink">{g.title}</h2>
                <Card>
                  <ul className="divide-y divide-line">
                    {g.rows.map((i) => (
                      <li key={i.id}>
                        <Link href={`/c/${slug}/standards/incidents/${i.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{INCIDENT_CATEGORY[i.category] ?? i.category}</p>
                            <p className="line-clamp-1 max-w-xl text-[12px] text-ink-3">
                              Filed {formatDate(i.created_at, ctx.chapter.timezone)} · {i.reporter_name ?? "Confidential reporter"} · {Number(i.note_count)} notes
                            </p>
                          </div>
                          <Badge tone={INCIDENT_STATUS[i.status].tone}>{INCIDENT_STATUS[i.status].label}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
