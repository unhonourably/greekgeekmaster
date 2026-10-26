import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Megaphone, Pin } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader, TextLink } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { getReadiness, subscriptionInGoodStanding } from "@/lib/readiness";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { plainText } from "@/lib/rich-text";
import { loadChapterSetup } from "@/lib/chapter-setup";
import { viewerIsPledge } from "@/lib/pledge";
import { MemberTiles, NewMembersCard, PlaceCard, RsvpBadge, TodoCard, type MemberOverview } from "./member-panel";
import { OfficerDashboard, OfficerDashboardSkeleton } from "./officer-dashboard";
import { SetupProgress } from "./setup/progress";

export const metadata: Metadata = { title: "Overview" };

export default async function ChapterOverview({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await requireChapter(slug);
  const { chapter, membership, can } = ctx;
  const base = `/c/${chapter.slug}`;
  const supabase = await createClient();
  const now = new Date();

  const [readiness, setup, pledge, { data: balance }, { data: overview }, { data: events }, { data: announcements }] = await Promise.all([
    can("chapter.manage") || can("payments.configure") || can("finance.view") ? getReadiness(chapter.id) : Promise.resolve(null),
    can("chapter.manage") ? loadChapterSetup(chapter, can) : Promise.resolve(null),
    viewerIsPledge(chapter.id),
    supabase.rpc("member_balance", { p_membership: membership.id }),
    supabase.rpc("member_overview", { p_chapter: chapter.id }),
    supabase
      .from("events")
      .select("id, title, starts_at, location, attendance_required, timezone")
      .eq("chapter_id", chapter.id)
      .is("cancelled_at", null)
      .gte("ends_at", now.toISOString())
      .order("starts_at")
      .limit(5),
    supabase
      .from("announcements")
      .select("id, title, body, pinned, published_at, requires_ack")
      .eq("chapter_id", chapter.id)
      .is("archived_at", null)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(4),
  ]);

  const bal = balance as { balance_cents: number; processing_cents: number; next_due_date: string | null } | null;
  const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: chapter.timezone, timeZoneName: "short" });
  const dueFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const setupIncomplete = readiness && !readiness.can_collect;
  const officer = can("announcements.officers") || can("chapter.manage") || can("members.manage");
  const o = overview as MemberOverview | null;
  const modules = chapter.modules ?? {};
  const balanceDue = Number(bal?.balance_cents ?? 0) > 0;

  return (
    <>
      <PageHeader
        title={chapter.organization_name}
        description={[chapter.designation, chapter.university?.name].filter(Boolean).join(" · ")}
        actions={chapter.greek_letters ? <span className="font-serif text-2xl text-ink-3">{chapter.greek_letters}</span> : null}
      />

      {setup ? <SetupProgress steps={setup} base={base} /> : null}

      {setupIncomplete && !can("chapter.manage") ? (
        <Notice
          tone="info"
          title="Finish setting up dues collection"
          className="mb-6"
          action={<ButtonLink href={`${base}/settings/billing`} size="sm" variant="secondary">Continue setup</ButtonLink>}
        >
          {!readiness.terms_accepted
            ? "Accept the chapter agreement, activate the subscription, and connect Stripe."
            : !subscriptionInGoodStanding(readiness.subscription)
              ? "Activate the monthly chapter subscription, then connect Stripe."
              : "Connect Stripe so members can pay online."}
        </Notice>
      ) : null}

      {officer ? (
        <div className="mb-6">
          <Suspense fallback={<OfficerDashboardSkeleton />}>
            <OfficerDashboard chapterId={chapter.id} base={base} recruitment={Boolean(chapter.modules?.recruitment) && can("recruitment.view")} finance={can("finance.view")} manageMembers={can("members.manage")} manageRoles={can("roles.manage")} />
          </Suspense>
        </div>
      ) : null}

      {o ? (
        <section aria-label="Your standing" className="fade-up mb-6 space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-3">Your standing</h2>
          <MemberTiles o={o} base={base} userId={ctx.user.id} modules={modules} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Upcoming events" actions={<TextLink href={`${base}/events`} className="text-[13px]">All events</TextLink>} />
            {(events ?? []).length === 0 ? (
              <EmptyState icon={CalendarDays} title="No upcoming events">
                {can("events.manage") ? <TextLink href={`${base}/events/new`}>Create an event</TextLink> : "Events your chapter schedules will appear here."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {(events ?? []).map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/events/${e.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-canvas/60">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                        <span className="block truncate text-[13px] text-ink-3">
                          {dateFmt.format(new Date(e.starts_at))}
                          {e.location ? ` · ${e.location}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {e.attendance_required ? <Badge tone="gold">Required</Badge> : null}
                        {o ? <RsvpBadge status={o.rsvps[e.id]} /> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Announcements" actions={<TextLink href={`${base}/announcements`} className="text-[13px]">All announcements</TextLink>} />
            {(announcements ?? []).length === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements yet" />
            ) : (
              <ul className="divide-y divide-line">
                {(announcements ?? []).map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <Link href={`${base}/announcements#${a.id}`} className="group block">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink group-hover:underline">
                        {a.pinned ? <Pin className="size-3.5 text-ink-3" aria-label="Pinned" /> : null}
                        {a.title}
                        {a.requires_ack ? <Badge tone="warning">Acknowledge</Badge> : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{plainText(a.body)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {o ? <TodoCard o={o} base={base} modules={pledge ? { ...modules, housing: false } : modules} balanceDue={balanceDue} canRecruit={can("recruitment.view")} /> : null}
          <Card>
            <CardHeader title="My dues" />
            <CardBody>
              <p className="text-[13px] text-ink-3">Current balance</p>
              <p className="mt-1 text-2xl font-semibold text-ink tnum">{formatCents(Number(bal?.balance_cents ?? 0))}</p>
              {bal?.next_due_date ? <p className="mt-1 text-[13px] text-ink-2">Next due {dueFmt.format(new Date(bal.next_due_date))}</p> : null}
              {Number(bal?.processing_cents ?? 0) > 0 ? <p className="mt-1 text-[13px] text-info">{formatCents(Number(bal?.processing_cents))} clearing</p> : null}
              <ButtonLink href={`${base}/dues`} variant="secondary" size="sm" className="mt-4">
                {balanceDue ? "View and pay" : "View history"}
              </ButtonLink>
            </CardBody>
          </Card>
          {o ? <PlaceCard o={o} base={base} /> : null}
          {o ? <NewMembersCard o={o} base={base} /> : null}
        </div>
      </div>
    </>
  );
}
