import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Lock, TriangleAlert } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Notice, PageHeader, TextLink } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS, EVENT_LABEL, INTENDED_ROLES, VERIFICATION_METHOD_LABEL, type ApplicationKind, type ApplicationStatus, type VerificationMethod } from "@/lib/applications";
import { addInternalNote, reviewApplication } from "../../actions";
import { DecisionForm, NoteForm } from "./review-forms";

type App = {
  id: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  applicant_id: string;
  applicant_full_name: string | null;
  intended_role: string | null;
  organization_name: string | null;
  designation: string | null;
  greek_letters: string | null;
  proposed_university_name: string | null;
  verification_method: VerificationMethod | null;
  institutional_email: string | null;
  institutional_email_verified_at: string | null;
  national_contact_name: string | null;
  national_contact_email: string | null;
  fsl_contact_name: string | null;
  fsl_contact_email: string | null;
  officer_statement: string | null;
  duplicate_candidates: Array<{ type: "chapter" | "application"; id: string; name: string; status: string }>;
  appeal_count: number;
  submitted_at: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_chapter_id: string | null;
  university: { name: string; email_domains: string[] } | null;
  existing: { organization_name: string; designation: string | null; status: string } | null;
  applicant: { display_name: string | null; full_name: string | null } | null;
};

const EVIDENCE_KIND: Record<string, string> = { officer_roster: "Officer roster", national_letter: "National letter", fsl_letter: "FSL letter", election_minutes: "Election minutes", other: "Other" };

export default async function ReviewApplicationPage({ params }: PageProps<"/admin/verification/[id]">) {
  const { id } = await params;
  const { user } = await requireStaff(["reviewer"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("chapter_applications")
    .select("*, university:universities(name, email_domains), existing:chapters!chapter_applications_existing_chapter_id_fkey(organization_name, designation, status), applicant:profiles!chapter_applications_applicant_id_fkey(display_name, full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const app = data as unknown as App;
  const [{ data: evidenceRows }, { data: eventRows }] = await Promise.all([
    supabase.from("verification_evidence").select("id, storage_path, file_name, mime_type, size_bytes, kind, created_at").eq("application_id", app.id).order("created_at"),
    supabase.from("verification_events").select("id, kind, message, visibility, created_at, actor:profiles(display_name, full_name)").eq("application_id", app.id).order("created_at"),
  ]);
  const evidence = await Promise.all(
    ((evidenceRows ?? []) as Array<{ id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; kind: string; created_at: string }>).map(async (e) => {
      const { data: signed } = await supabase.storage.from("verification-evidence").createSignedUrl(e.storage_path, 300);
      return { ...e, url: signed?.signedUrl ?? null };
    }),
  );
  const events = (eventRows ?? []) as unknown as Array<{ id: number; kind: string; message: string | null; visibility: string; created_at: string; actor: { display_name: string | null; full_name: string | null } | null }>;
  const s = APPLICATION_STATUS[app.status];
  const title = app.kind === "new_chapter" ? [app.organization_name, app.designation].filter(Boolean).join(", ") : app.existing ? [app.existing.organization_name, app.existing.designation].filter(Boolean).join(", ") : "Application";
  const ownApplication = app.applicant_id === user.id;
  const emailDomain = app.institutional_email?.split("@")[1]?.toLowerCase();
  const domainOnFile = Boolean(emailDomain && app.university?.email_domains?.some((d) => emailDomain === d || emailDomain.endsWith(`.${d}`)));
  const reviewable = app.status === "pending_verification" || app.status === "info_requested";
  const applicantName = app.applicant?.full_name ?? app.applicant_full_name ?? app.applicant?.display_name ?? "Applicant";
  const role = INTENDED_ROLES.find((r) => r.value === app.intended_role)?.label ?? "Not given";

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/admin/verification">Verification queue</TextLink>}
        title={title}
        description={`${APPLICATION_KIND_LABEL[app.kind]} · submitted ${app.submitted_at ? formatDateTime(app.submitted_at) : "never"}`}
        actions={<Badge tone={s.tone}>{s.label}</Badge>}
      />
      {app.duplicate_candidates?.length ? (
        <Notice tone="warning" title="Possible duplicate" className="mb-6">
          <ul className="mt-1 space-y-0.5">
            {app.duplicate_candidates.map((d) => (
              <li key={`${d.type}:${d.id}`}>
                {d.type === "application" ? <Link href={`/admin/verification/${d.id}`} className="underline">{d.name || "Application"}</Link> : d.name} ({d.type}, {d.status.replace(/_/g, " ")})
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {app.kind !== "new_chapter" ? (
        <Notice tone="info" title={app.kind === "recovery" ? "Administrator recovery" : "Claim of a listed chapter"} className="mb-6">
          Approving grants full administrator access to an existing chapter{app.existing ? ` (currently ${app.existing.status})` : ""}. Confirm the applicant&apos;s officer status independently before verifying.
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Applicant" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: "Name", value: applicantName },
                  { label: "Officer role", value: role },
                  { label: "School", value: app.university?.name ?? (app.proposed_university_name ? <span>{app.proposed_university_name} <Badge tone="warning">New school</Badge></span> : "None") },
                  { label: "Organization", value: [app.organization_name, app.greek_letters].filter(Boolean).join(" · ") || "From the listed chapter" },
                  { label: "Statement", value: app.officer_statement ? <span className="whitespace-pre-wrap">{app.officer_statement}</span> : "None" },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Verification" description={app.verification_method ? VERIFICATION_METHOD_LABEL[app.verification_method] : "No method chosen"} />
            <CardBody className="space-y-4">
              <DefinitionList
                items={[
                  ...(app.institutional_email
                    ? [
                        {
                          label: "School email",
                          value: (
                            <span className="flex flex-wrap items-center gap-2">
                              {app.institutional_email}
                              {app.institutional_email_verified_at ? <Badge tone="positive">Code confirmed</Badge> : <Badge tone="warning">Not confirmed</Badge>}
                              {domainOnFile ? <Badge tone="positive">Domain on file</Badge> : <Badge tone="warning">Domain not on file</Badge>}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  ...(app.national_contact_email ? [{ label: "National contact", value: `${app.national_contact_name ?? ""} <${app.national_contact_email}>` }] : []),
                  ...(app.fsl_contact_email ? [{ label: "FSL contact", value: `${app.fsl_contact_name ?? ""} <${app.fsl_contact_email}>` }] : []),
                ]}
              />
              {app.verification_method === "national_organization" || app.verification_method === "university_fsl" ? (
                <p className="text-[13px] text-ink-3">Contact this person through a channel you find independently, such as the organization&apos;s or school&apos;s published directory, rather than replying to the address given.</p>
              ) : null}
              {evidence.length ? (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {evidence.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                        <span className="truncate">{e.file_name}</span>
                        <Badge>{EVIDENCE_KIND[e.kind] ?? e.kind}</Badge>
                      </span>
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-accent hover:underline">
                          Open
                        </a>
                      ) : (
                        <span className="text-[12px] text-ink-3">Unavailable</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">No documents uploaded.</p>
              )}
              {evidence.length ? <p className="text-[12px] text-ink-3">Links expire after five minutes. Documents are not downloaded to this server.</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <CardBody className="space-y-4">
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{e.kind === "applicant_response" ? "Applicant responded" : EVENT_LABEL[e.kind] ?? e.kind}</span>
                      {e.visibility === "internal" ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-warning">
                          <Lock className="size-3" aria-hidden />
                          Internal
                        </span>
                      ) : null}
                      <span className="text-[12px] text-ink-3">
                        {formatDateTime(e.created_at)}
                        {e.actor ? ` · ${e.actor.full_name ?? e.actor.display_name}` : ""}
                      </span>
                    </p>
                    {e.message ? <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-2">{e.message}</p> : null}
                  </li>
                ))}
              </ol>
              <NoteForm action={addInternalNote.bind(null, app.id)} />
            </CardBody>
          </Card>
        </div>
        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="Decision" />
            <CardBody>
              {ownApplication ? (
                <Notice tone="warning">
                  <span className="inline-flex items-center gap-1">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    You submitted this application, so another reviewer must decide it.
                  </span>
                </Notice>
              ) : reviewable ? (
                <DecisionForm action={reviewApplication.bind(null, app.id)} canSuspend={false} />
              ) : app.status === "verified" ? (
                <div className="space-y-4">
                  <p className="text-sm text-ink-2">Verified {app.decided_at ? formatDateTime(app.decided_at) : ""}. Suspend only for fraud or a confirmed misrepresentation.</p>
                  <DecisionForm action={reviewApplication.bind(null, app.id)} canSuspend />
                </div>
              ) : (
                <p className="text-sm text-ink-2">
                  {s.label}
                  {app.decided_at ? ` ${formatDateTime(app.decided_at)}` : ""}.{app.decision_reason ? ` Reason given: ${app.decision_reason}` : ""}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
