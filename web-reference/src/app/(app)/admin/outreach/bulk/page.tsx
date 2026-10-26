import Link from "next/link";
import { History, ListPlus, PenLine } from "lucide-react";
import { ConfirmSubmit } from "@/components/forms";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader, Stat, StatGrid } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { clearBulk } from "../bulk-action";
import { BULK_COLUMNS, bulkDrafts, type BulkContact } from "../send";
import { BulkEntry } from "./bulk-entry";
import { BulkSend } from "./bulk-send";

export const maxDuration = 60;

export default async function BulkPage() {
  await requireStaff([]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("outreach_contacts").select(BULK_COLUMNS).not("bulk_added_at", "is", null).order("bulk_added_at").order("id");
  if (error && /bulk_|does not exist|schema cache/i.test(error.message)) {
    return <Notice tone="danger">The bulk mail migration is not on this database yet. Run npx supabase db push.</Notice>;
  }
  const contacts = (data ?? []) as BulkContact[];
  const ready = contacts.filter((contact) => !contact.do_not_contact);
  const written = contacts.filter((contact) => contact.bulk_subject && contact.bulk_body).length;
  const blocked = contacts.length - ready.length;
  const { drafts, links } = await bulkDrafts(supabase, contacts);
  const withForm = ready.filter((contact) => links.get(contact.id)).length;
  const canSend = Boolean(serverEnv.resendApiKey());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Universities</Link>}
        title="Bulk mail list"
        description="Emails waiting to go out together. Each one is its own letter to its own person. Open any of them to change the subject or message, then send them all at once."
        actions={
          <div className="flex items-center gap-4">
            <Link href="/admin/outreach/bulk/history" className="text-sm text-ink-2 hover:text-ink">History</Link>
            <Link href="/admin/outreach/forms/links" className="text-sm text-ink-2 hover:text-ink">Form links</Link>
            <Link href="/admin/outreach/sent" className="text-sm text-ink-2 hover:text-ink">Sent</Link>
            {contacts.length > 0 ? (
              <form action={clearBulk}>
                <ConfirmSubmit message="Take every email off the bulk list? Nothing will be sent and your written emails will be discarded." variant="ghost">Clear list</ConfirmSubmit>
              </form>
            ) : null}
            <ButtonLink href="/admin/outreach/compose" size="sm"><PenLine className="size-4" aria-hidden />Write an email</ButtonLink>
          </div>
        }
      />
      {error ? <p className="text-sm text-danger">{error.message}</p> : null}
      {!canSend ? <Notice tone="warning">Sending is off because RESEND_API_KEY is not set on the server.</Notice> : null}

      {contacts.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="No emails queued"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/admin/outreach/compose" size="sm"><PenLine className="size-4" aria-hidden />Write an email</ButtonLink>
              <ButtonLink href="/admin/outreach/bulk/history" variant="secondary" size="sm"><History className="size-4" aria-hidden />Bulk mail history</ButtonLink>
            </div>
          }
        >
          Write an email on Compose or in a school&apos;s Write dialog and press Add to bulk list instead of Send. Each one keeps its own subject and message.
        </EmptyState>
      ) : (
        <>
          <StatGrid>
            <Stat label="Queued" value={contacts.length} />
            <Stat label="Written by you" value={written} />
            <Stat label="Preset letter" value={contacts.length - written} hint="Filled in for each person" />
            <Stat label="Do not contact" value={blocked} hint="Skipped and taken off" />
          </StatGrid>

          <Card>
            <CardHeader title={`${contacts.length} email${contacts.length === 1 ? "" : "s"} queued`} description="Click one to read or edit it." />
            <ul className="divide-y divide-line">
              {contacts.map((contact, index) => {
                const draft = drafts.get(contact.id)!;
                return (
                  <BulkEntry
                    key={contact.id}
                    index={index}
                    entry={{
                      id: contact.id,
                      name: contact.full_name ?? contact.organization,
                      detail: `${contact.role}, ${contact.organization} · ${contact.university}`,
                      email: contact.email,
                      subject: draft.subject,
                      body: draft.body,
                      custom: Boolean(contact.bulk_subject && contact.bulk_body),
                      blocked: contact.do_not_contact,
                      emailsSent: contact.emails_sent,
                      replied: contact.replies > 0,
                      formUrl: links.get(contact.id) ?? null,
                    }}
                  />
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Send them all" description="Goes out through Resend's batch endpoint, 100 emails per request, pausing between batches and waiting whenever Resend asks us to slow down. Up to 500 go per press. If a daily or monthly Resend limit is hit, sending stops and every email not yet sent stays here." />
            <CardBody>
              <BulkSend count={ready.length} withForm={withForm} from={serverEnv.outreachFrom() ?? serverEnv.emailFrom()} replyTo={serverEnv.outreachReplyTo()} canSend={canSend} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
