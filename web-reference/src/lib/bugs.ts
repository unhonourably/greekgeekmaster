import type { Tone } from "@/components/ui";

export const BUG_STATUSES = ["new", "triaged", "in_progress", "fixed", "wont_fix", "duplicate", "cant_reproduce"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

export const BUG_OPEN: readonly BugStatus[] = ["new", "triaged", "in_progress"];
export const BUG_CLOSED: readonly BugStatus[] = ["fixed", "wont_fix", "duplicate", "cant_reproduce"];

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  fixed: "Fixed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
  cant_reproduce: "Can't reproduce",
};

export const BUG_STATUS_TONE: Record<BugStatus, Tone> = {
  new: "accent",
  triaged: "info",
  in_progress: "warning",
  fixed: "positive",
  wont_fix: "neutral",
  duplicate: "neutral",
  cant_reproduce: "neutral",
};

export const BUG_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const BUG_SEVERITY_HINT: Record<BugSeverity, string> = {
  critical: "Money, data loss, or nobody can sign in",
  high: "A main feature is broken",
  medium: "Broken, but there is a workaround",
  low: "Cosmetic or minor",
};
export const BUG_SEVERITY_TONE: Record<BugSeverity, Tone> = { critical: "danger", high: "warning", medium: "gold", low: "neutral" };
export const BUG_SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const BUG_AREAS = ["payments", "dues", "chat", "events", "recruitment", "directory", "housing", "onboarding", "account", "notifications", "admin", "marketing", "other"] as const;
export type BugArea = (typeof BUG_AREAS)[number];

export const BUG_AREA_LABEL: Record<BugArea, string> = {
  payments: "Payments",
  dues: "Dues",
  chat: "Chat",
  events: "Events",
  recruitment: "Recruitment",
  directory: "Directory",
  housing: "Housing",
  onboarding: "Onboarding",
  account: "Account",
  notifications: "Notifications",
  admin: "Platform admin",
  marketing: "Public site",
  other: "Other",
};

const AREA_BY_SEGMENT: Record<string, BugArea> = {
  chat: "chat",
  events: "events",
  recruitment: "recruitment",
  directory: "directory",
  members: "directory",
  dues: "dues",
  billing: "dues",
  finances: "payments",
  payments: "payments",
  reimbursements: "payments",
  housing: "housing",
  setup: "onboarding",
};

export function guessArea(page: string): BugArea | null {
  if (page.startsWith("/admin")) return "admin";
  if (page.startsWith("/account")) return "account";
  if (page.startsWith("/notifications")) return "notifications";
  if (page.startsWith("/apply") || page.startsWith("/onboarding") || page.startsWith("/signup") || page.startsWith("/login")) return "onboarding";
  const chapter = page.match(/^\/c\/[^/]+\/([^/?#]+)/);
  if (chapter) return AREA_BY_SEGMENT[chapter[1]] ?? null;
  return null;
}

export function normalizePage(page: string): string {
  return page
    .replace(/[?#].*$/, "")
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/[id]")
    .replace(/^\/c\/[^/]+/, "/c/[chapter]");
}

export function describeAgent(agent: string | null): string {
  if (!agent) return "Unknown browser";
  const browser =
    agent.match(/Edg\/(\d+)/) ? `Edge ${agent.match(/Edg\/(\d+)/)![1]}`
    : agent.match(/OPR\/(\d+)/) ? `Opera ${agent.match(/OPR\/(\d+)/)![1]}`
    : agent.match(/Firefox\/(\d+)/) ? `Firefox ${agent.match(/Firefox\/(\d+)/)![1]}`
    : agent.match(/CriOS\/(\d+)/) ? `Chrome ${agent.match(/CriOS\/(\d+)/)![1]}`
    : agent.match(/Chrome\/(\d+)/) ? `Chrome ${agent.match(/Chrome\/(\d+)/)![1]}`
    : agent.match(/Version\/(\d+)[\d.]* .*Safari/) ? `Safari ${agent.match(/Version\/(\d+)/)![1]}`
    : "Unknown browser";
  const system =
    /iPhone|iPad|iPod/.test(agent) ? "iOS"
    : /Android/.test(agent) ? "Android"
    : /Windows/.test(agent) ? "Windows"
    : /Mac OS X|Macintosh/.test(agent) ? "macOS"
    : /CrOS/.test(agent) ? "ChromeOS"
    : /Linux/.test(agent) ? "Linux"
    : null;
  return system ? `${browser} on ${system}` : browser;
}

export function bugTitle(message: string, length = 90): string {
  const line = message.trim().split(/\n/)[0].trim();
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line;
}

export function isOpen(status: string): boolean {
  return (BUG_OPEN as readonly string[]).includes(status);
}
