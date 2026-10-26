import { notFound } from "next/navigation";
import { personName } from "@/components/people";
import { SimpleForm } from "@/components/simple-form";
import { Badge, Card, CardBody, CardHeader, DefinitionList, PageHeader, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { INCIDENT_CATEGORY, INCIDENT_STATUS } from "../../labels";
import { addCaseNote, setIncidentStatus } from "../../actions";
import { loadIncidents } from "../data";

export default async function IncidentPage({ params }: PageProps<"/c/[slug]/standards/incidents/[incidentId]">) {
  const { slug, incidentId } = await params;
  const { ctx, incidents } = await loadIncidents(slug);
  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident) notFound();
  const tz = ctx.chapter.timezone;
  const supabase = await createClient();
  const { data: noteRows } = await supabase
    .from("incident_case_notes")
    .select("id, body, created_at, author:profiles!incident_case_notes_author_id_fkey(display_name, full_name)")
    .eq("incident_id", incident.id)
    .order("created_at");
  const notes = (noteRows ?? []) as unknown as Array<{ id: string; body: string; created_at: string; author: { display_name: string | null; full_name: string | null } | null }>;

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/standards/incidents`}>Incident reports</TextLink>}
        title={INCIDENT_CATEGORY[incident.category] ?? incident.category}
        description={`Filed ${formatDateTime(incident.created_at, tz)}`}
        actions={<Badge tone={INCIDENT_STATUS[incident.status].tone}>{INCIDENT_STATUS[incident.status].label}</Badge>}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <Card>
            <CardBody className="space-y-5">
              <DefinitionList
                items={[
                  { label: "Reported by", value: incident.reporter_name ?? "Confidential" },
                  { label: "When", value: incident.occurred_at ? formatDateTime(incident.occurred_at, tz) : "Not given" },
                  { label: "Where", value: incident.location ?? "Not given" },
                ]}
              />
              <div>
                <h2 className="text-[13px] font-medium text-ink-3">What happened</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{incident.description}</p>
              </div>
              {incident.people_involved ? (
                <div>
                  <h2 className="text-[13px] font-medium text-ink-3">People involved</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{incident.people_involved}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Case notes" description="Visible to standards officers only. Notes cannot be edited or deleted." />
            {notes.length ? (
              <ul className="divide-y divide-line">
                {notes.map((n) => (
                  <li key={n.id} className="px-5 py-3">
                    <p className="text-[12px] text-ink-3">
                      {n.author ? personName(n.author) : "Former officer"} · {formatDateTime(n.created_at, tz)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            <CardBody className={notes.length ? "border-t border-line" : undefined}>
              <SimpleForm action={addCaseNote.bind(null, slug, incident.id)} submitLabel="Add note" fields={[{ name: "body", label: "Note", type: "textarea", maxLength: 4000 }]} />
            </CardBody>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader title="Status" description={`Retained until at least ${formatDate(new Date(new Date(incident.created_at).getTime() + 7 * 365.25 * 86400_000), tz)}`} />
            <CardBody>
              <SimpleForm
                action={setIncidentStatus.bind(null, slug, incident.id)}
                submitLabel="Update status"
                resetOnSuccess={false}
                fields={[{ name: "status", label: "Status", type: "select", defaultValue: incident.status, options: Object.entries(INCIDENT_STATUS).map(([value, s]) => ({ value, label: s.label })) }]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
