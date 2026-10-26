"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  CreditCard,
  HandHeart,
  House,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  MousePointerClick,
  Receipt,
  RotateCcw,
  Scale,
  Settings,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";

export const SAMPLE_CHAPTER = { name: "Alpha Beta", detail: "Sample chapter · State University", slug: "sample-chapter" };

export type NavKey = "overview" | "chat" | "announcements" | "events" | "directory" | "dues" | "reimbursements" | "finances" | "recruitment" | "analytics" | "philanthropy" | "housing" | "standards" | "academics" | "settings";

type NavEntry = { key: NavKey; label: string; icon: LucideIcon; section: string };

export const NAV_GROUPS: Array<{ label?: string; items: NavEntry[] }> = [
  {
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard, section: "more" },
      { key: "chat", label: "Messages", icon: MessagesSquare, section: "chat" },
      { key: "announcements", label: "Announcements", icon: Megaphone, section: "announcements" },
      { key: "events", label: "Events", icon: CalendarDays, section: "events" },
      { key: "directory", label: "Directory", icon: Users, section: "privacy" },
      { key: "dues", label: "My dues", icon: CreditCard, section: "dues" },
      { key: "reimbursements", label: "Reimbursements", icon: Receipt, section: "more" },
    ],
  },
  {
    label: "Officers",
    items: [
      { key: "finances", label: "Finances", icon: Wallet, section: "ledger" },
      { key: "recruitment", label: "Recruitment", icon: UserPlus, section: "recruitment" },
      { key: "analytics", label: "Analytics", icon: ChartColumn, section: "more" },
    ],
  },
  {
    label: "Programs",
    items: [
      { key: "philanthropy", label: "Philanthropy", icon: HandHeart, section: "philanthropy" },
      { key: "housing", label: "Housing", icon: House, section: "more" },
      { key: "standards", label: "Standards", icon: Scale, section: "standards" },
      { key: "academics", label: "Academics", icon: BookOpen, section: "more" },
    ],
  },
  { items: [{ key: "settings", label: "Settings", icon: Settings, section: "roles" }] },
];

export function scrollToSection(id: string) {
  const node = document.getElementById(id);
  if (!node) return false;
  const bar = document.querySelector<HTMLElement>("[data-section-nav]");
  const top = node.getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight ?? 0);
  window.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  window.history.replaceState(null, "", `#${id}`);
  return true;
}

function localIso(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

const noSubscribe = () => () => {};

export function useToday(): string {
  return useSyncExternalStore(noSubscribe, () => localIso(new Date()), () => "2026-11-02");
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mediumDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function TryIt({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-start gap-2 text-[13px] text-ink-2">
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-accent/30 bg-accent-soft px-1.5 py-px text-[12px] font-medium leading-5 text-accent">
        <MousePointerClick className="size-3.5" aria-hidden />
        Interactive
      </span>
      <span className="pt-px">{children}</span>
    </p>
  );
}

export function AppFrame({ path, active, onReset, children, bodyClassName, nav = true }: { path: string; active: NavKey; onReset?: () => void; children: ReactNode; bodyClassName?: string; nav?: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line-strong bg-canvas">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-canvas px-2.5 py-1 font-mono text-[11px] text-ink-3">greekgeek.org{path.startsWith("/account") ? path : `/c/${SAMPLE_CHAPTER.slug}${path}`}</span>
        <span className="hidden text-[12px] text-ink-3 sm:inline">Sample data</span>
        {onReset ? (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-3 transition-colors hover:bg-subtle hover:text-ink">
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
        ) : null}
      </div>
      <div className="flex">
        {nav ? (
          <aside className="hidden w-52 shrink-0 border-r border-line bg-surface px-3 py-5 lg:block">
            <div className="mb-5 px-3">
              <p className="truncate text-sm font-semibold text-ink">{SAMPLE_CHAPTER.name}</p>
              <p className="truncate text-[12px] text-ink-3">{SAMPLE_CHAPTER.detail}</p>
            </div>
            <nav aria-label="Sample chapter sections" className="space-y-5">
              {NAV_GROUPS.map((group, index) => (
                <div key={group.label ?? index}>
                  {group.label ? <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-3">{group.label}</p> : null}
                  <ul className="space-y-px">
                    {group.items.map((item) => {
                      const on = item.key === active;
                      return (
                        <li key={item.key}>
                          <a
                            href={`/features#${item.section}`}
                            onClick={(event) => {
                              if (scrollToSection(item.section)) event.preventDefault();
                            }}
                            aria-current={on ? "page" : undefined}
                            className={cx("flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm", on ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:bg-subtle/70 hover:text-ink")}
                          >
                            <item.icon className={cx("size-4 shrink-0", on ? "text-accent" : "text-ink-3")} aria-hidden />
                            <span className="flex-1 truncate">{item.label}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
        ) : null}
        <div className={cx("min-w-0 flex-1 px-4 py-6 sm:px-8", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

export function MockHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[13px] text-ink-3">{eyebrow}</div> : null}
        <p className="text-xl font-semibold tracking-tight text-ink">{title}</p>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SubNavMock({ items, active }: { items: string[]; active: string }) {
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]" aria-label="Section">
      {items.map((item) => (
        <span key={item} aria-current={item === active ? "page" : undefined} className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", item === active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2")}>
          {item}
        </span>
      ))}
    </nav>
  );
}
