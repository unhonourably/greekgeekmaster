import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Inbox } from "lucide-react";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { OUTREACH_ZONE, STATUS_LABEL, STATUS_TONE, contactStatus, durationLabel, isoToZonedInput, outreachEmail } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";
import { deleteContact, deleteLoggedReply, logReply, sendOutreach, setDoNotContact, updateContact } from "../../actions";
import { BulkToggle } from "../../bulk-toggle";
import { ContactForm, ReplyForm, SendForm } from "../../forms";

type Contact = {
  id: string;
  university: string;
  university_id: string | null;
  organization: string;
  role: string;
  full_name: string | null;
  email: string;
  source_url: string | null;
  notes: string | null;
  do_not_contact: boolean;
  emails_sent: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  last_status: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  replies: number;
  created_at: string;
  bulk_added_at?: string | null;
};

type Entry = {
  id: string;
  direction: "sent" | "reply";
  subject: string;
  body: string;
  status: string;
  from_email: string | null;
  to_email: string | null;
  error: string | null;
  logged_by_hand: boolean;
  occurred_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  read_at: string | null;
};

const SENT_TONE: Record<string, "neutral" | "positive" | "danger" | "warning"> = {
  sending: "warning",
  sent: "neutral",
  delivered: "positive",
  bounced: "danger",
  failed: "danger",
};

function when(value: string | null): string {
  return value ? formatDateTime(value, OUTREACH_ZONE) : "No data";
}

export default async function OutreachContactPage({ params }: PageProps<"/admin/outreach/contacts/[id]">) {
  await requireStaff([]);
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("outreach_contacts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const contact = data as Contact;
  const [{ data: entryData }, { data: nextData }, code] = await Promise.all([
    supabase
      .from("outreach_emails")
      .select("id, direction, subject, body, status, from_email, to_email, error, logged_by_hand, occurred_at, delivered_at, opened_at, open_count, clicked_at, click_count, bounced_at, read_at")
      .eq("contact_id", id)
      .order("occurred_at", { ascending: false }),
    supabase.from("outreach_contacts").select("id").eq("emails_sent", 0).eq("do_not_contact", false).neq("id", id).order("created_at").limit(1).maybeSingle(),
    contact.university_id
      ? supabase.from("university_outreach").select("intro_code").eq("university_id", contact.university_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const entries = (entryData ?? []) as Entry[];
  if (entries.some((entry) => entry.direction === "reply" && !entry.read_at)) {
    await supabase.from("outreach_emails").update({ read_at: new Date().toISOString() }).eq("contact_id", id).eq("direction", "reply").is("read_at", null);
  }
  const status = contactStatus(contact);
  const introUrl = code.data?.intro_code ? `${serverEnv.outreachSiteUrl()}/intro/${code.data.intro_code}` : null;
  const draft = outreachEmail(contact, introUrl);
  const tracking = Boolean(serverEnv.resendWebhookSecret());
  const sendingReady = Boolean(serverEnv.resendApiKey());
  const sentBefore = (at: string) => entries.filter((entry) => entry.direction === "sent" && entry.status !== "failed" && entry.occurred_at < at).map((entry) => entry.occurred_at).sort().pop();

  const facts: Array<[string, ReactNode]> = [
    ["Email", <a key="email" href={`mailto:${contact.email}`} className="text-ink underline-offset-2 hover:underline">{contact.email}</a>],
    ["Status", <Badge key="status" tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>],
    ["Emails sent", contact.emails_sent],
    ["First sent", when(contact.first_sent_at)],
    ["Last sent", when(contact.last_sent_at)],
    ["Delivered", tracking ? when(contact.delivered_at) : "Needs the webhook"],
    ["First opened", tracking ? when(contact.opened_at) : "Needs the webhook"],
    ["First click", tracking ? when(contact.clicked_at) : "Needs the webhook"],
    ["First reply", contact.replied_at ? `${when(contact.replied_at)}${contact.first_sent_at && contact.replied_at > contact.first_sent_at ? ` · after ${durationLabel(contact.first_sent_at, contact.replied_at)}` : ""}` : "No reply yet"],
    ["Replies", contact.replies],
    ["Added", when(contact.created_at)],
    ["Found at", contact.source_url ? <a key="source" href={contact.source_url} target="_blank" rel="noreferrer" className="break-all text-accent underline-offset-2 hover:underline">{contact.source_url}</a> : "Not recorded"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href={contact.university_id ? `/admin/outreach/schools/${contact.university_id}` : "/admin/outreach"} className="hover:text-ink">{contact.university_id ? contact.university : "Outreach"}</Link>}
        title={contact.full_name ?? contact.email}
        description={`${contact.role}, ${contact.organization} · ${contact.university}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {contact.bulk_added_at !== undefined && !contact.do_not_contact ? <BulkToggle ids={[contact.id]} on={!contact.bulk_added_at} /> : null}
            {contact.bulk_added_at ? <Link href="/admin/outreach/bulk" className="text-sm text-ink-2 hover:text-ink">Bulk mail list</Link> : null}
            {nextData ? <ButtonLink variant="secondary" href={`/admin/outreach/contacts/${nextData.id}`}>Next contact<ArrowRight className="size-4" aria-hidden /></ButtonLink> : null}
          </div>
        }
      />
      {contact.do_not_contact ? <Notice tone="warning" title="Do not contact">{contact.bounced_at ? "The last email bounced, so sending is blocked." : "Sending to this address is blocked."}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={contact.emails_sent > 0 ? "Send another email" : "Email ready to send"}
              description={contact.emails_sent > 0 ? `Already emailed ${contact.emails_sent} time${contact.emails_sent === 1 ? "" : "s"}, last on ${when(contact.last_sent_at)}.` : "Filled in from your template. Edit anything before sending."}
            />
            <CardBody>
              {!sendingReady ? <Notice tone="warning" className="mb-3">Sending is off because RESEND_API_KEY is not set.</Notice> : null}
              <SendForm
                action={sendOutreach.bind(null, id)}
                subject={draft.subject}
                body={draft.body}
                to={contact.email}
                from={serverEnv.outreachFrom() ?? serverEnv.emailFrom()}
                replyTo={serverEnv.outreachReplyTo()}
                label={contact.emails_sent > 0 ? "Send again" : "Send email"}
                disabled={contact.do_not_contact || !sendingReady}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" description="Newest first. Times are Central." />
            {entries.length === 0 ? (
              <EmptyState icon={Inbox} title="Nothing sent yet">The email above has not gone out.</EmptyState>
            ) : (
              <ol className="divide-y divide-line">
                {entries.map((entry) => {
                  const previous = entry.direction === "reply" ? sentBefore(entry.occurred_at) : undefined;
                  return (
                    <li key={entry.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.direction === "sent" ? (
                          <>
                            <Badge tone="accent">You sent</Badge>
                            <Badge tone={SENT_TONE[entry.status] ?? "neutral"}>{entry.status}</Badge>
                          </>
                        ) : (
                          <>
                            <Badge tone="positive">They replied</Badge>
                            {entry.logged_by_hand ? <Badge>Logged by hand</Badge> : null}
                            {!entry.read_at ? <Badge tone="gold">New</Badge> : null}
                          </>
                        )}
                        <span className="text-[13px] text-ink-2">{when(entry.occurred_at)}</span>
                        {previous ? <span className="text-[13px] text-ink-3">· {durationLabel(previous, entry.occurred_at)} after your email</span> : null}
                      </div>
                      {entry.subject ? <p className="mt-2 font-medium text-ink">{entry.subject}</p> : null}
                      {entry.direction === "sent" ? (
                        <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12px] text-ink-3 sm:grid-cols-2">
                          {entry.to_email ? <div><dt className="inline">To </dt><dd className="inline text-ink-2">{entry.to_email}</dd></div> : null}
                          {entry.delivered_at ? <div><dt className="inline">Delivered </dt><dd className="inline text-ink-2">{when(entry.delivered_at)}</dd></div> : null}
                          {entry.opened_at ? <div><dt className="inline">Opened </dt><dd className="inline text-ink-2">{when(entry.opened_at)}{entry.open_count > 1 ? ` · ${entry.open_count} times` : ""}</dd></div> : null}
                          {entry.clicked_at ? <div><dt className="inline">Clicked </dt><dd className="inline text-ink-2">{when(entry.clicked_at)}{entry.click_count > 1 ? ` · ${entry.click_count} times` : ""}</dd></div> : null}
                          {entry.bounced_at ? <div><dt className="inline">Bounced </dt><dd className="inline text-danger">{when(entry.bounced_at)}</dd></div> : null}
                        </dl>
                      ) : entry.from_email ? (
                        <p className="mt-1 text-[12px] text-ink-3">From {entry.from_email}</p>
                      ) : null}
                      {entry.error ? <p className="mt-2 text-[13px] text-danger">{entry.error}</p> : null}
                      {entry.direction === "reply" ? (
                        <p className="mt-3 whitespace-pre-wrap rounded-md border border-line bg-canvas px-4 py-3 text-sm text-ink">{entry.body}</p>
                      ) : (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">Show message</summary>
                          <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-canvas px-4 py-3 text-[13px] text-ink-2">{entry.body}</p>
                        </details>
                      )}
                      {entry.logged_by_hand ? (
                        <form action={deleteLoggedReply.bind(null, id, entry.id)} className="mt-2">
                          <ConfirmSubmit message="Remove this logged reply?" variant="ghost">Remove</ConfirmSubmit>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-line text-sm">
                {facts.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-2">
                    <dt className="shrink-0 text-ink-3">{label}</dt>
                    <dd className="min-w-0 text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {contact.notes ? <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-[13px] text-ink-2">{contact.notes}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Log a reply" description={tracking ? "Replies to the reply address arrive on their own. Use this for replies that came in somewhere else." : "Paste a reply from your inbox so it counts."} />
            <CardBody>
              <ReplyForm action={logReply.bind(null, id)} now={isoToZonedInput(new Date())} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Edit contact" />
            <CardBody className="space-y-4">
              <ContactForm action={updateContact.bind(null, id)} contact={contact} submitLabel="Save contact" />
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <form action={setDoNotContact.bind(null, id, !contact.do_not_contact)}>
                  <SubmitButton variant="secondary" size="sm">{contact.do_not_contact ? "Allow emails again" : "Mark do not contact"}</SubmitButton>
                </form>
                <form action={deleteContact.bind(null, id)}>
                  <ConfirmSubmit message="Delete this contact and its whole email history?">Delete contact</ConfirmSubmit>
                </form>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
