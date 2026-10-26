import Link from "next/link";
import { Award, BookOpen, CalendarCheck, CheckCircle2, ClipboardList, FileCheck2, GraduationCap, HandHeart, House, Megaphone, Sparkles, Users, type LucideIcon } from "lucide-react";
import { BadgeIcon } from "@/components/badge-icon";
import { Avatar, RoleBadges } from "@/components/people";
import { Badge, Card, CardHeader, cx } from "@/components/ui";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { Tile } from "./dashboard-parts";

export type MemberOverview = {
  membership: { id: string; member_class: MemberClass; joined_at: string };
  roles: Array<{ name: string; tone: string }>;
  committees: Array<{ name: string; role: "member" | "chair" }>;
  attendance: { required: number; attended: number; excused: number; missed: number };
  events_attended_90d: number;
  rsvps: Record<string, "going" | "maybe" | "not_going">;
  acks: Array<{ id: string; title: string }>;
  tasks: Array<{ id: string; title: string; due_at: string | null; module: string }>;
  open_tasks: number;
  chores: Array<{ id: string; title: string; due_on: string }>;
  policies_due: number;
  trainings_due: { count: number; next_due: string | null };
  service: { approved_hours: number; pending_hours: number; since: string };
  badges: { count: number; recent: Array<{ name: string; icon: string; awarded_at: string }> };
  goals_active: number;
  mentorship: { mentors: Array<{ user_id: string; name: string }>; mentees: Array<{ user_id: string; name: string }> };
  chapter: { active_members: number; joined_30d: number; events_7d: number; newest: Array<{ user_id: string; name: string; joined_at: string }> };
};

type Modules = { philanthropy?: boolean; housing?: boolean; standards?: boolean; academics?: boolean; recruitment?: boolean };

const RSVP: Record<string, { label: string; tone: "positive" | "neutral" | "warning" }> = {
  going: { label: "Going", tone: "positive" },
  maybe: { label: "Maybe", tone: "warning" },
  not_going: { label: "Not going", tone: "neutral" },
};

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const sinceFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export function RsvpBadge({ status }: { status: string | undefined }) {
  const r = status ? RSVP[status] : null;
  return r ? <Badge tone={r.tone}>{r.label}</Badge> : <span className="text-[12px] text-accent">RSVP</span>;
}

export function attendanceRate(a: MemberOverview["attendance"]): number | null {
  const required = Number(a.required);
  return required ? Math.round(((Number(a.attended) + Number(a.excused)) / required) * 100) : null;
}

export function MemberTiles({ o, base, userId, modules }: { o: MemberOverview; base: string; userId: string; modules: Modules }) {
  const rate = attendanceRate(o.attendance);
  const service = Number(o.service.approved_hours);
  const pending = Number(o.service.pending_hours);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        icon={CalendarCheck}
        label="Required attendance"
        value={rate === null ? "None yet" : `${rate}%`}
        hint={rate === null ? "No required events in 90 days" : `${o.attendance.attended} attended · ${o.attendance.excused} excused · ${o.attendance.missed} missed`}
        href={`${base}/events`}
        tone={rate !== null && rate < 70 ? "warning" : undefined}
      />
      <Tile icon={Sparkles} label="Events attended" value={Number(o.events_attended_90d)} hint="Last 90 days" href={`${base}/events`} />
      {modules.philanthropy ? (
        <Tile icon={HandHeart} label="Service hours" value={formatHours(service)} hint={pending ? `${formatHours(pending)} awaiting approval` : "Approved this school year"} href={`${base}/philanthropy`} />
      ) : modules.academics ? (
        <Tile icon={GraduationCap} label="Academic goals" value={Number(o.goals_active)} hint="Active goals" href={`${base}/academics`} />
      ) : (
        <Tile icon={Users} label="Chapter members" value={Number(o.chapter.active_members)} hint={Number(o.chapter.joined_30d) ? `${o.chapter.joined_30d} joined this month` : "Active members"} href={`${base}/directory`} />
      )}
      <Tile icon={Award} label="Badges earned" value={Number(o.badges.count)} hint={o.badges.recent[0] ? `Latest: ${o.badges.recent[0].name}` : "Officers award badges"} href={`${base}/members/${userId}`} />
    </div>
  );
}

type Todo = { key: string; icon: LucideIcon; label: string; detail?: string; href: string | null; urgent?: boolean };

export function TodoCard({ o, base, modules, balanceDue, canRecruit }: { o: MemberOverview; base: string; modules: Modules; balanceDue: boolean; canRecruit: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const items: Todo[] = [
    ...o.acks.map((a) => ({ key: `ack-${a.id}`, icon: Megaphone, label: a.title, detail: "Acknowledge announcement", href: `${base}/announcements#${a.id}`, urgent: true })),
    ...o.tasks.map((t) => ({
      key: `task-${t.id}`,
      icon: ClipboardList,
      label: t.title,
      detail: t.due_at ? `Due ${dayFmt.format(new Date(t.due_at))}` : "Assigned to you",
      href: taskHref(base, t.module, modules, canRecruit),
      urgent: Boolean(t.due_at && t.due_at.slice(0, 10) <= today),
    })),
    ...(modules.housing ? o.chores.map((c) => ({ key: `chore-${c.id}`, icon: House, label: c.title, detail: c.due_on <= today ? "Chore due today" : `Chore due ${dayFmt.format(new Date(`${c.due_on}T00:00:00Z`))}`, href: `${base}/housing`, urgent: c.due_on <= today })) : []),
  ];
  if (modules.standards && Number(o.policies_due) > 0) {
    items.push({ key: "policies", icon: FileCheck2, label: `${o.policies_due} ${Number(o.policies_due) === 1 ? "policy" : "policies"} to acknowledge`, href: `${base}/standards`, urgent: true });
  }
  if (modules.standards && Number(o.trainings_due.count) > 0) {
    const next = o.trainings_due.next_due;
    items.push({ key: "trainings", icon: BookOpen, label: `${o.trainings_due.count} ${Number(o.trainings_due.count) === 1 ? "training" : "trainings"} to complete`, detail: next ? `Next due ${dayFmt.format(new Date(`${next}T00:00:00Z`))}` : undefined, href: `${base}/standards`, urgent: Boolean(next && next <= today) });
  }
  const extraTasks = Number(o.open_tasks) - o.tasks.length;
  return (
    <Card>
      <CardHeader title="Your to-dos" description={items.length ? `${items.length + Math.max(0, extraTasks)} waiting on you` : undefined} />
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5 text-sm text-ink-2">
          <span className="grid size-8 place-items-center rounded-full bg-positive/10 text-positive">
            <CheckCircle2 className="size-4" aria-hidden />
          </span>
          {balanceDue ? "Nothing else waiting. Your dues balance is below." : "You're all caught up."}
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((t) => (
            <li key={t.key}>
              {t.href ? (
                <Link href={t.href} className="flex items-start gap-3 px-5 py-3 hover:bg-canvas/60">
                  <TodoRow t={t} />
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-5 py-3">
                  <TodoRow t={t} />
                </div>
              )}
            </li>
          ))}
          {extraTasks > 0 ? <li className="px-5 py-2.5 text-[12px] text-ink-3">{extraTasks} more assigned tasks</li> : null}
        </ul>
      )}
    </Card>
  );
}

function TodoRow({ t }: { t: Todo }) {
  return (
    <>
      <t.icon className={cx("mt-0.5 size-4 shrink-0", t.urgent ? "text-accent" : "text-ink-3")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{t.label}</span>
        {t.detail ? <span className={cx("block text-[12px]", t.urgent ? "text-accent" : "text-ink-3")}>{t.detail}</span> : null}
      </span>
    </>
  );
}

export function PlaceCard({ o, base }: { o: MemberOverview; base: string }) {
  const roles = o.roles.map((r, i) => ({ id: `${i}`, name: r.name, tone: r.tone }));
  return (
    <Card>
      <CardHeader title="Your place in the chapter" />
      <dl className="space-y-4 px-5 pb-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Status</dt>
          <dd className="text-right text-ink">
            {MEMBER_CLASS_LABEL[o.membership.member_class] ?? o.membership.member_class}
            <span className="block text-[12px] text-ink-3">Since {sinceFmt.format(new Date(o.membership.joined_at))}</span>
          </dd>
        </div>
        {roles.length ? (
          <div>
            <dt className="mb-1.5 text-ink-3">Roles</dt>
            <dd>
              <RoleBadges roles={roles} limit={6} />
            </dd>
          </div>
        ) : null}
        {o.committees.length ? (
          <div>
            <dt className="mb-1.5 text-ink-3">Committees</dt>
            <dd className="flex flex-wrap gap-1.5">
              {o.committees.map((c) => (
                <Badge key={c.name} tone={c.role === "chair" ? "gold" : "neutral"}>
                  {c.name}
                  {c.role === "chair" ? " · Chair" : ""}
                </Badge>
              ))}
            </dd>
          </div>
        ) : null}
        {o.mentorship.mentors.length || o.mentorship.mentees.length ? (
          <div>
            <dt className="mb-1.5 text-ink-3">{o.mentorship.mentors.length ? "Mentor" : "Mentees"}</dt>
            <dd className="space-y-1.5">
              {[...o.mentorship.mentors, ...o.mentorship.mentees].map((p) => (
                <Link key={p.user_id} href={`${base}/members/${p.user_id}`} className="flex items-center gap-2 text-ink hover:underline">
                  <Avatar name={p.name} size="xs" />
                  {p.name}
                </Link>
              ))}
            </dd>
          </div>
        ) : null}
        {o.badges.recent.length ? (
          <div>
            <dt className="mb-1.5 text-ink-3">Recent badges</dt>
            <dd className="flex flex-wrap gap-1.5">
              {o.badges.recent.map((b) => (
                <span key={`${b.name}-${b.awarded_at}`} className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[12px] text-accent">
                  <BadgeIcon icon={b.icon} className="size-3.5" />
                  {b.name}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

export function NewMembersCard({ o, base }: { o: MemberOverview; base: string }) {
  if (!o.chapter.newest.length) return null;
  return (
    <Card>
      <CardHeader title="Say hi to new members" description={`${o.chapter.joined_30d} joined in the last 30 days`} />
      <ul className="space-y-2.5 px-5 pb-5">
        {o.chapter.newest.map((m) => (
          <li key={m.user_id}>
            <Link href={`${base}/members/${m.user_id}`} className="flex items-center gap-2.5 text-sm text-ink hover:underline">
              <Avatar name={m.name} size="xs" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="text-[12px] text-ink-3">{dayFmt.format(new Date(m.joined_at))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function taskHref(base: string, module: string, modules: Modules, canRecruit: boolean): string | null {
  if (module === "recruitment") return modules.recruitment && canRecruit ? `${base}/recruitment` : null;
  if (module === "events") return `${base}/events`;
  if (module === "housing") return modules.housing ? `${base}/housing` : null;
  if (module === "philanthropy") return modules.philanthropy ? `${base}/philanthropy` : null;
  if (module === "finance") return `${base}/dues`;
  return null;
}

function formatHours(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}
