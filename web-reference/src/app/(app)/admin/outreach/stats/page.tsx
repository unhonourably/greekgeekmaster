import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, Notice, PageHeader, Stat, StatGrid, Table, Td, Th, Tr } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { requestTime } from "@/lib/format";
import { OUTREACH_ZONE, durationLabel } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

const RANGES = ["7", "30", "90", "all"] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { "7": "7 days", "30": "30 days", "90": "90 days", all: "All time" };
const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 12;
const PAGE = 1000;

type Email = { contact_id: string; direction: "sent" | "reply"; status: string; occurred_at: string; delivered_at: string | null; opened_at: string | null; clicked_at: string | null };
type Contact = { id: string; email_normalized: string; university: string; university_id: string | null; first_sent_at: string | null; replied_at: string | null; do_not_contact: boolean; unread_replies: number };
type Submission = { email: string; created_at: string; interest: string };

async function every<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; from < 100 * PAGE; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const value = (part / whole) * 100;
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const SENT = new Set(["sent", "delivered", "bounced"]);
const weekLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: OUTREACH_ZONE });

export default async function OutreachStatsPage({ searchParams }: PageProps<"/admin/outreach/stats">) {
  await requireStaff([]);
  const sp = await searchParams;
  const range: Range = RANGES.includes(sp.range as Range) ? (sp.range as Range) : "30";
  const now = requestTime();
  const since = range === "all" ? null : new Date(now - Number(range) * DAY).toISOString();
  const chartStart = now - WEEKS * 7 * DAY;
  const fetchFrom = since === null ? null : new Date(Math.min(new Date(since).getTime(), chartStart)).toISOString();
  const supabase = await createClient();

  const [emails, contacts, submissions, blockedCount] = await Promise.all([
    every<Email>((from, to) => {
      let query = supabase.from("outreach_emails").select("contact_id, direction, status, occurred_at, delivered_at, opened_at, clicked_at").order("occurred_at").order("id");
      if (fetchFrom) query = query.gte("occurred_at", fetchFrom);
      return query.range(from, to);
    }),
    every<Contact>((from, to) => supabase.from("outreach_contacts").select("id, email_normalized, university, university_id, first_sent_at, replied_at, do_not_contact, unread_replies").order("id").range(from, to)),
    every<Submission>((from, to) => {
      let query = supabase.from("intro_responses").select("email, created_at, interest").order("created_at").order("id");
      if (since) query = query.gte("created_at", since);
      return query.range(from, to);
    }),
    supabase.from("outreach_contacts").select("id", { count: "exact", head: true }).eq("do_not_contact", true),
  ]);
  const loadError = emails.error ?? contacts.error ?? submissions.error;

  const contactById = new Map(contacts.rows.map((contact) => [contact.id, contact]));
  const inRange = since ? emails.rows.filter((row) => row.occurred_at >= since) : emails.rows;
  const sent = inRange.filter((row) => row.direction === "sent" && SENT.has(row.status));
  const failed = inRange.filter((row) => row.direction === "sent" && row.status === "failed").length;
  const replies = inRange.filter((row) => row.direction === "reply");
  const delivered = sent.filter((row) => row.delivered_at).length;
  const opened = sent.filter((row) => row.opened_at).length;
  const clicked = sent.filter((row) => row.clicked_at).length;
  const bounced = sent.filter((row) => row.status === "bounced").length;

  const emailed = new Set(sent.map((row) => row.contact_id));
  const heardBack = new Set(replies.map((row) => row.contact_id));
  const emailedAndReplied = [...emailed].filter((id) => heardBack.has(id)).length;
  const deliveredTo = new Set(sent.filter((row) => row.delivered_at).map((row) => row.contact_id));
  const openedBy = new Set(sent.filter((row) => row.opened_at).map((row) => row.contact_id));
  const submittedEmails = new Set(submissions.rows.map((row) => row.email.trim().toLowerCase()));
  const formFromEmailed = [...emailed].filter((id) => {
    const contact = contactById.get(id);
    return contact ? submittedEmails.has(contact.email_normalized) : false;
  }).length;
  const schools = new Set([...emailed].map((id) => contactById.get(id)?.university_id ?? contactById.get(id)?.university).filter(Boolean));
  const demos = submissions.rows.filter((row) => row.interest === "demo").length;

  const replyTimes = contacts.rows
    .filter((contact) => contact.first_sent_at && contact.replied_at && contact.replied_at > contact.first_sent_at && (!since || contact.replied_at >= since))
    .map((contact) => new Date(contact.replied_at!).getTime() - new Date(contact.first_sent_at!).getTime());
  const medianReply = median(replyTimes);
  const fastestReply = replyTimes.length > 0 ? Math.min(...replyTimes) : null;
  const unread = contacts.rows.reduce((total, contact) => total + contact.unread_replies, 0);
  const tracking = Boolean(serverEnv.resendWebhookSecret());

  const weeks = Array.from({ length: WEEKS }, (_, index) => {
    const start = chartStart + index * 7 * DAY;
    return { start, end: start + 7 * DAY, sent: 0, replies: 0 };
  });
  for (const row of emails.rows) {
    const at = new Date(row.occurred_at).getTime();
    if (at < chartStart) continue;
    const week = weeks[Math.min(WEEKS - 1, Math.floor((at - chartStart) / (7 * DAY)))];
    if (row.direction === "sent" && SENT.has(row.status)) week.sent += 1;
    if (row.direction === "reply") week.replies += 1;
  }
  const peak = Math.max(1, ...weeks.map((week) => Math.max(week.sent, week.replies)));

  const bySchool = new Map<string, { id: string | null; name: string; emailed: number; opened: number; replied: number; forms: number }>();
  for (const id of emailed) {
    const contact = contactById.get(id);
    if (!contact) continue;
    const key = contact.university_id ?? contact.university;
    const entry = bySchool.get(key) ?? { id: contact.university_id, name: contact.university, emailed: 0, opened: 0, replied: 0, forms: 0 };
    entry.emailed += 1;
    if (openedBy.has(id)) entry.opened += 1;
    if (heardBack.has(id)) entry.replied += 1;
    if (submittedEmails.has(contact.email_normalized)) entry.forms += 1;
    bySchool.set(key, entry);
  }
  const topSchools = [...bySchool.values()].sort((a, b) => b.replied - a.replied || b.forms - a.forms || b.emailed - a.emailed || a.name.localeCompare(b.name)).slice(0, 10);

  const funnel = [
    { label: "Emailed", value: emailed.size, note: "Got at least one email" },
    { label: "Delivered", value: deliveredTo.size, note: tracking ? "Their mail server accepted it" : "Needs the webhook" },
    { label: "Opened", value: openedBy.size, note: tracking ? "Opens are not proof of reading" : "Needs the webhook" },
    { label: "Replied", value: emailedAndReplied, note: "Wrote back at least once" },
    { label: "Filled out the form", value: formFromEmailed, note: "Submitted with the same email" },
  ];
  const period = range === "all" ? "all time" : `the last ${RANGE_LABEL[range]}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Outreach</Link>}
        title="Email stats"
        description={`How outreach is doing over ${period}. Every number comes from emails you actually sent and replies you got.`}
        actions={
          <nav className="flex flex-wrap gap-2" aria-label="Time range">
            {RANGES.map((item) => (
              <Link
                key={item}
                href={item === "30" ? "/admin/outreach/stats" : `/admin/outreach/stats?range=${item}`}
                aria-current={item === range ? "page" : undefined}
                className={item === range ? "rounded-md border border-accent px-3 py-1.5 text-sm text-ink" : "rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"}
              >
                {RANGE_LABEL[item]}
              </Link>
            ))}
          </nav>
        }
      />
      {loadError ? <Notice tone="danger" title="Some numbers could not load">{loadError}</Notice> : null}
      {!tracking ? <Notice tone="info" title="Delivery and opens need the webhook">Set RESEND_WEBHOOK_SECRET on the server to track delivered, opened, and clicked.</Notice> : null}

      <StatGrid>
        <Stat label="Emails sent" value={sent.length.toLocaleString("en-US")} hint={failed > 0 ? `${failed} failed and not counted` : "Failed sends not counted"} />
        <Stat label="People emailed" value={emailed.size.toLocaleString("en-US")} hint={`At ${schools.size} school${schools.size === 1 ? "" : "s"}`} />
        <Stat label="Heard back" value={heardBack.size.toLocaleString("en-US")} hint={`${percent(emailedAndReplied, emailed.size)} of people emailed · ${replies.length} repl${replies.length === 1 ? "y" : "ies"}`} tone={heardBack.size > 0 ? "positive" : undefined} />
        <Stat label="Form submissions" value={submissions.rows.length.toLocaleString("en-US")} hint={`${demos} want a demo`} tone={submissions.rows.length > 0 ? "positive" : undefined} />
      </StatGrid>

      <StatGrid>
        <Stat label="Delivered" value={tracking ? delivered.toLocaleString("en-US") : "Needs the webhook"} hint={tracking ? `${percent(delivered, sent.length)} of emails sent` : undefined} />
        <Stat label="Opened" value={tracking ? opened.toLocaleString("en-US") : "Needs the webhook"} hint={tracking ? `${percent(opened, sent.length)} · opens are not proof of reading` : undefined} />
        <Stat label="Clicked a link" value={tracking ? clicked.toLocaleString("en-US") : "Needs the webhook"} hint={tracking ? `${percent(clicked, sent.length)} of emails sent` : undefined} />
        <Stat label="Bounced" value={bounced.toLocaleString("en-US")} hint={`${percent(bounced, sent.length)} of emails sent · ${(blockedCount.count ?? 0).toLocaleString("en-US")} marked do not contact`} tone={bounced > 0 ? "danger" : undefined} />
      </StatGrid>

      {emailed.size === 0 && submissions.rows.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title={`Nothing sent in ${period}`}>Once you send outreach emails, the numbers show up here.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader title="From email to form" description={`Of the ${emailed.size.toLocaleString("en-US")} people emailed in ${period}.`} />
            <CardBody className="space-y-4">
              {funnel.map((step) => (
                <div key={step.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink">{step.label}</span>
                    <span className="tnum text-ink">{step.value.toLocaleString("en-US")}<span className="ml-2 text-[13px] text-ink-3">{percent(step.value, emailed.size)}</span></span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${emailed.size === 0 ? 0 : Math.max(step.value > 0 ? 1 : 0, (step.value / emailed.size) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-3">{step.note}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Replies" />
            <CardBody>
              <dl className="divide-y divide-line text-sm">
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Typical time to first reply</dt><dd className="tnum text-ink">{medianReply === null ? "No replies yet" : durationLabel(new Date(0).toISOString(), new Date(medianReply).toISOString())}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Fastest first reply</dt><dd className="tnum text-ink">{fastestReply === null ? "No replies yet" : durationLabel(new Date(0).toISOString(), new Date(fastestReply).toISOString())}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Replies received</dt><dd className="tnum text-ink">{replies.length.toLocaleString("en-US")}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Unread replies</dt><dd className="tnum text-ink">{unread.toLocaleString("en-US")}</dd></div>
              </dl>
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">Typical is the median: half of people replied faster than this.</p>
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader title="Each week" description={`The last ${WEEKS} weeks, oldest on the left.`} actions={
          <div className="flex items-center gap-4 text-[13px] text-ink-2">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" aria-hidden />Sent</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-positive" aria-hidden />Replies</span>
          </div>
        } />
        <CardBody>
          <div className="flex h-44 items-end gap-1.5 sm:gap-3" role="img" aria-label={weeks.map((week) => `Week of ${weekLabel.format(week.start)}: ${week.sent} sent, ${week.replies} replies`).join(". ")}>
            {weeks.map((week) => (
              <div key={week.start} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5" title={`Week of ${weekLabel.format(week.start)}: ${week.sent} sent, ${week.replies} replies`}>
                <div className="w-full max-w-5 rounded-t-sm bg-accent" style={{ height: `${(week.sent / peak) * 100}%`, minHeight: week.sent > 0 ? 2 : 0 }} />
                <div className="w-full max-w-5 rounded-t-sm bg-positive" style={{ height: `${(week.replies / peak) * 100}%`, minHeight: week.replies > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-line pt-2 sm:gap-3">
            {weeks.map((week, index) => (
              <span key={week.start} className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-3">{index % 2 === 0 || WEEKS <= 8 ? weekLabel.format(week.start) : ""}</span>
            ))}
          </div>
        </CardBody>
      </Card>

      {topSchools.length > 0 ? (
        <Card>
          <CardHeader title="Schools" description={`Schools you emailed in ${period}, most replies first.`} />
          <Table>
            <thead>
              <tr>
                <Th>School</Th>
                <Th align="right">Emailed</Th>
                <Th align="right">Opened</Th>
                <Th align="right">Replied</Th>
                <Th align="right">Forms</Th>
              </tr>
            </thead>
            <tbody>
              {topSchools.map((school) => (
                <Tr key={school.id ?? school.name}>
                  <Td>{school.id ? <Link href={`/admin/outreach/schools/${school.id}`} className="hover:underline">{school.name}</Link> : school.name}</Td>
                  <Td align="right">{school.emailed}</Td>
                  <Td align="right">{tracking ? school.opened : "–"}</Td>
                  <Td align="right">{school.replied}</Td>
                  <Td align="right">{school.forms}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
