import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle2, CircleDot, GitCommitHorizontal, Mail, MessageSquare, RotateCcw, Tag, UserRound } from "lucide-react";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import {
  BUG_AREA_LABEL,
  BUG_SEVERITY_HINT,
  BUG_SEVERITY_LABEL,
  BUG_SEVERITY_TONE,
  BUG_STATUS_LABEL,
  BUG_STATUS_TONE,
  bugTitle,
  describeAgent,
  guessArea,
  isOpen,
  normalizePage,
  type BugArea,
  type BugSeverity,
  type BugStatus,
} from "@/lib/bugs";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { OUTREACH_ZONE, durationLabel, firstName } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";
import { addComment, deleteBug, emailReporter, logFix, reopenBug, updateTriage } from "../actions";
import { CommentForm, FixForm, ReporterEmailForm, TriageForm } from "../bug-forms";

type Report = {
  id: string;
  number: number;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  page: string;
  message: string;
  user_agent: string | null;
  viewport: string | null;
  build: string | null;
  status: BugStatus;
  severity: BugSeverity | null;
  area: BugArea | null;
  assignee_id: string | null;
  duplicate_of: string | null;
  fix_summary: string | null;
  fix_ref: string | null;
  fixed_at: string | null;
  fixed_by: string | null;
  closed_at: string | null;
  first_response_at: string | null;
  reporter_notified_at: string | null;
  created_at: string;
  chapter: { id: string; organization_name: string; slug: string } | null;
};

type Event = { id: string; kind: string; actor_id: string | null; from_value: string | null; to_value: string | null; body: string | null; ref: string | null; created_at: string };
type Related = { id: string; number: number; status: BugStatus; message: string; page: string; created_at: string; reporter_id: string | null; duplicate_of: string | null };

const EVENT_ICON: Record<string, typeof CircleDot> = {
  created: CircleDot,
  comment: MessageSquare,
  status: Tag,
  severity: Tag,
  area: Tag,
  assignee: UserRound,
  duplicate: Tag,
  fix: CheckCircle2,
  reopened: RotateCcw,
  reporter_emailed: Mail,
};

function when(value: string | null | undefined): string {
  return value ? formatDateTime(value, OUTREACH_ZONE) : "Not yet";
}

function statusLabel(value: string | null): string {
  return value ? BUG_STATUS_LABEL[value as BugStatus] ?? value : "none";
}

function RefLink({ value }: { value: string }) {
  return /^https?:\/\//i.test(value) ? (
    <a href={value} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-all font-mono text-[12px] text-accent underline-offset-2 hover:underline">
      {value.replace(/^https?:\/\/(www\.)?/, "")}
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </a>
  ) : (
    <span className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-2"><GitCommitHorizontal className="size-3.5" aria-hidden />{value}</span>
  );
}

export default async function BugReportPage({ params }: PageProps<"/admin/bugs/[id]">) {
  const { role } = await requireStaff(["support"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("bug_reports").select("*, chapter:chapters(id, organization_name, slug)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const report = data as unknown as Report;

  const [{ data: eventData }, { data: staffData }, { data: relatedData }] = await Promise.all([
    supabase.from("bug_report_events").select("id, kind, actor_id, from_value, to_value, body, ref, created_at").eq("report_id", id).order("created_at").order("id"),
    supabase.rpc("bug_assignees"),
    supabase.from("bug_reports").select("id, number, status, message, page, created_at, reporter_id, duplicate_of").neq("id", id).order("created_at", { ascending: false }).limit(1000),
  ]);
  const events = (eventData ?? []) as Event[];
  const staff = (staffData ?? []) as Array<{ user_id: string; name: string; role: string }>;
  const others = (relatedData ?? []) as Related[];
  const numbers = new Map(others.map((other) => [other.id, other.number]));
  const actorIds = [...new Set([...events.map((event) => event.actor_id), report.fixed_by].filter((value): value is string => Boolean(value)))];
  const { data: profileData } = actorIds.length ? await supabase.from("profiles").select("id, full_name, display_name").in("id", actorIds) : { data: [] };
  const names = new Map<string, string>([
    ...((profileData ?? []) as Array<{ id: string; full_name: string | null; display_name: string | null }>).map((profile) => [profile.id, profile.full_name || profile.display_name || "Someone"] as [string, string]),
    ...staff.map((person) => [person.user_id, person.name] as [string, string]),
  ]);
  const who = (actorId: string | null) => (actorId ? names.get(actorId) ?? (actorId === report.reporter_id ? report.reporter_name ?? "The reporter" : "Someone") : "System");

  const samePage = others.filter((other) => normalizePage(other.page) === normalizePage(report.page)).slice(0, 6);
  const sameReporter = report.reporter_id ? others.filter((other) => other.reporter_id === report.reporter_id).slice(0, 6) : [];
  const duplicates = others.filter((other) => other.duplicate_of === id);
  const duplicateNumber = report.duplicate_of ? numbers.get(report.duplicate_of) ?? null : null;
  const suggestedArea = guessArea(report.page);
  const fixed = report.status === "fixed";
  const sendingReady = Boolean(serverEnv.resendApiKey());
  const name = firstName(report.reporter_name);
  const draft = fixed
    ? {
        subject: `Bug #${report.number} is fixed`,
        body: [`Hi ${name ?? "there"},`, `Thanks for reporting the problem on ${report.page}. It's fixed now.`, report.fix_summary ?? "", "If you still see it, reply to this email and we'll take another look.", "Thanks,\nThe GreekGeek team"].filter(Boolean).join("\n\n"),
      }
    : {
        subject: `About your bug report (#${report.number})`,
        body: [`Hi ${name ?? "there"},`, `Thanks for reporting the problem on ${report.page}. We're looking into it and will let you know when it's fixed.`, "Thanks,\nThe GreekGeek team"].join("\n\n"),
      };

  const describe = (event: Event): ReactNode => {
    const actor = <span className="font-medium text-ink">{who(event.actor_id)}</span>;
    switch (event.kind) {
      case "created": return <>{actor} reported it</>;
      case "comment": return <>{actor} added a note</>;
      case "status": return <>{actor} moved it from {statusLabel(event.from_value)} to <span className="text-ink">{statusLabel(event.to_value)}</span></>;
      case "reopened": return <>{actor} reopened it as <span className="text-ink">{statusLabel(event.to_value)}</span> (was {statusLabel(event.from_value)})</>;
      case "fix": return <>{actor} logged a fix</>;
      case "severity": return event.to_value ? <>{actor} set severity to <span className="text-ink">{BUG_SEVERITY_LABEL[event.to_value as BugSeverity] ?? event.to_value}</span></> : <>{actor} cleared the severity</>;
      case "area": return event.to_value ? <>{actor} set the area to <span className="text-ink">{BUG_AREA_LABEL[event.to_value as BugArea] ?? event.to_value}</span></> : <>{actor} cleared the area</>;
      case "assignee": return event.to_value ? <>{actor} assigned it to <span className="text-ink">{who(event.to_value)}</span></> : <>{actor} unassigned it</>;
      case "duplicate": {
        const target = event.to_value ? numbers.get(event.to_value) : null;
        return <>{actor} marked it a duplicate of {target && event.to_value ? <Link href={`/admin/bugs/${event.to_value}`} className="text-accent hover:underline">#{target}</Link> : "another report"}</>;
      }
      case "reporter_emailed": return <>{actor} emailed the reporter</>;
      default: return <>{actor} {event.kind}</>;
    }
  };

  const facts: Array<[string, ReactNode]> = [
    ["Page", <a key="page" href={report.page.startsWith("/") ? report.page : "#"} target="_blank" rel="noreferrer" className="break-all font-mono text-[12px] text-accent underline-offset-2 hover:underline">{report.page}</a>],
    ["Reporter", report.reporter_email ? <a key="reporter" href={`mailto:${report.reporter_email}`} className="text-ink underline-offset-2 hover:underline">{report.reporter_name ?? report.reporter_email}</a> : report.reporter_name ?? "Account deleted"],
    ["Email", report.reporter_email ?? "None"],
    ["Chapter", report.chapter ? <Link key="chapter" href={`/admin/chapters/${report.chapter.id}`} className="text-ink hover:underline">{report.chapter.organization_name}</Link> : "Not on a chapter page"],
    ["Browser", <span key="browser" title={report.user_agent ?? undefined}>{describeAgent(report.user_agent)}</span>],
    ["Screen", report.viewport ? `${report.viewport.replace("x", " × ")}${Number(report.viewport.split("x")[0]) < 768 ? " · phone size" : ""}` : "Not recorded"],
    ["Build", report.build ? <span key="build" className="font-mono text-[12px]">{report.build}</span> : "Not recorded"],
    ["Reported", when(report.created_at)],
    ["First response", report.first_response_at ? `${when(report.first_response_at)} · after ${durationLabel(report.created_at, report.first_response_at)}` : "Waiting"],
    ["Reporter told", report.reporter_notified_at ? when(report.reporter_notified_at) : "Not yet"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/bugs" className="hover:text-ink">Bug reports</Link>}
        title={<span><span className="font-mono text-ink-3">#{report.number}</span> {bugTitle(report.message, 80)}</span>}
        description={`${report.reporter_name ?? report.reporter_email ?? "Unknown reporter"} · ${when(report.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {report.severity ? <Badge tone={BUG_SEVERITY_TONE[report.severity]}>{BUG_SEVERITY_LABEL[report.severity]}</Badge> : <Badge>Not rated</Badge>}
            <Badge tone={BUG_STATUS_TONE[report.status]}>{BUG_STATUS_LABEL[report.status]}</Badge>
          </div>
        }
      />
      {report.status === "duplicate" && report.duplicate_of ? (
        <Notice title="Duplicate">This is the same problem as <Link href={`/admin/bugs/${report.duplicate_of}`} className="underline">#{duplicateNumber ?? "another report"}</Link>. Work happens there.</Notice>
      ) : null}
      {fixed ? (
        <Notice tone="positive" title={`Fixed ${when(report.fixed_at)}${report.fixed_by ? ` by ${who(report.fixed_by)}` : ""}`}>
          {report.fix_summary ? <span className="whitespace-pre-wrap">{report.fix_summary}</span> : null}
          {report.fix_ref ? <span className="mt-1 block"><RefLink value={report.fix_ref} /></span> : null}
          <span className="mt-1 block text-[12px] opacity-80">Open for {durationLabel(report.created_at, report.fixed_at ?? report.created_at)} before the fix.</span>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="What they said" />
            <CardBody>
              <p className="whitespace-pre-wrap rounded-md border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink">{report.message}</p>
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label} className="flex min-w-0 items-start justify-between gap-3 border-b border-line py-1.5 sm:block sm:border-0 sm:py-0">
                    <dt className="shrink-0 text-[12px] text-ink-3">{label}</dt>
                    <dd className="min-w-0 text-right text-ink sm:text-left">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={fixed ? "Fix" : "Log a fix"}
              description={fixed ? "Edit the record of the fix. Changes are logged too." : "Record what changed and where. This closes the report as fixed and adds it to the activity log."}
              actions={!isOpen(report.status) ? (
                <form action={reopenBug.bind(null, id)}>
                  <SubmitButton size="sm" variant="ghost" pendingLabel="Reopening"><RotateCcw className="size-4" aria-hidden />Reopen</SubmitButton>
                </form>
              ) : null}
            />
            <CardBody>
              <FixForm action={logFix.bind(null, id)} summary={report.fix_summary} fixRef={report.fix_ref} fixed={fixed} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" description="Every change is recorded automatically and can't be edited. Times are Central." />
            <ol className="relative px-5 py-4">
              {events.map((event, index) => {
                const Icon = EVENT_ICON[event.kind] ?? CircleDot;
                const tone = event.kind === "fix" ? "text-positive" : event.kind === "reopened" ? "text-warning" : event.kind === "comment" || event.kind === "reporter_emailed" ? "text-accent" : "text-ink-3";
                return (
                  <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < events.length - 1 ? <span className="absolute left-[11px] top-6 bottom-0 w-px bg-line" aria-hidden /> : null}
                    <span className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface ${tone}`}><Icon className="size-3.5" aria-hidden /></span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[13px] text-ink-2">
                        {describe(event)}
                        <span className="ml-2 text-[12px] text-ink-3">{when(event.created_at)}</span>
                      </p>
                      {event.body && event.kind === "reporter_emailed" ? (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[12px] text-ink-3 hover:text-ink">Show email</summary>
                          <p className="mt-1.5 whitespace-pre-wrap rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-ink-2">{event.body}</p>
                        </details>
                      ) : event.body ? (
                        <p className="mt-1.5 whitespace-pre-wrap rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-ink">{event.body}</p>
                      ) : null}
                      {event.ref ? <p className="mt-1"><RefLink value={event.ref} /></p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            <CardBody className="border-t border-line">
              <CommentForm action={addComment.bind(null, id)} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Triage" description={report.severity ? BUG_SEVERITY_HINT[report.severity] : "Rate it so the worst bugs rise to the top."} />
            <CardBody>
              <TriageForm
                key={`${report.status}-${report.severity}-${report.area}-${report.assignee_id}`}
                action={updateTriage.bind(null, id)}
                status={report.status}
                severity={report.severity}
                area={report.area}
                suggestedArea={suggestedArea}
                assigneeId={report.assignee_id}
                assignees={staff}
                duplicateNumber={duplicateNumber}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Email the reporter" description={report.reporter_notified_at ? `Last emailed ${when(report.reporter_notified_at)}.` : fixed ? "Let them know it's fixed." : "Let them know you're on it."} />
            <CardBody>
              {!report.reporter_email ? (
                <p className="text-sm text-ink-3">No email address on this report.</p>
              ) : (
                <>
                  {!sendingReady ? <Notice tone="warning" className="mb-3">Sending is off because RESEND_API_KEY is not set.</Notice> : null}
                  <ReporterEmailForm key={report.status} action={emailReporter.bind(null, id)} to={report.reporter_email} subject={draft.subject} body={draft.body} disabled={!sendingReady} />
                </>
              )}
            </CardBody>
          </Card>

          {duplicates.length > 0 || samePage.length > 0 || sameReporter.length > 0 ? (
            <Card>
              <CardHeader title="Related" />
              <CardBody className="space-y-4">
                {[
                  { title: "Marked as duplicates of this", items: duplicates },
                  { title: "Same page", items: samePage },
                  { title: "Same reporter", items: sameReporter },
                ].filter((group) => group.items.length > 0).map((group) => (
                  <div key={group.title}>
                    <p className="text-[12px] text-ink-3">{group.title}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item.id} className="flex items-start justify-between gap-2 text-[13px]">
                          <Link href={`/admin/bugs/${item.id}`} className="min-w-0 truncate text-ink-2 hover:text-ink"><span className="font-mono text-ink-3">#{item.number}</span> {bugTitle(item.message, 48)}</Link>
                          <Badge tone={BUG_STATUS_TONE[item.status]}>{BUG_STATUS_LABEL[item.status]}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {role === "admin" ? (
            <form action={deleteBug.bind(null, id)} className="px-1">
              <ConfirmSubmit message="Delete this report and its whole activity log? Use this only for spam." variant="ghost">Delete report</ConfirmSubmit>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
