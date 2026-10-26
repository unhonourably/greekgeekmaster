import Link from "next/link";
import { Bug, Search } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Notice, PageHeader, Select, Stat, StatGrid } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import {
  BUG_AREAS,
  BUG_AREA_LABEL,
  BUG_CLOSED,
  BUG_OPEN,
  BUG_SEVERITIES,
  BUG_SEVERITY_LABEL,
  BUG_SEVERITY_RANK,
  BUG_SEVERITY_TONE,
  BUG_STATUS_LABEL,
  BUG_STATUS_TONE,
  bugTitle,
  guessArea,
  normalizePage,
  type BugArea,
  type BugSeverity,
  type BugStatus,
} from "@/lib/bugs";
import { formatDateTime, formatRelative, requestTime } from "@/lib/format";
import { OUTREACH_ZONE, durationLabel } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

const VIEWS = ["open", "new", "in_progress", "mine", "fixed", "closed", "all"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { open: "Open", new: "Needs triage", in_progress: "In progress", mine: "Assigned to me", fixed: "Fixed", closed: "Closed", all: "All" };
const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 12;

type Report = {
  id: string;
  number: number;
  status: BugStatus;
  severity: BugSeverity | null;
  area: BugArea | null;
  page: string;
  message: string;
  reporter_name: string | null;
  reporter_email: string | null;
  assignee_id: string | null;
  created_at: string;
  fixed_at: string | null;
  closed_at: string | null;
  first_response_at: string | null;
  chapter: { organization_name: string } | null;
};

function inView(report: Report, view: View, me: string): boolean {
  if (view === "open") return BUG_OPEN.includes(report.status);
  if (view === "new" || view === "in_progress" || view === "fixed") return report.status === view;
  if (view === "mine") return report.assignee_id === me && BUG_OPEN.includes(report.status);
  if (view === "closed") return BUG_CLOSED.includes(report.status) && report.status !== "fixed";
  return true;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function span(ms: number | null): string {
  return ms === null ? "No data yet" : durationLabel(new Date(0).toISOString(), new Date(ms).toISOString());
}

function hrefFor(params: { view: View; severity: string; area: string; q: string }): string {
  const search = new URLSearchParams();
  if (params.view !== "open") search.set("view", params.view);
  if (params.severity) search.set("severity", params.severity);
  if (params.area) search.set("area", params.area);
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  return query ? `/admin/bugs?${query}` : "/admin/bugs";
}

const weekLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: OUTREACH_ZONE });

export default async function BugReportsPage({ searchParams }: PageProps<"/admin/bugs">) {
  const { user } = await requireStaff(["support"]);
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "open";
  const severity = BUG_SEVERITIES.includes(sp.severity as BugSeverity) ? String(sp.severity) : sp.severity === "unrated" ? "unrated" : "";
  const area = BUG_AREAS.includes(sp.area as BugArea) ? String(sp.area) : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  const [list, staff] = await Promise.all([
    supabase
      .from("bug_reports")
      .select("id, number, status, severity, area, page, message, reporter_name, reporter_email, assignee_id, created_at, fixed_at, closed_at, first_response_at, chapter:chapters(organization_name)")
      .order("created_at", { ascending: false })
      .limit(3000),
    supabase.rpc("bug_assignees"),
  ]);
  const migrationMissing = Boolean(list.error && /bug_reports|schema cache|does not exist/i.test(list.error.message));
  const all = (list.data ?? []) as unknown as Report[];
  const names = new Map(((staff.data ?? []) as Array<{ user_id: string; name: string }>).map((person) => [person.user_id, person.name]));
  const now = requestTime();

  const open = all.filter((report) => BUG_OPEN.includes(report.status));
  const untriaged = all.filter((report) => report.status === "new");
  const urgent = open.filter((report) => report.severity === "critical" || report.severity === "high");
  const critical = open.filter((report) => report.severity === "critical").length;
  const fixedRecent = all.filter((report) => report.fixed_at && now - new Date(report.fixed_at).getTime() < 30 * DAY);
  const fixTimes = all.filter((report) => report.fixed_at && now - new Date(report.fixed_at).getTime() < 90 * DAY).map((report) => new Date(report.fixed_at!).getTime() - new Date(report.created_at).getTime());
  const responseTimes = all.filter((report) => report.first_response_at && now - new Date(report.created_at).getTime() < 90 * DAY).map((report) => new Date(report.first_response_at!).getTime() - new Date(report.created_at).getTime());
  const oldestOpen = open.reduce<Report | null>((oldest, report) => (!oldest || report.created_at < oldest.created_at ? report : oldest), null);
  const unassigned = open.filter((report) => !report.assignee_id).length;

  const chartStart = now - WEEKS * 7 * DAY;
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({ start: chartStart + index * 7 * DAY, reported: 0, fixed: 0 }));
  const bucket = (iso: string) => {
    const at = new Date(iso).getTime();
    return at < chartStart ? null : weeks[Math.min(WEEKS - 1, Math.floor((at - chartStart) / (7 * DAY)))];
  };
  for (const report of all) {
    const reported = bucket(report.created_at);
    if (reported) reported.reported += 1;
    const fixed = report.fixed_at ? bucket(report.fixed_at) : null;
    if (fixed) fixed.fixed += 1;
  }
  const peak = Math.max(1, ...weeks.map((week) => Math.max(week.reported, week.fixed)));

  const pageCounts = new Map<string, number>();
  for (const report of open) pageCounts.set(normalizePage(report.page), (pageCounts.get(normalizePage(report.page)) ?? 0) + 1);
  const hotPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  const areaCounts = new Map<string, number>();
  for (const report of open) {
    const key = report.area ?? guessArea(report.page) ?? "other";
    areaCounts.set(key, (areaCounts.get(key) ?? 0) + 1);
  }
  const hotAreas = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const needle = q.toLowerCase();
  const rows = all
    .filter((report) => inView(report, view, user.id))
    .filter((report) => !severity || (severity === "unrated" ? !report.severity : report.severity === severity))
    .filter((report) => !area || (report.area ?? guessArea(report.page)) === area)
    .filter((report) => {
      if (!needle) return true;
      if (/^#?\d+$/.test(needle)) return report.number === Number(needle.replace("#", ""));
      return [report.message, report.page, report.reporter_name ?? "", report.reporter_email ?? "", report.chapter?.organization_name ?? ""].some((value) => value.toLowerCase().includes(needle));
    })
    .sort((a, b) => {
      if (view === "fixed" || view === "closed") return (b.closed_at ?? b.created_at).localeCompare(a.closed_at ?? a.created_at);
      const rank = (report: Report) => (report.status === "new" && !report.severity ? -1 : BUG_SEVERITY_RANK[report.severity ?? ""] ?? 4);
      return rank(a) - rank(b) || b.created_at.localeCompare(a.created_at);
    });
  const counts = new Map<View, number>(VIEWS.map((item) => [item, all.filter((report) => inView(report, item, user.id)).length]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bug reports"
        description="Everything people sent with Report a bug. Triage it, log the fix, and tell them when it's done. Times are Central."
      />
      {migrationMissing ? <Notice tone="warning" title="Run npx supabase db push">The bug reports migration is not on this database yet. Until then, reports still arrive by email at admin@greekgeek.org.</Notice> : null}
      {list.error && !migrationMissing ? <Notice tone="danger">{list.error.message}</Notice> : null}

      <StatGrid>
        <Stat label="Open" value={open.length} hint={open.length > 0 ? `${unassigned} unassigned` : "Nothing open"} />
        <Stat label="Needs triage" value={untriaged.length} hint="Not looked at yet" tone={untriaged.length > 0 ? "warning" : undefined} />
        <Stat label="Critical or high" value={urgent.length} hint={critical > 0 ? `${critical} critical` : "Open only"} tone={urgent.length > 0 ? "danger" : undefined} />
        <Stat label="Fixed in 30 days" value={fixedRecent.length} hint={`Typical fix time ${span(median(fixTimes))}`} tone={fixedRecent.length > 0 ? "positive" : undefined} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader
            title="Reported and fixed each week"
            description={`The last ${WEEKS} weeks, oldest on the left.`}
            actions={
              <div className="flex items-center gap-4 text-[13px] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger" aria-hidden />Reported</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-positive" aria-hidden />Fixed</span>
              </div>
            }
          />
          <CardBody>
            <div className="flex h-36 items-end gap-1.5 sm:gap-3" role="img" aria-label={weeks.map((week) => `Week of ${weekLabel.format(week.start)}: ${week.reported} reported, ${week.fixed} fixed`).join(". ")}>
              {weeks.map((week) => (
                <div key={week.start} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5" title={`Week of ${weekLabel.format(week.start)}: ${week.reported} reported, ${week.fixed} fixed`}>
                  <div className="w-full max-w-4 rounded-t-sm bg-danger/80" style={{ height: `${(week.reported / peak) * 100}%`, minHeight: week.reported > 0 ? 2 : 0 }} />
                  <div className="w-full max-w-4 rounded-t-sm bg-positive" style={{ height: `${(week.fixed / peak) * 100}%`, minHeight: week.fixed > 0 ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 border-t border-line pt-2 sm:gap-3">
              {weeks.map((week, index) => (
                <span key={week.start} className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-3">{index % 2 === 0 ? weekLabel.format(week.start) : ""}</span>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Response" description="Reports from the last 90 days." />
          <CardBody>
            <dl className="divide-y divide-line text-sm">
              <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Typical first response</dt><dd className="tnum text-ink">{span(median(responseTimes))}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Typical time to fix</dt><dd className="tnum text-ink">{span(median(fixTimes))}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">Oldest open</dt><dd className="text-right text-ink">{oldestOpen ? <Link href={`/admin/bugs/${oldestOpen.id}`} className="hover:underline">#{oldestOpen.number} · {durationLabel(oldestOpen.created_at, new Date(now).toISOString())}</Link> : "None"}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="text-ink-3">All time</dt><dd className="tnum text-ink">{all.length} reported · {all.filter((report) => report.status === "fixed").length} fixed</dd></div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">Typical is the median. First response is the first triage change, note, or email.</p>
          </CardBody>
        </Card>
      </div>

      {open.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Pages with open bugs" description="Chapter names and IDs are folded together." />
            <ul className="divide-y divide-line">
              {hotPages.map(([page, count]) => (
                <li key={page} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 truncate font-mono text-[13px] text-ink-2">{page}</span>
                  <Badge tone={count > 1 ? "warning" : "neutral"}>{count}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Areas with open bugs" description="Unset areas are guessed from the page." />
            <ul className="divide-y divide-line">
              {hotAreas.map(([key, count]) => (
                <li key={key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <Link href={hrefFor({ view: "open", severity: "", area: key, q: "" })} className="text-sm text-ink-2 hover:text-ink">{BUG_AREA_LABEL[key as BugArea] ?? key}</Link>
                  <Badge tone={count > 1 ? "warning" : "neutral"}>{count}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      <div className="space-y-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filter bug reports">
          {VIEWS.map((item) => (
            <Link
              key={item}
              href={hrefFor({ view: item, severity, area, q })}
              aria-current={item === view ? "page" : undefined}
              className={item === view ? "rounded-md border border-accent px-3 py-1.5 text-sm text-ink" : "rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"}
            >
              {VIEW_LABEL[item]}
              <span className="ml-1.5 text-ink-3 tnum">{counts.get(item) ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap gap-2" role="search">
          {view !== "open" ? <input type="hidden" name="view" value={view} /> : null}
          <Input name="q" defaultValue={q} placeholder="Words, page, reporter, or #number" aria-label="Search bug reports" className="w-72" />
          <Select name="severity" defaultValue={severity} aria-label="Severity" className="w-40">
            <option value="">Any severity</option>
            {BUG_SEVERITIES.map((item) => <option key={item} value={item}>{BUG_SEVERITY_LABEL[item]}</option>)}
            <option value="unrated">Not rated</option>
          </Select>
          <Select name="area" defaultValue={area} aria-label="Area" className="w-44">
            <option value="">Any area</option>
            {BUG_AREAS.map((item) => <option key={item} value={item}>{BUG_AREA_LABEL[item]}</option>)}
          </Select>
          <Button type="submit" variant="secondary"><Search className="size-4" aria-hidden />Filter</Button>
          {q || severity || area ? <Link href={hrefFor({ view, severity: "", area: "", q: "" })} className="self-center text-sm text-ink-3 hover:text-ink">Clear</Link> : null}
        </form>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Bug} title={all.length === 0 ? "No bug reports yet" : "Nothing here"}>
            {all.length === 0 ? "When someone uses Report a bug, it lands here with the page, browser, and screen size." : "No reports match this view and these filters."}
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((report) => {
              const guessed = report.area ? null : guessArea(report.page);
              return (
                <li key={report.id}>
                  <Link href={`/admin/bugs/${report.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-canvas/50">
                    <span className="w-12 shrink-0 pt-0.5 font-mono text-[13px] text-ink-3">#{report.number}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {report.severity ? <Badge tone={BUG_SEVERITY_TONE[report.severity]}>{BUG_SEVERITY_LABEL[report.severity]}</Badge> : <Badge>Not rated</Badge>}
                        <span className={report.status === "new" ? "font-semibold text-ink" : "text-ink"}>{bugTitle(report.message)}</span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
                        <span className="max-w-[22rem] truncate font-mono text-[12px] text-ink-2">{report.page}</span>
                        <span>· {report.reporter_name ?? report.reporter_email ?? "Unknown"}</span>
                        {report.chapter ? <span>· {report.chapter.organization_name}</span> : null}
                        {report.area ? <span>· {BUG_AREA_LABEL[report.area]}</span> : guessed ? <span className="italic">· {BUG_AREA_LABEL[guessed]}?</span> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={BUG_STATUS_TONE[report.status]}>{BUG_STATUS_LABEL[report.status]}</Badge>
                      <span className="text-[12px] text-ink-3">{report.assignee_id ? names.get(report.assignee_id) ?? "Assigned" : "Unassigned"}</span>
                      <time dateTime={report.created_at} title={formatDateTime(report.created_at, OUTREACH_ZONE)} className="text-[12px] text-ink-3">{formatRelative(report.created_at, new Date(now))}</time>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
