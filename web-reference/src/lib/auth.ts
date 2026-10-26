import "server-only";
import { cache } from "react";
import { forbidden, notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toPermissionSet, type Permission, type PermissionSet, type MemberClass, type MembershipStatus } from "@/lib/permissions";

export type SessionUser = { id: string; email: string };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export type Profile = { id: string; display_name: string; full_name: string | null; avatar_path: string | null; graduation_year: number | null };

export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, display_name, full_name, avatar_path, graduation_year").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

export type StaffRole = "admin" | "reviewer" | "support" | "finance";

export const getStaffRole = cache(async (): Promise<StaffRole | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_staff_role");
  return (data as StaffRole | null) ?? null;
});

export async function requireStaff(allowed: StaffRole[]): Promise<{ user: SessionUser; role: StaffRole }> {
  const user = await requireUser("/admin");
  const role = await getStaffRole();
  if (!role || (role !== "admin" && !allowed.includes(role))) notFound();
  return { user, role };
}

export type ChapterSummary = {
  id: string;
  slug: string;
  organization_name: string;
  designation: string | null;
  greek_letters: string | null;
  status: "unclaimed" | "verified" | "suspended" | "closed";
  timezone: string;
  currency: string;
  modules: Record<string, boolean>;
  university: { name: string; short_name: string | null } | null;
};

export type ChapterContext = {
  user: SessionUser;
  chapter: ChapterSummary;
  membership: { id: string; member_class: MemberClass; status: MembershipStatus };
  permissions: PermissionSet;
  can: (permission: Permission) => boolean;
};

export const getChapterContext = cache(async (slug: string): Promise<ChapterContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: combined, error: combinedError } = await supabase.rpc("my_chapter_context", { p_slug: slug });
  if (!combinedError) {
    const c = combined as { chapter: ChapterSummary; membership: ChapterContext["membership"]; permissions: string[] | null } | null;
    if (!c || c.membership.status !== "active") return null;
    const permissions = toPermissionSet(c.permissions);
    return { user, chapter: c.chapter, membership: c.membership, permissions, can: (p) => permissions.has(p) };
  }
  const { data: row } = await supabase
    .from("memberships")
    .select("id, member_class, status, chapter:chapters!inner(id, slug, organization_name, designation, greek_letters, status, timezone, currency, modules, university:universities(name, short_name))")
    .eq("user_id", user.id)
    .eq("chapter.slug", slug)
    .maybeSingle();
  if (!row || row.status !== "active" || !row.chapter) return null;
  const chapter = row.chapter as unknown as ChapterSummary;
  const { data: perms } = await supabase.rpc("my_permissions", { p_chapter: chapter.id });
  const permissions = toPermissionSet(perms as string[] | null);
  return {
    user,
    chapter,
    membership: { id: row.id, member_class: row.member_class, status: row.status } as ChapterContext["membership"],
    permissions,
    can: (p) => permissions.has(p),
  };
});

export async function requireChapter(slug: string, permission?: Permission): Promise<ChapterContext> {
  await requireUser(`/c/${slug}`);
  const ctx = await getChapterContext(slug);
  if (!ctx) notFound();
  if (permission && !ctx.can(permission)) forbidden();
  return ctx;
}

export type MyChapter = { id: string; slug: string; organization_name: string; designation: string | null; status: string; member_class: MemberClass; membership_id: string; timezone: string; university_name: string | null };

export const getMyChapters = cache(async (): Promise<MyChapter[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, member_class, chapter:chapters(id, slug, organization_name, designation, status, timezone, university:universities(name))")
    .eq("user_id", user.id)
    .eq("status", "active");
  return (data ?? []).flatMap((row) => {
    const c = row.chapter as unknown as (Omit<MyChapter, "member_class" | "membership_id" | "university_name"> & { university: { name: string } | null }) | null;
    if (!c) return [];
    const { university, ...rest } = c;
    return [{ ...rest, university_name: university?.name ?? null, member_class: row.member_class as MemberClass, membership_id: row.id as string }];
  });
});
