import Link from "next/link";
import { Card, CardHeader, PageHeader, Stat, StatGrid, TextLink, cx } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/format";

type Summary = {
  active_members: number;
  events_held: number;
  required_events: number;
  attendance_records: number;
  required_attendance_rate: number | null;
  service_hours: number;
  service_participants: number;
  messages_sent: number;
  prospects_by_stage: Array<{ stage: string; outcome: string; count: number }>;
};

const PERIODS = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
] as const;

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/c/[slug]/analytics">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter, can } = await requireChapter(slug, "analytics.view");
  const period = PERIODS.find((p) => p.key === sp.period) ?? PERIODS[1];
  const to = requestTime();
  const from = to - period.days * 86400_000;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chapter_engagement_summary", { p_chapter: chapter.id, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() });
  const s = (error ? null : data) as Summary | null;
  const modules = chapter.modules ?? {};
  const funnel = s?.prospects_by_stage ?? [];
  const funnelMax = Math.max(1, ...funnel.map((f) => Number(f.count)));
  const hours = Number(s?.service_hours ?? 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Chapter-wide engagement. Counts are aggregate and never show individual messages or notes."
        actions={
          <nav aria-label="Period" className="flex rounded-md border border-line bg-surface p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/c/${slug}/analytics?period=${p.key}`}
                aria-current={p.key === period.key ? "page" : undefined}
                className={cx("rounded px-3 py-1 text-[13px]", p.key === period.key ? "bg-canvas font-medium text-ink" : "text-ink-3 hover:text-ink")}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />
      {!s ? (
        <Card>
          <p className="px-5 py-6 text-sm text-ink-3">Analytics could not be loaded. Try again shortly.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Membership and events</h2>
            <StatGrid>
              <Stat label="Active members" value={Number(s.active_members)} />
              <Stat label="Events held" value={Number(s.events_held)} hint={`${Number(s.required_events)} required`} />
              <Stat label="Check-ins" value={Number(s.attendance_records)} hint="Present or late" />
              <Stat
                label="Required attendance"
                value={s.required_attendance_rate === null ? "No data" : `${Number(s.required_attendance_rate)}%`}
                hint="Present, late, or excused"
                tone={s.required_attendance_rate === null ? undefined : Number(s.required_attendance_rate) < 70 ? "warning" : "positive"}
              />
            </StatGrid>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Participation</h2>
            <StatGrid>
              <Stat label="Messages sent" value={Number(s.messages_sent).toLocaleString("en-US")} />
              {modules.philanthropy ? <Stat label="Approved service hours" value={hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} /> : null}
              {modules.philanthropy ? <Stat label="Members who served" value={Number(s.service_participants)} hint={s.active_members ? `${Math.round((Number(s.service_participants) / Number(s.active_members)) * 100)}% of active members` : undefined} /> : null}
              {modules.philanthropy && Number(s.service_participants) ? <Stat label="Hours per participant" value={(hours / Number(s.service_participants)).toFixed(1)} /> : null}
            </StatGrid>
          </section>

          {modules.recruitment && funnel.length ? (
            <Card>
              <CardHeader title="Recruitment pipeline" description="Active prospects in each stage right now." />
              <ul className="space-y-3 px-5 py-4">
                {funnel.map((f) => (
                  <li key={f.stage} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-[13px]">
                    <span className="truncate text-ink-2">{f.stage}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-canvas">
                      <span className={cx("block h-full rounded-full", f.outcome === "joined" ? "bg-positive" : f.outcome === "closed" ? "bg-line-strong" : "bg-accent")} style={{ width: `${(Number(f.count) / funnelMax) * 100}%` }} />
                    </span>
                    <span className="text-right text-ink tnum">{Number(f.count)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {can("finance.view") ? (
            <p className="text-[13px] text-ink-3">
              Dues collection trends are in <TextLink href={`/c/${slug}/finances/reports`}>finance reports</TextLink>.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
