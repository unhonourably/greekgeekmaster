import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, Building2, CalendarDays, Check, FileText, Mail, Settings, ShieldCheck, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { Avatar, personName } from "@/components/people";
import { Badge, ButtonLink, Card, CardBody, CardHeader, cx } from "@/components/ui";
import { getMyChapters, getMyProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/lib/notifications";
import { formatCents } from "@/lib/money";
import { formatRelative } from "@/lib/format";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS, type ApplicationKind, type ApplicationStatus } from "@/lib/applications";
import { MEMBER_CLASS_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Home" };

type ApplicationRow = {
  id: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  organization_name: string | null;
  designation: string | null;
  proposed_university_name: string | null;
  updated_at: string;
  created_chapter_id: string | null;
  university: { name: string } | null;
};

type EventRow = { id: string; chapter_id: string; title: string; starts_at: string; location: string | null; attendance_required: boolean };
type Balance = { balance_cents: number; processing_cents: number; next_due_date: string | null };

const STEPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: FileText, title: "Apply", body: "Tell us about your chapter and verify your school email." },
  { icon: ShieldCheck, title: "Get verified", body: "We review every chapter before it goes live." },
  { icon: UserPlus, title: "Invite members", body: "Send invitations or import your roster." },
  { icon: Wallet, title: "Collect dues", body: "Connect Stripe and members pay online." },
];

export default async function HomePage() {
  const user = await requireUser("/home");
  const supabase = await createClient();
  const now = new Date();
  const [chapters, profile, { data: apps }, notifications] = await Promise.all([
    getMyChapters(),
    getMyProfile(),
    supabase
      .from("chapter_applications")
      .select("id, kind, status, organization_name, designation, proposed_university_name, updated_at, created_chapter_id, university:universities(name)")
      .eq("applicant_id", user.id)
      .neq("status", "withdrawn")
      .order("updated_at", { ascending: false })
      .limit(10),
    listNotifications(5),
  ]);
  const applications = (apps ?? []) as unknown as ApplicationRow[];
  const openApplications = applications.filter((a) => a.status !== "verified");
  const verifiedChapters = chapters.filter((c) => c.status === "verified");

  const [{ data: eventRows }, balances] = await Promise.all([
    verifiedChapters.length > 0
      ? supabase
          .from("events")
          .select("id, chapter_id, title, starts_at, location, attendance_required")
          .in("chapter_id", verifiedChapters.map((c) => c.id))
          .is("cancelled_at", null)
          .gte("ends_at", now.toISOString())
          .order("starts_at")
          .limit(5)
      : Promise.resolve({ data: [] }),
    Promise.all(
      verifiedChapters.map(async (c) => {
        const { data } = await supabase.rpc("member_balance", { p_membership: c.membership_id });
        return [c.id, data as Balance | null] as const;
      }),
    ),
  ]);
  const events = (eventRows ?? []) as EventRow[];
  const balanceByChapter = new Map(balances);
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const totalDue = balances.reduce((sum, [, b]) => sum + Number(b?.balance_cents ?? 0), 0);

  const name = personName(profile ?? {});
  const firstName = profile?.display_name || profile?.full_name?.split(" ")[0] || "";
  const checklist = [
    { label: "Add your name", done: Boolean(profile?.full_name?.trim()) },
    { label: "Add a profile photo", done: Boolean(profile?.avatar_path) },
    { label: "Add your graduation year", done: Boolean(profile?.graduation_year) },
    { label: "Join or register a chapter", done: chapters.length > 0 },
  ];
  const remaining = checklist.filter((i) => !i.done).length;
  const dueFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface px-5 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} path={profile?.avatar_path} size="md" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink">
              {firstName ? `Welcome, ${firstName}` : "Welcome"}
            </h1>
            <p className="truncate text-[13px] text-ink-3">{user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/account" variant="ghost" size="sm">
            <Settings className="size-4" aria-hidden />
            Account
          </ButtonLink>
          <ButtonLink href="/onboarding" variant="secondary" size="sm">
            <Building2 className="size-4" aria-hidden />
            Register a chapter
          </ButtonLink>
        </div>
      </header>

      {chapters.length > 0 ? (
        <dl className="mb-6 grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
          <SummaryStat label="Chapters" value={String(chapters.length)} />
          <SummaryStat label="Dues balance" value={formatCents(totalDue)} tone={totalDue > 0 ? "warning" : undefined} />
          <SummaryStat label="Upcoming events" value={String(events.length)} />
        </dl>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {chapters.length > 0 ? (
            <Card>
              <CardHeader title="Your chapters" />
              <ul className="divide-y divide-line">
                {chapters.map((c) => {
                  const b = balanceByChapter.get(c.id);
                  const due = Number(b?.balance_cents ?? 0);
                  return (
                    <li key={c.id}>
                      <Link href={`/c/${c.slug}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-canvas/60">
                        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                          <Building2 className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">{c.organization_name}</span>
                          <span className="block truncate text-[13px] text-ink-3">
                            {[c.designation, c.university_name, MEMBER_CLASS_LABEL[c.member_class]].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {c.status !== "verified" ? (
                          <Badge tone="danger">{c.status === "suspended" ? "Suspended" : c.status}</Badge>
                        ) : (
                          <span className="hidden text-right sm:block">
                            <span className={cx("block text-sm font-medium tnum", due > 0 ? "text-warning" : "text-ink-2")}>{due > 0 ? `${formatCents(due)} due` : "Paid up"}</span>
                            {due > 0 && b?.next_due_date ? <span className="block text-[12px] text-ink-3">Next due {dueFmt.format(new Date(b.next_due_date))}</span> : null}
                          </span>
                        )}
                        <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader title="Get started" description="Officers register their chapter. Members join by invitation." />
              <div className="grid md:grid-cols-2 md:divide-x divide-line max-md:divide-y">
                <CardBody className="space-y-3 py-5">
                  <span className="grid size-9 place-items-center rounded-md bg-accent-soft text-accent">
                    <Building2 className="size-4.5" aria-hidden />
                  </span>
                  <h2 className="text-sm font-semibold text-ink">Register your chapter</h2>
                  <p className="text-[13px] text-ink-2">For officers setting up their chapter. We verify every chapter before it can invite members or collect dues.</p>
                  <ButtonLink href="/onboarding" size="sm">Start an application</ButtonLink>
                </CardBody>
                <CardBody className="space-y-3 py-5">
                  <span className="grid size-9 place-items-center rounded-md bg-subtle text-ink-2">
                    <Mail className="size-4.5" aria-hidden />
                  </span>
                  <h2 className="text-sm font-semibold text-ink">Joining a chapter?</h2>
                  <p className="text-[13px] text-ink-2">
                    Ask an officer to invite <span className="font-medium text-ink">{user.email}</span>, then open the link in the email.
                  </p>
                </CardBody>
              </div>
              <ol className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3 bg-surface px-5 py-4">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-[11px] font-medium text-ink-2 tnum">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        <s.icon className="size-3.5 text-accent" aria-hidden />
                        {s.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{s.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {openApplications.length > 0 ? (
            <Card>
              <CardHeader title="Chapter applications" description="Applications you started or submitted." />
              <ul className="divide-y divide-line">
                {openApplications.map((a) => {
                  const s = APPLICATION_STATUS[a.status];
                  const appName = [a.organization_name, a.designation].filter(Boolean).join(", ") || "Untitled application";
                  return (
                    <li key={a.id}>
                      <Link href={`/onboarding/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-canvas/60">
                        <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{appName}</span>
                          <span className="block truncate text-[13px] text-ink-3">
                            {APPLICATION_KIND_LABEL[a.kind]} · {a.university?.name ?? a.proposed_university_name ?? "University not set"}
                          </span>
                        </span>
                        <span className="hidden text-[12px] text-ink-3 sm:block">Updated {formatRelative(a.updated_at, now)}</span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {verifiedChapters.length > 0 ? (
            <Card>
              <CardHeader title="Upcoming events" />
              {events.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-5 text-[13px] text-ink-3">
                  <CalendarDays className="size-4" aria-hidden />
                  Nothing scheduled. Events from your chapters will appear here.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {events.map((e) => {
                    const c = chapterById.get(e.chapter_id);
                    const tz = c?.timezone ?? "America/Chicago";
                    const start = new Date(e.starts_at);
                    return (
                      <li key={e.id}>
                        <Link href={`/c/${c?.slug}/events/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-canvas/60">
                          <span className="flex w-11 shrink-0 flex-col items-center rounded-md border border-line bg-canvas py-1">
                            <span className="text-[10px] font-medium uppercase text-accent">{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: tz }).format(start)}</span>
                            <span className="text-sm font-semibold text-ink tnum">{new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: tz }).format(start)}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                            <span className="block truncate text-[13px] text-ink-3">
                              {[new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(start), e.location, chapters.length > 1 ? c?.organization_name : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          {e.attendance_required ? <Badge tone="gold">Required</Badge> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Notifications" actions={<Link href="/notifications" className="text-[13px] text-ink-3 hover:text-ink">View all</Link>} />
            {notifications.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-5 text-[13px] text-ink-3">
                <Bell className="size-4" aria-hidden />
                You are all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {notifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                    <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", n.read_at ? "bg-line-strong" : "bg-accent")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate text-[13px]", n.read_at ? "text-ink-2" : "font-medium text-ink")}>{n.title}</span>
                      <span className="block text-[12px] text-ink-3">{formatRelative(n.created_at, now)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {remaining > 0 ? (
            <Card>
              <CardHeader title="Finish your profile" description={`${checklist.length - remaining} of ${checklist.length} done`} />
              <div className="px-5 pt-4">
                <div className="h-1 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${((checklist.length - remaining) / checklist.length) * 100}%` }} />
                </div>
              </div>
              <ul className="space-y-2.5 px-5 py-4">
                {checklist.map((i) => (
                  <li key={i.label} className="flex items-center gap-2.5 text-[13px]">
                    <span className={cx("grid size-4 shrink-0 place-items-center rounded-full border", i.done ? "border-accent bg-accent text-on-accent" : "border-line-strong")}>
                      {i.done ? <Check className="size-3" aria-hidden /> : null}
                    </span>
                    <span className={i.done ? "text-ink-3 line-through" : "text-ink-2"}>{i.label}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-3">
                <Link href="/account" className="text-[13px] font-medium text-accent hover:text-accent-hover">Open account settings</Link>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cx("mt-0.5 text-lg font-semibold tnum", tone === "warning" ? "text-warning" : "text-ink")}>{value}</dd>
    </div>
  );
}
