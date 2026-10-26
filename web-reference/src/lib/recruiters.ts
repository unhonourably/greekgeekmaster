import "server-only";
import { createClient } from "@/lib/supabase/server";

export type RecruiterCandidate = { id: string; name: string; chair: boolean };

type DirectoryRow = { membership_id: string; display_name: string | null; full_name: string | null; roles: Array<{ key?: string; name: string }> | null };

export function isRecruitmentRole(role: { key?: string; name: string }): boolean {
  return role.key === "recruitment_chair" || role.key === "recruitment_team" || /rush|recruit/i.test(role.name);
}

export async function listRecruiterCandidates(chapterId: string, excludeMembership?: string): Promise<RecruiterCandidate[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("chapter_directory", { p_chapter: chapterId, p_search: null, p_class: null, p_role: null, p_status: null, p_limit: 500, p_offset: 0 });
  return ((data ?? []) as DirectoryRow[])
    .filter((r) => r.membership_id !== excludeMembership)
    .map((r) => ({ id: r.membership_id, name: r.full_name?.trim() || r.display_name?.trim() || "Member", chair: (r.roles ?? []).some(isRecruitmentRole) }))
    .sort((a, b) => Number(b.chair) - Number(a.chair) || a.name.localeCompare(b.name));
}

export async function loadRecruiterCredits(chapterId: string): Promise<Map<string, { recruiterId: string | null; recruiterName: string | null; source: string }> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_recruiters")
    .select("membership_id, recruiter_membership_id, source, recruiter:memberships!membership_recruiters_recruiter_fkey(user:profiles!memberships_user_id_fkey(full_name, display_name))")
    .eq("chapter_id", chapterId);
  if (error) return null;
  const out = new Map<string, { recruiterId: string | null; recruiterName: string | null; source: string }>();
  for (const r of data ?? []) {
    const user = (r.recruiter as unknown as { user: { full_name: string | null; display_name: string | null } | null } | null)?.user;
    out.set(r.membership_id as string, {
      recruiterId: (r.recruiter_membership_id as string | null) ?? null,
      recruiterName: user ? user.full_name?.trim() || user.display_name?.trim() || "Member" : null,
      source: r.source as string,
    });
  }
  return out;
}
