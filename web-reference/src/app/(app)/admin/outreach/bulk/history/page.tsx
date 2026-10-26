import Link from "next/link";
import { History } from "lucide-react";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { OUTREACH_ZONE, durationLabel } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  left_waiting: number;
  stopped_reason: string | null;
};

export default async function BulkHistoryPage({ searchParams }: PageProps<"/admin/outreach/bulk/history">) {
  await requireStaff([]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("outreach_bulk_runs")
    .select("id, started_at, finished_at, queued, sent, failed, skipped, left_waiting, stopped_reason", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error && /does not exist|schema cache/i.test(error.message)) {
    return <Notice tone="danger">The bulk history migration is not on this database yet. Run npx supabase db push.</Notice>;
  }
  const runs = (data ?? []) as Run[];
  const pages = Math.max(1, Math.ceil((count ?? runs.length) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach/bulk" className="hover:text-ink">Bulk mail list</Link>}
        title="Bulk mail history"
        description="Every time you pressed send on the bulk list, newest first. Times are Central."
        actions={<Link href="/admin/outreach/sent" className="text-sm text-ink-2 hover:text-ink">All sent emails</Link>}
      />
      {error ? <p className="text-sm text-danger">{error.message}</p> : null}

      {runs.length === 0 ? (
        <EmptyState icon={History} title="No bulk sends yet">
          When you send the bulk list, each send shows up here with every email it included.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {runs.map((run) => (
            <li key={run.id}>
              <Link href={`/admin/outreach/bulk/history/${run.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-subtle">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{run.sent} email{run.sent === 1 ? "" : "s"} sent</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">
                    {formatDateTime(run.started_at, OUTREACH_ZONE)}
                    {run.finished_at ? ` · took ${durationLabel(run.started_at, run.finished_at)}` : " · did not finish"}
                    {` · ${run.queued} queued`}
                  </p>
                  {run.stopped_reason ? <p className="mt-0.5 text-[13px] text-danger">Stopped early: {run.stopped_reason}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {run.failed > 0 ? <Badge tone="danger">{run.failed} failed</Badge> : null}
                  {run.left_waiting > 0 ? <Badge tone="warning">{run.left_waiting} left waiting</Badge> : null}
                  {run.skipped > 0 ? <Badge>{run.skipped} do not contact skipped</Badge> : null}
                  {run.failed === 0 && run.left_waiting === 0 && run.finished_at ? <Badge tone="positive">All sent</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/admin/outreach/bulk/history?page=${page - 1}`} className="text-ink-2 hover:text-ink">Newer</Link> : <span />}
          <span className="text-ink-3">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/admin/outreach/bulk/history?page=${page + 1}`} className="text-ink-2 hover:text-ink">Older</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
