import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canGrantRole, toPermissionSet, type Permission, type PermissionSet } from "@/lib/permissions";

export type ChapterRole = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: "system" | "custom";
  is_officer: boolean;
  is_owner: boolean;
  badge_tone: string;
  sort_order: number;
  permissions: Permission[];
  holders: number;
};

export async function listChapterRoles(chapterId: string): Promise<ChapterRole[]> {
  const supabase = await createClient();
  const [{ data: roles }, { data: assignments }] = await Promise.all([
    supabase
      .from("roles")
      .select("id, key, name, description, kind, is_officer, is_owner, badge_tone, sort_order, role_permissions(permission_key)")
      .eq("chapter_id", chapterId)
      .order("sort_order")
      .order("name"),
    supabase.from("role_assignments").select("role_id").eq("chapter_id", chapterId).is("ends_at", null),
  ]);
  const counts = new Map<string, number>();
  for (const a of assignments ?? []) counts.set(a.role_id as string, (counts.get(a.role_id as string) ?? 0) + 1);
  return (roles ?? []).map((r) => ({
    ...(r as unknown as Omit<ChapterRole, "permissions" | "holders">),
    permissions: [...toPermissionSet(((r.role_permissions as Array<{ permission_key: string }>) ?? []).map((p) => p.permission_key))],
    holders: counts.get(r.id as string) ?? 0,
  }));
}

export async function membershipsWithPermission(chapterId: string, permission: Permission): Promise<Set<string>> {
  const roles = await listChapterRoles(chapterId);
  const roleIds = roles.filter((r) => r.permissions.includes(permission)).map((r) => r.id);
  if (!roleIds.length) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("role_assignments").select("membership_id").eq("chapter_id", chapterId).is("ends_at", null).in("role_id", roleIds);
  return new Set((data ?? []).map((a) => a.membership_id as string));
}

export function grantableRoles(roles: ChapterRole[], mine: PermissionSet): ChapterRole[] {
  return roles.filter((r) => !r.is_owner && canGrantRole(mine, r.permissions, r.is_owner));
}
