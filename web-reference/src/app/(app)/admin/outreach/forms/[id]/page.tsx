import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Inbox } from "lucide-react";
import { SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { FORM_HELP_LABEL, FORM_INTEREST_LABEL, FORM_STATUSES, FORM_STATUS_LABEL, FORM_STATUS_TONE, OUTREACH_ZONE, durationLabel, formReplyEmail, type FormStatus } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";
import { SendForm } from "../../forms";
import { markFormUnread, replyToForm, saveFormNotes, setFormStatus } from "../actions";
import { NotesForm } from "../notes-form";

const BASE = "id, created_at, full_name, role, organization, council, member_count, in_house, out_of_house, dues, email, phone, prefer_email, prefer_text, prefer_call, best_time, interest, help, notes, university_id, university:universities(id, name, city, state)";

type Response = {
  id: string;
  created_at: string;
  full_name: string;
  role: string;
  organization: string;
  council: string | null;
  member_count: number | null;
  in_house: number | null;
  out_of_house: number | null;
  dues: string | null;
  email: string;
  phone: string | null;
  prefer_email: boolean;
  prefer_text: boolean;
  prefer_call: boolean;
  best_time: string | null;
  interest: string;
  help: string[];
  notes: string | null;
  university_id: string;
  university: { id: string; name: string; city: string | null; state: string | null } | null;
  status?: FormStatus;
  read_at?: string | null;
  admin_notes?: string | null;
  status_changed_at?: string | null;
  contact_id?: string | null;
};

type Entry = { id: string; direction: "sent" | "reply"; subject: string; body: string; status: string; occurred_at: string; opened_at: string | null; logged_by_hand: boolean };

function when(value: string | null | undefined): string {
  return value ? formatDateTime(value, OUTREACH_ZONE) : "No data";
}

function count(value: number | null): string {
  return value == null ? "Not given" : value.toLocaleString("en-US");
}

export default async function FormResponsePage({ params }: PageProps<"/admin/outreach/forms/[id]">) {
  await requireStaff([]);
  const { id } = await params;
  const supabase = await createClient();
  const full = await supabase.from("intro_responses").select(`${BASE}, status, read_at, admin_notes, status_changed_at, contact_id`).eq("id", id).maybeSingle();
  const migrationMissing = Boolean(full.error);
  const loaded = migrationMissing ? await supabase.from("intro_responses").select(BASE).eq("id", id).maybeSingle() : full;
  if (!loaded.data) notFound();
  const response = loaded.data as unknown as Response;
  const status: FormStatus = response.status ?? "new";
  if (!migrationMissing && !response.read_at) {
    await supabase.from("intro_responses").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  }

  const contactQuery = response.contact_id
    ? supabase.from("outreach_contacts").select("id, do_not_contact, emails_sent, replies").eq("id", response.contact_id).maybeSingle()
    : supabase.from("outreach_contacts").select("id, do_not_contact, emails_sent, replies").eq("email_normalized", response.email.trim().toLowerCase()).maybeSingle();
  const [{ data: contact }, { data: siblings }] = await Promise.all([
    contactQuery,
    supabase.from("intro_responses").select("id, created_at").order("created_at", { ascending: false }).limit(2000),
  ]);
  const { data: entryData } = contact
    ? await supabase.from("outreach_emails").select("id, direction, subject, body, status, occurred_at, opened_at, logged_by_hand").eq("contact_id", contact.id).order("occurred_at", { ascending: false }).limit(50)
    : { data: [] };
  const entries = (entryData ?? []) as Entry[];
  const order = (siblings ?? []).map((row) => row.id as string);
  const position = order.indexOf(id);
  const newer = position > 0 ? order[position - 1] : null;
  const older = position >= 0 && position < order.length - 1 ? order[position + 1] : null;

  const school = response.university?.name ?? "Unknown school";
  const draft = formReplyEmail(response, school);
  const sendingReady = Boolean(serverEnv.resendApiKey());
  const blocked = Boolean(contact?.do_not_contact);
  const ways = [response.prefer_email && "Email", response.prefer_text && "Text", response.prefer_call && "Phone call"].filter(Boolean).join(", ");
  const firstSent = entries.filter((entry) => entry.direction === "sent" && entry.status !== "failed").map((entry) => entry.occurred_at).sort()[0];

  const answers: Array<[string, ReactNode]> = [
    ["Council", response.council ?? "Not given"],
    ["Total members", count(response.member_count)],
    ["In the house", count(response.in_house)],
    ["Out of the house", count(response.out_of_house)],
    ["Dues", response.dues ?? "Not given"],
    ["Interest", <Badge key="interest" tone={response.interest === "demo" ? "positive" : response.interest === "later" ? "neutral" : "info"}>{FORM_INTEREST_LABEL[response.interest] ?? response.interest}</Badge>],
    [
      "Wants help with",
      response.help.length > 0 ? (
        <span key="help" className="flex flex-wrap justify-end gap-1">{response.help.map((item) => <Badge key={item}>{FORM_HELP_LABEL[item] ?? item}</Badge>)}</span>
      ) : "Nothing picked",
    ],
  ];

  const reach: Array<[string, ReactNode]> = [
    ["Email", <a key="email" href={`mailto:${response.email}`} className="break-all text-ink underline-offset-2 hover:underline">{response.email}</a>],
    ["Phone", response.phone ? <span key="phone" className="flex flex-wrap justify-end gap-x-2"><a href={`tel:${response.phone}`} className="text-ink underline-offset-2 hover:underline">{response.phone}</a><a href={`sms:${response.phone}`} className="text-accent underline-offset-2 hover:underline">Text</a></span> : "Not given"],
    ["Prefers", ways || "Not given"],
    ["Best time", response.best_time ?? "Not given"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach/forms" className="hover:text-ink">Forms</Link>}
        title={response.organization}
        description={`${response.full_name}, ${response.role} · ${school} · submitted ${when(response.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!migrationMissing ? (
              <form action={markFormUnread.bind(null, id)}>
                <SubmitButton variant="ghost" size="sm">Mark unread</SubmitButton>
              </form>
            ) : null}
            {newer ? <ButtonLink variant="secondary" size="sm" href={`/admin/outreach/forms/${newer}`}><ArrowLeft className="size-4" aria-hidden />Newer</ButtonLink> : null}
            {older ? <ButtonLink variant="secondary" size="sm" href={`/admin/outreach/forms/${older}`}>Older<ArrowRight className="size-4" aria-hidden /></ButtonLink> : null}
          </div>
        }
      />
      {migrationMissing ? <Notice tone="warning" title="Run npx supabase db push">Statuses, read tracking, and notes need the newest migration. You can still read and reply.</Notice> : null}
      {blocked ? <Notice tone="warning" title="Do not contact">This email is marked do not contact in outreach, so sending is blocked.</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Their answers" description={`${school}${response.university?.state ? `, ${response.university.state}` : ""}`} />
            <CardBody>
              <dl className="divide-y divide-line text-sm">
                {answers.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-2">
                    <dt className="shrink-0 text-ink-3">{label}</dt>
                    <dd className="min-w-0 text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-[13px] text-ink-3">Anything else</p>
                {response.notes ? <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-canvas px-4 py-3 text-sm text-ink">{response.notes}</p> : <p className="mt-1 text-sm text-ink-2">They left this blank.</p>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Reply by email" description="Drafted from their answers. Edit anything before sending. It goes out from your outreach address and shows in the history below." />
            <CardBody>
              {!sendingReady ? <Notice tone="warning" className="mb-3">Sending is off because RESEND_API_KEY is not set.</Notice> : null}
              <SendForm
                action={replyToForm.bind(null, id)}
                subject={draft.subject}
                body={draft.body}
                to={response.email}
                from={serverEnv.outreachFrom() ?? serverEnv.emailFrom()}
                replyTo={serverEnv.outreachReplyTo()}
                label="Send reply"
                disabled={blocked || !sendingReady}
                bodyClassName="min-h-72 font-sans text-[13px] leading-relaxed"
                includeFormDefault={false}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Email history"
              description={contact ? `Everything with ${response.email}, newest first.` : "No outreach emails with this address yet."}
              actions={contact ? <Link href={`/admin/outreach/contacts/${contact.id}`} className="text-sm text-ink-2 hover:text-ink">Open contact</Link> : null}
            />
            {entries.length === 0 ? (
              <EmptyState icon={Inbox} title="Nothing yet">{contact ? "No emails with this contact yet." : "Your reply will make them an outreach contact."}</EmptyState>
            ) : (
              <ol className="divide-y divide-line">
                {entries.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.direction === "sent" ? <Badge tone="accent">You sent</Badge> : <Badge tone="positive">They replied</Badge>}
                      {entry.direction === "sent" && entry.status !== "sent" ? <Badge tone={entry.status === "failed" || entry.status === "bounced" ? "danger" : "neutral"}>{entry.status}</Badge> : null}
                      {entry.opened_at ? <Badge tone="info">Opened</Badge> : null}
                      <span className="text-[13px] text-ink-2">{when(entry.occurred_at)}</span>
                    </div>
                    {entry.subject ? <p className="mt-1.5 text-sm font-medium text-ink">{entry.subject}</p> : null}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">Show message</summary>
                      <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-canvas px-4 py-3 text-[13px] text-ink-2">{entry.body}</p>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" description={response.status_changed_at ? `Changed ${when(response.status_changed_at)}` : "Sending a reply moves a new form to contacted."} actions={<Badge tone={FORM_STATUS_TONE[status]}>{FORM_STATUS_LABEL[status]}</Badge>} />
            <CardBody>
              <div className="grid grid-cols-2 gap-2">
                {FORM_STATUSES.map((item) => (
                  <form key={item} action={setFormStatus.bind(null, id, item)}>
                    <SubmitButton size="sm" variant={item === status ? "primary" : "secondary"} className="w-full" disabled={migrationMissing || item === status}>
                      {FORM_STATUS_LABEL[item]}
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Reach them" />
            <CardBody>
              <dl className="divide-y divide-line text-sm">
                {reach.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-2">
                    <dt className="shrink-0 text-ink-3">{label}</dt>
                    <dd className="min-w-0 text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {firstSent ? <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-3">Submitted {response.created_at > firstSent ? `${durationLabel(firstSent, response.created_at)} after your first email` : "before you emailed them"}.</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              <NotesForm action={saveFormNotes.bind(null, id)} notes={response.admin_notes ?? null} disabled={migrationMissing} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="School" />
            <CardBody className="space-y-2 text-sm">
              <Link href={`/admin/outreach/schools/${response.university_id}`} className="block font-medium text-ink hover:underline">{school}</Link>
              <p className="text-[13px] text-ink-3">{[response.university?.city, response.university?.state].filter(Boolean).join(", ") || "United States"}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
