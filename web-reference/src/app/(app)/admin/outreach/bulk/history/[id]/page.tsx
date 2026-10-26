import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice, PageHeader, Stat, StatGrid } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { OUTREACH_ZONE, durationLabel } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 100;

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
  bounced_at: string | null;
  contact: { id: string; full_name: string | null; organization: string; role: string; university: string; replied_at: string | null } | null;
};

export default async function BulkRunPage({ params, searchParams }: PageProps<"/admin/outreach/bulk/history/[id]">) {
  await requireStaff([]);
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const { data: run, error: runError } = await supabase.from("outreach_bulk_runs").select("id, started_at, finished_at, queued, sent, failed, skipped, left_waiting, stopped_reason").eq("id", id).maybeSingle();
  if (runError && /does not exist|schema cache/i.test(runError.message)) {
    return <Notice tone="danger">The bulk history migration is not on this database yet. Run npx supabase db push.</Notice>;
  }
  if (!run) notFound();

  const count = () => supabase.from("outreach_emails").select("id", { count: "exact", head: true }).eq("bulk_run_id", id);
  const [list, delivered, opened, bounced, failed] = await Promise.all([
    supabase
      .from("outreach_emails")
      .select("id, subject, body, status, to_email, error, occurred_at, delivered_at, opened_at, open_count, bounced_at, contact:outreach_contacts(id, full_name, organization, role, university, replied_at)", { count: "exact" })
      .eq("bulk_run_id", id)
      .order("occurred_at")
      .order("id")
      .range(from, from + PAGE_SIZE - 1),
    count().not("delivered_at", "is", null),
    count().not("opened_at", "is", null),
    count().eq("status", "bounced"),
    count().eq("status", "failed"),
  ]);
  const rows = (list.data ?? []) as unknown as Row[];
  const replied = rows.filter((row) => row.contact?.replied_at && row.contact.replied_at > row.occurred_at).length;
  const pages = Math.max(1, Math.ceil((list.count ?? rows.length) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach/bulk/history" className="hover:text-ink">Bulk mail history</Link>}
        title={`Bulk send of ${run.sent} email${run.sent === 1 ? "" : "s"}`}
        description={`${formatDateTime(run.started_at, OUTREACH_ZONE)}${run.finished_at ? `, took ${durationLabel(run.started_at, run.finished_at)}` : ", did not finish"}. ${run.queued} were queued at the time.`}
      />
      {run.stopped_reason ? <Notice tone="warning" title="Stopped early">{run.stopped_reason}</Notice> : null}
      {run.left_waiting > 0 ? <Notice>{run.left_waiting} email{run.left_waiting === 1 ? " was" : "s were"} left on the bulk list for the next send.</Notice> : null}

      <StatGrid>
        <Stat label="Sent" value={run.sent} />
        <Stat label="Delivered" value={delivered.count ?? 0} />
        <Stat label="Opened" value={opened.count ?? 0} hint="Opens are not proof of reading" />
        <Stat label="Bounced" value={bounced.count ?? 0} tone={(bounced.count ?? 0) > 0 ? "danger" : undefined} />
        <Stat label="Failed" value={failed.count ?? 0} hint="Never left GreekGeek" tone={(failed.count ?? 0) > 0 ? "danger" : undefined} />
        {replied > 0 ? <Stat label="Replied" value={replied} tone="positive" /> : null}
      </StatGrid>

      {rows.length === 0 ? <p className="text-sm text-ink-3">No emails were recorded for this send.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{row.subject || "No subject"}</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    To {row.to_email ?? "unknown"}
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
                {row.delivered_at ? `Delivered ${formatDateTime(row.delivered_at, OUTREACH_ZONE)}` : "Not delivered yet"}
                {row.opened_at ? ` · Opened ${formatDateTime(row.opened_at, OUTREACH_ZONE)}` : ""}
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
          {page > 1 ? <Link href={`/admin/outreach/bulk/history/${id}?page=${page - 1}`} className="text-ink-2 hover:text-ink">Previous</Link> : <span />}
          <span className="text-ink-3">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/admin/outreach/bulk/history/${id}?page=${page + 1}`} className="text-ink-2 hover:text-ink">Next</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
