import { CalendarCheck, MailPlus, MessagesSquare, Megaphone, ShieldCheck, Sprout, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import { Avatar } from "@/components/people";
import { Card, CardHeader, Money, TextLink, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { Figure, Meter, Tile } from "./dashboard-parts";

type Dashboard = {
  members: {
    active: number;
    inactive: number;
    by_class: Partial<Record<"active" | "new_member" | "associate" | "alumni", number>>;
    officers: number;
    joined_30d: number;
    departed_30d: number;
    pending_invitations: number;
  };
  growth: Array<{ month: string; joined: number }>;
  events: { upcoming_7d: number; held_30d: number; required_attendance_rate_30d: number | null };
  engagement: { messages_7d: number; active_chatters_7d: number; ack_rate_30d: number | null };
  recruitment: { active_prospects: number; follow_ups_due: number; credited_30d: number; top_recruiters: Array<{ membership_id: string; name: string; count: number }> };
  finance: { billed_cents: number; outstanding_cents: number; overdue_members: number; members_with_balance: number } | null;
};

const CLASSES = [
  { key: "active", label: "Actives", color: "bg-accent" },
  { key: "new_member", label: "New members", color: "bg-positive" },
  { key: "associate", label: "Associates", color: "bg-info" },
  { key: "alumni", label: "Alumni", color: "bg-ink-3" },
] as const;

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

export async function OfficerDashboard({ chapterId, base, recruitment, finance, manageMembers, manageRoles }: { chapterId: string; base: string; recruitment: boolean; finance: boolean; manageMembers: boolean; manageRoles: boolean }) {
  const supabase = await createClient();
  const now = new Date();
  const [{ data, error }, month] = await Promise.all([
    supabase.rpc("chapter_officer_dashboard", { p_chapter: chapterId }),
    finance
      ? supabase.rpc("chapter_financial_summary", {
          p_chapter: chapterId,
          p_from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          p_to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
        })
      : Promise.resolve({ data: null }),
  ]);
  if (error || !data) return null;
  const d = data as Dashboard;
  const fin = month.data as Record<string, number> | null;
  const m = d.members;
  const active = Number(m.active);
  const growthMax = Math.max(1, ...d.growth.map((g) => Number(g.joined)));
  const chatShare = active ? Math.round((Number(d.engagement.active_chatters_7d) / active) * 100) : 0;
  const collected = d.finance && Number(d.finance.billed_cents) > 0 ? Math.round(((Number(d.finance.billed_cents) - Number(d.finance.outstanding_cents)) / Number(d.finance.billed_cents)) * 100) : null;
  const attendance = d.events.required_attendance_rate_30d === null ? null : Number(d.events.required_attendance_rate_30d);
  const ack = d.engagement.ack_rate_30d === null ? null : Number(d.engagement.ack_rate_30d);

  return (
    <section aria-label="Chapter at a glance" className="fade-up space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-3">Chapter at a glance</h2>
        <span className="text-[12px] text-ink-3">Officers only</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={Users} label="Active members" value={active} hint={Number(m.joined_30d) ? `+${m.joined_30d} in the last 30 days` : "No new members this month"} href={`${base}/directory`} />
        <Tile icon={Sprout} label="New members" value={Number(m.by_class.new_member ?? 0)} hint={`${Number(m.by_class.associate ?? 0)} associates · ${Number(m.by_class.alumni ?? 0)} alumni`} href={`${base}/directory?class=new_member`} />
        <Tile icon={ShieldCheck} label="Officers" value={Number(m.officers)} hint={active ? `${Math.round((Number(m.officers) / active) * 100)}% of the chapter` : undefined} href={manageRoles ? `${base}/settings/roles` : `${base}/directory`} />
        <Tile icon={MailPlus} label="Pending invites" value={Number(m.pending_invitations)} hint={Number(m.inactive) ? `${m.inactive} inactive members` : "Everyone invited has joined"} href={manageMembers ? `${base}/settings/members` : null} tone={Number(m.pending_invitations) > 0 ? "accent" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Membership" description={`${active} active${Number(m.departed_30d) ? ` · ${m.departed_30d} left in the last 30 days` : ""}`} />
          <div className="space-y-5 px-5 pb-5">
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-canvas" role="img" aria-label="Members by class">
                {CLASSES.map((c) => {
                  const n = Number(m.by_class[c.key] ?? 0);
                  return n ? <span key={c.key} className={cx("h-full first:rounded-l-full last:rounded-r-full", c.color)} style={{ width: `${(n / Math.max(1, active)) * 100}%` }} /> : null;
                })}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CLASSES.map((c) => (
                  <li key={c.key} className="flex items-center gap-2 text-[13px]">
                    <span className={cx("size-2 rounded-full", c.color)} aria-hidden />
                    <span className="text-ink-2">{c.label}</span>
                    <span className="ml-auto font-medium text-ink tnum">{Number(m.by_class[c.key] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-3">
                <TrendingUp className="size-3.5" aria-hidden />
                New members per month
              </p>
              <ol className="flex h-28 items-end gap-2">
                {d.growth.map((g) => {
                  const n = Number(g.joined);
                  return (
                    <li key={g.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="text-[11px] font-medium text-ink-2 tnum">{n}</span>
                      <span className={cx("w-full rounded-t-md", n ? "bg-accent/80" : "bg-subtle")} style={{ height: `${Math.max(4, (n / growthMax) * 72)}px` }} />
                      <span className="text-[11px] text-ink-3">{monthFmt.format(new Date(`${g.month}-01T00:00:00Z`))}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Engagement" description="Last 30 days unless noted" />
          <ul className="space-y-4 px-5 pb-5">
            <Meter icon={CalendarCheck} label="Required attendance" value={attendance} detail={`${d.events.held_30d} events held · ${d.events.upcoming_7d} in the next 7 days`} />
            <Meter icon={MessagesSquare} label="Members chatting this week" value={active ? chatShare : null} detail={`${Number(d.engagement.messages_7d).toLocaleString("en-US")} messages in 7 days`} />
            <Meter icon={Megaphone} label="Announcements acknowledged" value={ack} detail={ack === null ? "No announcements needed acknowledgment" : "Of members asked to acknowledge"} />
            {collected !== null && d.finance ? (
              <Meter icon={Wallet} label="Dues collected" value={collected} detail={`${d.finance.overdue_members} overdue · ${d.finance.members_with_balance} with a balance`} />
            ) : null}
          </ul>
        </Card>
      </div>

      {fin || recruitment ? (
        <div className={cx("grid gap-4", fin && recruitment && "lg:grid-cols-2")}>
          {fin ? (
            <Card>
              <CardHeader title="Finances this month" actions={<TextLink href={`${base}/finances`} className="text-[13px]">Open finances</TextLink>} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 pb-5">
                <Figure label="Outstanding" value={<Money cents={Number(fin.outstanding_cents)} />} hint={`${fin.members_with_balance} members with a balance`} />
                <Figure label="Collected online" value={<Money cents={Number(fin.collected_online_cents)} />} />
                <Figure label="Collected offline" value={<Money cents={Number(fin.collected_offline_cents)} />} />
                <Figure label="Processing" value={<Money cents={Number(fin.processing_cents)} />} hint="Bank payments clearing" />
              </dl>
            </Card>
          ) : null}
          {recruitment ? (
            <Card>
              <CardHeader title="Recruitment" actions={<TextLink href={`${base}/recruitment`} className="text-[13px]">Open pipeline</TextLink>} />
              <dl className="grid grid-cols-3 gap-4 px-5">
                <Figure label="Active prospects" value={Number(d.recruitment.active_prospects)} />
                <Figure label="Follow-ups due" value={Number(d.recruitment.follow_ups_due)} tone={Number(d.recruitment.follow_ups_due) > 0 ? "warning" : undefined} />
                <Figure label="Credited joins" value={Number(d.recruitment.credited_30d)} hint="Last 30 days" />
              </dl>
              <div className="px-5 pb-5 pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-3">
                  <UserPlus className="size-3.5" aria-hidden />
                  Top recruiters
                </p>
                {d.recruitment.top_recruiters.length === 0 ? (
                  <p className="text-[13px] text-ink-3">New members name who recruited them when they accept their invitation.</p>
                ) : (
                  <ol className="space-y-2">
                    {d.recruitment.top_recruiters.map((r, i) => (
                      <li key={r.membership_id} className="flex items-center gap-2.5 text-sm">
                        <span className="w-4 text-[12px] text-ink-3 tnum">{i + 1}</span>
                        <Avatar name={r.name} size="xs" />
                        <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                        <span className="text-[13px] font-medium text-ink tnum">{r.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function OfficerDashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading chapter stats">
      <div className="h-4 w-40 rounded bg-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-lg border border-line bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-72 rounded-lg border border-line bg-surface lg:col-span-3" />
        <div className="h-72 rounded-lg border border-line bg-surface lg:col-span-2" />
      </div>
    </div>
  );
}
