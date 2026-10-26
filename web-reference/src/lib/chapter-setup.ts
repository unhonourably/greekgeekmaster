import "server-only";
import type { Permission } from "@/lib/permissions";
import { getStaffRole } from "@/lib/auth";
import { getReadiness, subscriptionInGoodStanding, type Readiness } from "@/lib/readiness";
import { createClient } from "@/lib/supabase/server";

export type SetupStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
  skipped: boolean;
  optional: boolean;
  preview: boolean;
};

const SKIPPABLE = ["housing", "events", "recruitment", "philanthropy", "academics", "standards"] as const;
export type SkippableStep = (typeof SKIPPABLE)[number];

export function isSkippableStep(value: string): value is SkippableStep {
  return (SKIPPABLE as readonly string[]).includes(value);
}

function billingDetail(readiness: Readiness | null): string {
  if (!readiness?.terms_accepted) return "Accept the chapter agreement, start the monthly subscription, and connect Stripe. Billing walks through each of those.";
  if (!subscriptionInGoodStanding(readiness.subscription)) return "Start the monthly subscription, then connect Stripe so members can pay online.";
  if (!readiness.can_collect) return "Finish connecting Stripe so card payments and payouts are turned on.";
  return "Members can pay dues online.";
}

export async function loadChapterSetup(chapter: { id: string; slug: string; modules: Record<string, boolean> }, can: (permission: Permission) => boolean): Promise<SetupStep[]> {
  const supabase = await createClient();
  const base = `/c/${chapter.slug}`;
  const modules = chapter.modules ?? {};
  const [readiness, profile, members, invites, roles, policies, rooms, events, prospects, campaigns, mentors, studyGroups] = await Promise.all([
    can("chapter.manage") || can("payments.configure") || can("finance.view") ? getReadiness(chapter.id) : Promise.resolve(null),
    supabase.from("chapters").select("description, setup_skipped").eq("id", chapter.id).single(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id).eq("status", "active"),
    supabase.from("chapter_invitations").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id).eq("status", "pending"),
    supabase.from("role_assignments").select("roles(key)").eq("chapter_id", chapter.id).is("ends_at", null),
    supabase.from("policy_documents").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id).gt("current_version", 0),
    supabase.from("housing_rooms").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id).is("archived_at", null),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id),
    supabase.from("prospects").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id),
    supabase.from("fundraising_campaigns").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id),
    supabase.from("mentorship_pairs").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id),
    supabase.from("study_groups").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id),
  ]);

  const skipped = new Set(((profile.data?.setup_skipped ?? []) as string[]).filter(isSkippableStep));
  const description = ((profile.data?.description as string | null) ?? "").trim();
  const officerAssigned = (roles.data ?? []).some((row) => {
    const role = row.roles as { key?: string } | { key?: string }[] | null;
    const key = Array.isArray(role) ? role[0]?.key : role?.key;
    return Boolean(key && key !== "chapter_admin");
  });
  const settings = `${base}/settings#modules`;

  const steps: Array<Omit<SetupStep, "done" | "preview"> & { complete: boolean }> = [
    {
      id: "profile",
      title: "Write the chapter profile",
      detail: "Add a short description in Settings so members can tell this account is yours. Confirm the time zone while you are there.",
      href: `${base}/settings`,
      optional: false,
      skipped: false,
      complete: description.length >= 20,
    },
    {
      id: "roster",
      title: "Invite the roster",
      detail: "Invite members from the Members page. A pending invitation is enough to finish this step.",
      href: `${base}/settings/members`,
      optional: false,
      skipped: false,
      complete: (members.count ?? 0) > 1 || (invites.count ?? 0) > 0,
    },
    {
      id: "officers",
      title: "Assign officer roles",
      detail: "Give someone treasurer, secretary, or another officer role. The chapter administrator role on its own leaves this step open.",
      href: `${base}/settings/roles`,
      optional: false,
      skipped: false,
      complete: officerAssigned,
    },
    {
      id: "billing",
      title: "Turn on dues collection",
      detail: billingDetail(readiness),
      href: `${base}/settings/billing`,
      optional: false,
      skipped: false,
      complete: Boolean(readiness?.can_collect),
    },
    {
      id: "standards",
      title: "Publish a standards policy",
      detail: modules.standards
        ? "Publish bylaws or a risk policy from Standards. Members can then read it and acknowledge it."
        : "Turn on Standards in Settings, then publish a policy. Skip this if you will write policies later.",
      href: modules.standards ? `${base}/standards` : settings,
      optional: true,
      skipped: skipped.has("standards"),
      complete: Boolean(modules.standards) && (policies.count ?? 0) > 0,
    },
    {
      id: "housing",
      title: "Set up the house",
      detail: modules.housing
        ? can("housing.manage")
          ? "Add the rooms and give each floor its own name. Skip this if the chapter does not have a house."
          : "A chapter administrator adds the rooms and names each floor. Skip this if the chapter does not have a house."
        : "Turn on Housing in Settings, then add rooms and name each floor. Skip this if the chapter does not have a house.",
      href: !modules.housing ? settings : can("housing.manage") ? `${base}/housing/rooms/new` : `${base}/housing`,
      optional: true,
      skipped: skipped.has("housing"),
      complete: (rooms.count ?? 0) > 0,
    },
    {
      id: "events",
      title: "Schedule the first event",
      detail: "Create an event with a written description and any pictures members should see.",
      href: `${base}/events/new`,
      optional: true,
      skipped: skipped.has("events"),
      complete: (events.count ?? 0) > 0,
    },
    {
      id: "recruitment",
      title: "Open recruitment",
      detail: modules.recruitment
        ? "Add a prospect or confirm the recruitment pipeline is ready."
        : "Turn on Recruitment in Settings and add a prospect, or skip this program.",
      href: modules.recruitment ? `${base}/recruitment` : settings,
      optional: true,
      skipped: skipped.has("recruitment"),
      complete: Boolean(modules.recruitment) && (prospects.count ?? 0) > 0,
    },
    {
      id: "philanthropy",
      title: "Start philanthropy",
      detail: modules.philanthropy
        ? can("philanthropy.manage")
          ? "Add a fundraising campaign so service and donations have a home."
          : "A chapter administrator adds the first fundraising campaign."
        : "Turn on Philanthropy in Settings and add a campaign, or skip this program.",
      href: modules.philanthropy ? `${base}/philanthropy` : settings,
      optional: true,
      skipped: skipped.has("philanthropy"),
      complete: Boolean(modules.philanthropy) && (campaigns.count ?? 0) > 0,
    },
    {
      id: "academics",
      title: "Start academics",
      detail: modules.academics
        ? "Add a study group or a mentorship pair so academic support is in place."
        : "Turn on Academics in Settings and add a study group, or skip this program.",
      href: modules.academics ? `${base}/academics` : settings,
      optional: true,
      skipped: skipped.has("academics"),
      complete: Boolean(modules.academics) && ((mentors.count ?? 0) > 0 || (studyGroups.count ?? 0) > 0),
    },
  ];

  const locked = (await getStaffRole()) !== "admin" && !subscriptionInGoodStanding(readiness?.subscription ?? "none");
  return steps.map((step) => ({
    id: step.id,
    title: step.title,
    detail: step.detail,
    href: step.href,
    optional: step.optional,
    skipped: step.skipped && !step.complete,
    done: step.complete || step.skipped,
    preview: locked && step.id !== "billing",
  }));
}
