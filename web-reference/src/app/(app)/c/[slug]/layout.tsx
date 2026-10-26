import { BugReport } from "@/components/bug-report";
import { ChapterMain } from "@/components/chapter-main";
import { ChapterNav, type NavGroup } from "@/components/chapter-nav";
import { ChapterUnreadProvider } from "@/components/chapter-unread";
import { serverEnv } from "@/lib/env";
import { Notice } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { getReadiness } from "@/lib/readiness";
import { viewerIsPledge } from "@/lib/pledge";
import { setupLocked } from "@/lib/setup-access";
import { createClient } from "@/lib/supabase/server";

export default async function ChapterLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await requireChapter(slug);
  const { chapter, can } = ctx;
  const base = `/c/${chapter.slug}`;
  const supabase = await createClient();
  const canSetupPayments = can("chapter.manage") || can("payments.configure");
  const [{ data: unread }, readiness, pledge, locked] = await Promise.all([
    supabase.rpc("chapter_unread_total", { p_chapter: chapter.id }),
    canSetupPayments ? getReadiness(chapter.id) : Promise.resolve(null),
    viewerIsPledge(chapter.id),
    setupLocked(chapter.id),
  ]);
  const modules = chapter.modules ?? {};

  const home: NavGroup = {
    items: [
      { key: "overview", label: "Overview", href: base, exact: true },
      { key: "chat", label: "Messages", href: `${base}/chat`, badge: Number(unread ?? 0) },
      { key: "announcements", label: "Announcements", href: `${base}/announcements` },
      { key: "events", label: "Events", href: `${base}/events` },
      { key: "directory", label: "Directory", href: `${base}/directory` },
      { key: "dues", label: "My dues", href: `${base}/dues` },
      { key: "reimbursements", label: "Reimbursements", href: `${base}/reimbursements` },
    ],
  };
  if (can("chapter.manage")) home.items.splice(1, 0, { key: "setup", label: "Setup", href: `${base}/setup` });
  const groups: NavGroup[] = [home];
  const officer: NavGroup = { label: "Officers", items: [] };
  if (can("finance.view")) officer.items.push({ key: "finances", label: "Finances", href: `${base}/finances` });
  if (canSetupPayments) officer.items.push({ key: "payments", label: "Stripe setup", href: `${base}/settings/billing`, tag: readiness?.can_collect ? undefined : "Set up" });
  if (modules.recruitment && (can("recruitment.view") || can("recruitment.manage"))) officer.items.push({ key: "recruitment", label: "Recruitment", href: `${base}/recruitment` });
  if (can("analytics.view")) officer.items.push({ key: "analytics", label: "Analytics", href: `${base}/analytics` });
  if (officer.items.length) groups.push(officer);

  const programs: NavGroup = { label: "Programs", items: [] };
  if (modules.philanthropy) programs.items.push({ key: "philanthropy", label: "Philanthropy", href: `${base}/philanthropy` });
  if (modules.housing && !pledge) programs.items.push({ key: "housing", label: "Housing", href: `${base}/housing` });
  if (modules.standards) programs.items.push({ key: "standards", label: "Standards", href: `${base}/standards` });
  if (modules.academics) programs.items.push({ key: "academics", label: "Academics", href: `${base}/academics` });
  if (programs.items.length) groups.push(programs);

  if (can("chapter.manage") || can("members.manage") || can("roles.manage") || can("payments.configure") || can("audit.view")) {
    groups.push({ items: [{ key: "settings", label: "Settings", href: `${base}/settings` }] });
  }

  return (
    <ChapterUnreadProvider
      initial={Number(unread ?? 0)}
      chapterId={chapter.id}
      chatBase={`${base}/chat`}
      meId={ctx.user.id}
      supabaseUrl={serverEnv.supabaseUrl()}
      supabaseKey={serverEnv.supabasePublishableKey()}
    >
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
            <div className="mb-5 px-3">
              <p className="truncate text-sm font-semibold text-ink">{chapter.organization_name}</p>
              <p className="truncate text-[12px] text-ink-3">{[chapter.designation, chapter.university?.short_name ?? chapter.university?.name].filter(Boolean).join(" · ")}</p>
            </div>
            <ChapterNav groups={groups} />
          </div>
          <div className="shrink-0 border-t border-line px-3 py-3">
            <BugReport />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <details className="border-b border-line bg-surface lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            {chapter.organization_name} <span className="text-ink-3">· Menu</span>
          </summary>
          <div className="px-2 pb-4">
            <ChapterNav groups={groups} />
            <div className="mt-4 border-t border-line px-1 pt-3">
              <BugReport />
            </div>
          </div>
        </details>
        {chapter.status === "suspended" ? (
          <div className="px-4 pt-6 sm:px-8">
            <Notice tone="danger" title="This chapter is suspended">
              Payments and invitations are paused. Contact support if you believe this is a mistake.
            </Notice>
          </div>
        ) : null}
        <ChapterMain base={base} setupLocked={locked}>{children}</ChapterMain>
      </div>
    </div>
    </ChapterUnreadProvider>
  );
}
