import Link from "next/link";
import { PenLine, Send } from "lucide-react";
import { Badge, ButtonLink, EmptyState, PageHeader, Stat, StatGrid } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { OUTREACH_ZONE } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;
const FILTERS = ["all", "delivered", "opened", "bounced", "failed"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { all: "All", delivered: "Delivered", opened: "Opened", bounced: "Bounced", failed: "Failed" };

const STATUS_TONE: Record<string, "neutral" | "positive" | "danger" | "warning"> = {
  sending: "warning",
  sent: "neutral",
  delivered: "positive",
  bounced: "danger",
  failed: "danger",
};

type Row = {
  id: string;
  subject: string;
  body: string;
  status: string;
  to_email: string | null;
  error: string | null;
  occurred_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  bounced_at: string | null;
  contact: { id: string; full_name: string | null; organization: string; role: string; university: string; email: string; replied_at: string | null } | null;
};

function hrefFor(filter: Filter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/outreach/sent?${query}` : "/admin/outreach/sent";
}

export default async function SentPage({ searchParams }: PageProps<"/admin/outreach/sent">) {
  await requireStaff([]);
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.filter as Filter) ? (sp.filter as Filter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();

  let query = supabase
    .from("outreach_emails")
    .select("id, subject, body, status, to_email, error, occurred_at, delivered_at, opened_at, open_count, clicked_at, bounced_at, contact:outreach_contacts(id, full_name, organization, role, university, email, replied_at)", { count: "exact" })
    .eq("direction", "sent")
    .order("occurred_at", { ascending: false });
  if (filter === "delivered") query = query.not("delivered_at", "is", null);
  if (filter === "opened") query = query.not("opened_at", "is", null);
  if (filter === "bounced") query = query.eq("status", "bounced");
  if (filter === "failed") query = query.eq("status", "failed");

  const count = (status?: string) => {
    let q = supabase.from("outreach_emails").select("id", { count: "exact", head: true }).eq("direction", "sent");
    if (status) q = q.eq("status", status);
    return q;
  };

  const [list, total, failed, bounced, opened] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
    count().neq("status", "failed"),
    count("failed"),
    count("bounced"),
    count().not("opened_at", "is", null),
  ]);
  const rows = (list.data ?? []) as unknown as Row[];
  const pages = Math.max(1, Math.ceil((list.count ?? rows.length) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Universities</Link>}
        title="Sent"
        description="Every outreach email you sent, newest first. Times are Central."
        actions={
          <div className="flex items-center gap-4">
            <Link href="/admin/outreach/emails" className="text-sm text-ink-2 hover:text-ink">Saved emails</Link>
            <Link href="/admin/outreach/bulk" className="text-sm text-ink-2 hover:text-ink">Bulk list</Link>
            <Link href="/admin/outreach/bulk/history" className="text-sm text-ink-2 hover:text-ink">Bulk history</Link>
            <ButtonLink href="/admin/outreach/compose" size="sm"><PenLine className="size-4" aria-hidden />Compose email</ButtonLink>
          </div>
        }
      />
      {list.error ? <p className="text-sm text-danger">{list.error.message}</p> : null}

      <StatGrid>
        <Stat label="Sent" value={total.count ?? 0} hint="Failed sends not counted" />
        <Stat label="Opened" value={opened.count ?? 0} hint="Opens are not proof of reading" />
        <Stat label="Bounced" value={bounced.count ?? 0} />
        <Stat label="Failed" value={failed.count ?? 0} hint="Never left GreekGeek" />
      </StatGrid>

      <nav className="flex flex-wrap gap-2" aria-label="Filter sent emails">
        {FILTERS.map((item) => (
          <Link
            key={item}
            href={hrefFor(item, 1)}
            aria-current={item === filter ? "page" : undefined}
            className={item === filter ? "rounded-md border border-accent px-3 py-1.5 text-sm text-ink" : "rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"}
          >
            {FILTER_LABEL[item]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={Send} title={filter === "all" ? "Nothing sent yet" : `No ${FILTER_LABEL[filter].toLowerCase()} emails`}>
          {filter === "all" ? "Open a university, gather info, and press Write on an address." : "Try another filter."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.subject || "No subject"}</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    To {row.to_email ?? row.contact?.email ?? "unknown"}
                    {row.contact ? ` · ${row.contact.full_name ? `${row.contact.full_name}, ` : ""}${row.contact.role}, ${row.contact.organization} · ${row.contact.university}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>
                  {row.opened_at ? <Badge tone="accent">Opened{row.open_count > 1 ? ` ${row.open_count}x` : ""}</Badge> : null}
                  {row.contact?.replied_at && row.contact.replied_at > row.occurred_at ? <Badge tone="positive">Replied</Badge> : null}
                </div>
              </div>
              <p className="mt-1 text-[12px] text-ink-3">
                Sent {formatDateTime(row.occurred_at, OUTREACH_ZONE)}
                {row.delivered_at ? ` · Delivered ${formatDateTime(row.delivered_at, OUTREACH_ZONE)}` : ""}
                {row.opened_at ? ` · Opened ${formatDateTime(row.opened_at, OUTREACH_ZONE)}` : ""}
                {row.clicked_at ? ` · Clicked ${formatDateTime(row.clicked_at, OUTREACH_ZONE)}` : ""}
                {row.bounced_at ? ` · Bounced ${formatDateTime(row.bounced_at, OUTREACH_ZONE)}` : ""}
              </p>
              {row.error ? <p className="mt-1 text-[13px] text-danger">{row.error}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">Show message</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-canvas px-4 py-3 text-[13px] text-ink-2">{row.body}</p>
                </details>
                {row.contact ? <Link href={`/admin/outreach/contacts/${row.contact.id}`} className="text-[13px] text-ink-3 hover:text-ink">History</Link> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={hrefFor(filter, page - 1)} className="text-ink-2 hover:text-ink">Newer</Link> : <span />}
          <span className="text-ink-3">Page {page} of {pages}</span>
          {page < pages ? <Link href={hrefFor(filter, page + 1)} className="text-ink-2 hover:text-ink">Older</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
