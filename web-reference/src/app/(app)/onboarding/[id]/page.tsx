import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleDot } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, DefinitionList, Notice, PageHeader, cx } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { getStaffRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  APPLICATION_KIND_LABEL,
  APPLICATION_STATUS,
  EVENT_LABEL,
  INTENDED_ROLES,
  VERIFICATION_METHOD_LABEL,
  isEditable,
  type ApplicationKind,
  type ApplicationStatus,
  type VerificationMethod,
} from "@/lib/applications";
import {
  respondToApplication,
  saveApplicant,
  saveChapter,
  saveVerification,
  sendEmailCode,
  submitApplication,
  uploadEvidence,
  verifyEmailCode,
  withdrawApplication,
} from "../actions";
import { ApplicantForm, ChapterForm, EvidenceUpload, RespondForm, SubmitForm, VerificationForm } from "./step-forms";
import { UniversityPicker } from "./university-picker";

export const metadata: Metadata = { title: "Chapter application" };

type Application = {
  id: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  current_step: number;
  applicant_full_name: string | null;
  intended_role: string | null;
  university_id: string | null;
  proposed_university_name: string | null;
  existing_chapter_id: string | null;
  organization_name: string | null;
  designation: string | null;
  greek_letters: string | null;
  verification_method: VerificationMethod | null;
  institutional_email: string | null;
  institutional_email_verified_at: string | null;
  national_contact_name: string | null;
  national_contact_email: string | null;
  fsl_contact_name: string | null;
  fsl_contact_email: string | null;
  officer_statement: string | null;
  appeal_count: number;
  submitted_at: string | null;
  decision_reason: string | null;
  created_chapter_id: string | null;
  university: { name: string; email_domains: string[] } | null;
};

const STEPS = ["About you", "Chapter", "Verification", "Review"];

export default async function ApplicationPage({ params, searchParams }: PageProps<"/onboarding/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const [user, staffRole] = await Promise.all([requireUser(`/onboarding/${id}`), getStaffRole()]);
  const admin = staffRole === "admin";
  const supabase = await createClient();
  const { data } = await supabase
    .from("chapter_applications")
    .select("*, university:universities(name, email_domains)")
    .eq("id", id)
    .eq("applicant_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const app = data as unknown as Application;
  const s = APPLICATION_STATUS[app.status];
  const title = [app.organization_name, app.designation].filter(Boolean).join(", ") || APPLICATION_KIND_LABEL[app.kind];

  const { data: evidenceRows } = await supabase
    .from("verification_evidence")
    .select("id, file_name, kind")
    .eq("application_id", app.id)
    .order("created_at");
  const evidence = (evidenceRows ?? []) as Array<{ id: string; file_name: string; kind: string }>;

  if (!isEditable(app.status)) {
    return <StatusView app={app} title={title} evidence={evidence} />;
  }

  const requested = Number(typeof sp.step === "string" ? sp.step : app.current_step);
  const step = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), Math.min(app.current_step, 4));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={<Link href="/home" className="hover:text-ink">Home</Link>}
        title={title}
        description={APPLICATION_KIND_LABEL[app.kind]}
        actions={<Badge tone={s.tone}>{s.label}</Badge>}
      />
      {app.status === "info_requested" ? (
        <Notice tone="warning" title="The reviewer asked for more information" className="mb-6">
          <ReviewerRequest applicationId={app.id} />
        </Notice>
      ) : null}
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Application steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const reachable = n <= app.current_step;
          const done = n < app.current_step;
          const content = (
            <>
              <span className={cx("h-1 rounded-full transition-colors duration-300 ease-out", n === step ? "bg-accent" : done ? "bg-accent/40" : "bg-line")} />
              <span className={cx("mt-2 flex items-center gap-1.5 text-[13px]", n === step ? "font-medium text-ink" : "text-ink-3")}>
                {done ? <Check className="size-3.5" aria-hidden /> : null}
                {label}
              </span>
            </>
          );
          return (
            <li key={label}>
              {reachable && n !== step ? (
                <Link href={`/onboarding/${app.id}?step=${n}`} className="flex flex-col hover:[&>span:last-child]:text-ink">{content}</Link>
              ) : (
                <span className="flex flex-col" aria-current={n === step ? "step" : undefined}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>

      <Card key={`${step}-${typeof sp.uni === "string" ? sp.uni : ""}`} className="step-in">
        {step === 1 ? (
          <>
            <CardHeader title="About you" description="The person submitting this application becomes the chapter's first administrator." />
            <CardBody>
              <ApplicantForm
                action={saveApplicant.bind(null, app.id)}
                defaults={{ applicant_full_name: app.applicant_full_name ?? "", intended_role: app.intended_role ?? "" }}
              />
            </CardBody>
          </>
        ) : null}
        {step === 2 ? <ChapterStep app={app} query={typeof sp.q === "string" ? sp.q : ""} uni={typeof sp.uni === "string" ? sp.uni : ""} changing={sp.change === "1" || typeof sp.q === "string"} /> : null}
        {step === 3 ? (
          <>
            <CardHeader
              title="Verification"
              description={admin ? "Platform administrators skip verification. The chapter is created when you submit." : "Choose how a reviewer can confirm that you hold an officer position in this chapter."}
            />
            <CardBody>
              {app.university?.email_domains?.length && !admin ? (
                <p className="mb-4 text-[13px] text-ink-3">
                  School email is available for {app.university.name}: {app.university.email_domains.map((d) => `@${d}`).join(", ")}.
                </p>
              ) : null}
              <VerificationForm
                action={saveVerification.bind(null, app.id)}
                sendCode={sendEmailCode.bind(null, app.id)}
                verifyCode={verifyEmailCode.bind(null, app.id)}
                upload={uploadEvidence.bind(null, app.id)}
                emailVerified={Boolean(app.institutional_email_verified_at)}
                evidence={evidence}
                skipped={admin}
                defaults={{
                  verification_method: app.verification_method ?? "",
                  institutional_email: app.institutional_email ?? "",
                  national_contact_name: app.national_contact_name ?? "",
                  national_contact_email: app.national_contact_email ?? "",
                  fsl_contact_name: app.fsl_contact_name ?? "",
                  fsl_contact_email: app.fsl_contact_email ?? "",
                  officer_statement: app.officer_statement ?? "",
                }}
              />
            </CardBody>
          </>
        ) : null}
        {step === 4 ? <ReviewStep app={app} evidenceCount={evidence.length} admin={admin} /> : null}
      </Card>

      <form action={withdrawApplication.bind(null, app.id)} className="mt-6 flex justify-end">
        <ConfirmSubmit message="Withdraw this application? You can start a new one later." variant="ghost">
          Withdraw application
        </ConfirmSubmit>
      </form>
    </main>
  );
}

async function ReviewerRequest({ applicationId }: { applicationId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("verification_events")
    .select("message")
    .eq("application_id", applicationId)
    .eq("kind", "info_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return <p className="whitespace-pre-line">{data?.message ?? "Update your application and resubmit it."}</p>;
}

async function ChapterStep({ app, query, uni, changing }: { app: Application; query: string; uni: string; changing: boolean }) {
  const supabase = await createClient();
  const selected = uni || app.university_id || (app.proposed_university_name ? "other" : "");
  const [{ data: selectedUni }, { data: orgs }] = await Promise.all([
    selected && selected !== "other" ? supabase.from("universities").select("id, name, city, state, email_domains").eq("id", selected).maybeSingle() : Promise.resolve({ data: null }),
    app.kind === "new_chapter" ? supabase.from("national_organizations").select("name").order("name").limit(500) : Promise.resolve({ data: [] as Array<{ name: string }> }),
  ]);
  let chapters: Array<{ id: string; name: string; status: string }> = [];
  if (app.kind !== "new_chapter" && selected && selected !== "other") {
    const { data } = await supabase
      .from("chapters")
      .select("id, organization_name, designation, status")
      .eq("university_id", selected)
      .in("status", app.kind === "claim_existing" ? ["unclaimed"] : ["verified", "unclaimed"])
      .order("organization_name");
    chapters = (data ?? []).map((c) => ({ id: c.id, name: [c.organization_name, c.designation].filter(Boolean).join(", "), status: c.status }));
  }
  const showPicker = !selected || changing;

  return (
    <>
      <CardHeader title="Your chapter" description="Tell us which university and organization this chapter belongs to." />
      <CardBody className="space-y-6">
        <section>
          <h3 className="text-[13px] font-medium text-ink">University</h3>
          {selected && !changing ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-line bg-canvas px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm text-ink">
                  {selected === "other" ? "My university is not listed" : selectedUni ? `${selectedUni.name}${selectedUni.city ? ` · ${selectedUni.city}, ${selectedUni.state ?? ""}` : ""}` : "Selected university"}
                </span>
                {selectedUni?.email_domains?.length ? (
                  <span className="block truncate text-[12px] text-ink-3">School email: {(selectedUni.email_domains as string[]).map((d) => `@${d}`).join(", ")}</span>
                ) : null}
              </span>
              <Link href={`/onboarding/${app.id}?step=2&change=1`} className="text-[13px] text-accent hover:underline">Change</Link>
            </div>
          ) : null}
          {showPicker ? <UniversityPicker applicationId={app.id} allowOther={app.kind === "new_chapter"} initialQuery={query} /> : null}
        </section>
        {selected && !changing ? (
          <ChapterForm
            action={saveChapter.bind(null, app.id)}
            kind={app.kind}
            universityId={selected}
            proposedUniversity={app.proposed_university_name ?? ""}
            chapters={chapters}
            organizations={(orgs ?? []).map((o) => o.name)}
            defaults={{
              organization_name: app.organization_name ?? "",
              designation: app.designation ?? "",
              greek_letters: app.greek_letters ?? "",
              existing_chapter_id: app.existing_chapter_id ?? "",
            }}
          />
        ) : null}
      </CardBody>
    </>
  );
}

async function ReviewStep({ app, evidenceCount, admin }: { app: Application; evidenceCount: number; admin: boolean }) {
  const supabase = await createClient();
  let duplicates: Array<{ type: string; name: string; status: string }> = [];
  if (app.university_id && app.kind === "new_chapter") {
    const { data } = await supabase.rpc("check_chapter_duplicates", {
      p_university: app.university_id,
      p_organization: app.organization_name,
      p_designation: app.designation,
    });
    duplicates = ((data as typeof duplicates | null) ?? []).filter((d) => !(d.type === "application" && d.status === "draft"));
  }
  const method = app.verification_method;
  const problems: string[] = [];
  if (!app.applicant_full_name || !app.intended_role) problems.push("Add your name and position.");
  if (!app.university_id && !app.proposed_university_name) problems.push("Choose a university.");
  if (app.kind === "new_chapter" && !app.organization_name) problems.push("Enter your organization.");
  if (app.kind !== "new_chapter" && !app.existing_chapter_id) problems.push("Choose the chapter you are claiming.");
  if (!admin) {
    if (!method) problems.push("Choose a verification method.");
    if (method === "institutional_email" && !app.institutional_email_verified_at) problems.push("Confirm your school email.");
    if (method === "officer_documentation" && evidenceCount === 0) problems.push("Upload at least one document.");
    if (method === "national_organization" && !app.national_contact_email) problems.push("Add a national organization contact.");
    if (method === "university_fsl" && !app.fsl_contact_email) problems.push("Add an FSL office contact.");
  }

  const role = INTENDED_ROLES.find((r) => r.value === app.intended_role)?.label ?? "Not set";
  return (
    <>
      <CardHeader
        title="Review and submit"
        description={admin ? "Submitting creates the chapter immediately. Verification is skipped for platform administrators." : "A reviewer checks every application. You will be notified by email when a decision is made."}
      />
      <CardBody className="space-y-5">
        <DefinitionList
          items={[
            { label: "Applicant", value: `${app.applicant_full_name ?? "Not set"} · ${role}` },
            { label: "University", value: app.university?.name ?? app.proposed_university_name ?? "Not set" },
            { label: "Chapter", value: [app.organization_name, app.designation].filter(Boolean).join(", ") || "Not set" },
            { label: "Greek letters", value: app.greek_letters || "None" },
            {
              label: "Verification",
              value: method ? (
                <span className="flex flex-wrap items-center gap-2">
                  {VERIFICATION_METHOD_LABEL[method]}
                  {method === "institutional_email" && app.institutional_email_verified_at ? <Badge tone="positive">{app.institutional_email}</Badge> : null}
                  {method === "officer_documentation" ? <span className="text-ink-3">{evidenceCount} document{evidenceCount === 1 ? "" : "s"}</span> : null}
                </span>
              ) : (
                "Not set"
              ),
            },
          ]}
        />
        {duplicates.length > 0 ? (
          <Notice tone="warning" title="This may duplicate an existing chapter">
            <ul className="list-disc pl-4">
              {duplicates.map((d, i) => (
                <li key={i}>{d.name} ({d.type === "chapter" ? `listed chapter, ${d.status}` : "another application"})</li>
              ))}
            </ul>
            <p className="mt-1">If this is your chapter, withdraw and start a claim or recovery application instead. Otherwise, explain the difference in your verification notes.</p>
          </Notice>
        ) : null}
        {problems.length > 0 ? (
          <Notice tone="info" title="Finish these before submitting">
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        ) : (
          <SubmitForm action={submitApplication.bind(null, app.id)} needsResponse={app.status === "info_requested"} confirmLabel={admin ? "Create chapter" : undefined} />
        )}
      </CardBody>
    </>
  );
}

async function StatusView({ app, title, evidence }: { app: Application; title: string; evidence: Array<{ id: string; file_name: string; kind: string }> }) {
  const supabase = await createClient();
  const [{ data: events }, { data: chapter }] = await Promise.all([
    supabase.from("verification_events").select("id, kind, message, created_at").eq("application_id", app.id).order("created_at"),
    app.created_chapter_id ? supabase.from("chapters").select("slug").eq("id", app.created_chapter_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = APPLICATION_STATUS[app.status];
  const timeline = (events ?? []) as Array<{ id: number; kind: string; message: string | null; created_at: string }>;
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow={<Link href="/home" className="hover:text-ink">Home</Link>} title={title} description={APPLICATION_KIND_LABEL[app.kind]} actions={<Badge tone={s.tone}>{s.label}</Badge>} />

      {app.status === "pending_verification" ? (
        <Notice tone="info" title="Your application is with a reviewer" className="mb-6">
          Most applications are reviewed within two business days. We will email you when there is a decision or a question.
        </Notice>
      ) : null}
      {app.status === "verified" && chapter ? (
        <Notice tone="positive" title="Your chapter is verified" className="mb-6" action={<ButtonLink href={`/c/${chapter.slug}`} size="sm">Open chapter</ButtonLink>}>
          Next, review the chapter agreement, activate the subscription, and connect Stripe to start collecting dues.
        </Notice>
      ) : null}
      {app.status === "rejected" ? (
        <Notice tone="danger" title="Your application was not approved" className="mb-6">
          <p className="whitespace-pre-line">{app.decision_reason}</p>
        </Notice>
      ) : null}
      {app.status === "suspended" ? (
        <Notice tone="danger" title="This chapter is suspended" className="mb-6">
          <p className="whitespace-pre-line">{app.decision_reason}</p>
        </Notice>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader title="Activity" />
          <CardBody>
            <ol className="space-y-4">
              {timeline.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <CircleDot className={cx("mt-0.5 size-4 shrink-0", e.kind === "approved" ? "text-positive" : e.kind === "rejected" ? "text-danger" : "text-ink-3")} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{EVENT_LABEL[e.kind] ?? e.kind}</p>
                    <p className="text-[12px] text-ink-3">{fmt.format(new Date(e.created_at))}</p>
                    {e.message && e.kind !== "email_verified" ? <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{e.message}</p> : null}
                  </div>
                </li>
              ))}
              {timeline.length === 0 ? <li className="text-sm text-ink-3">No activity yet.</li> : null}
            </ol>
          </CardBody>
          {app.status === "pending_verification" || (app.status === "rejected" && app.appeal_count < 2) ? (
            <CardBody className="border-t border-line">
              <RespondForm action={respondToApplication.bind(null, app.id)} appeal={app.status === "rejected"} />
            </CardBody>
          ) : null}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardBody>
              <DefinitionList
                items={[
                  { label: "University", value: app.university?.name ?? app.proposed_university_name ?? "" },
                  { label: "Method", value: app.verification_method ? VERIFICATION_METHOD_LABEL[app.verification_method] : "" },
                  { label: "Submitted", value: app.submitted_at ? fmt.format(new Date(app.submitted_at)) : "" },
                ]}
              />
            </CardBody>
          </Card>
          {app.status === "pending_verification" ? <EvidenceUpload upload={uploadEvidence.bind(null, app.id)} evidence={evidence} /> : null}
          {app.status === "pending_verification" ? (
            <form action={withdrawApplication.bind(null, app.id)}>
              <ConfirmSubmit message="Withdraw this application? You can start a new one later." variant="ghost">Withdraw application</ConfirmSubmit>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}
