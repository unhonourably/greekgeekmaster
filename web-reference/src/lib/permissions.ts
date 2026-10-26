export const PERMISSIONS = [
  "chapter.manage",
  "chapter.ownership",
  "members.manage",
  "roles.manage",
  "committees.manage",
  "finance.view",
  "finance.manage",
  "finance.refund",
  "payments.configure",
  "chat.manage",
  "chat.moderate",
  "announcements.publish",
  "announcements.officers",
  "events.manage",
  "attendance.view",
  "attendance.manage",
  "recruitment.view",
  "recruitment.manage",
  "philanthropy.manage",
  "housing.manage",
  "standards.view",
  "standards.manage",
  "academics.manage",
  "analytics.view",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionSet = ReadonlySet<Permission>;

export function toPermissionSet(values: readonly string[] | null | undefined): PermissionSet {
  const known = new Set<string>(PERMISSIONS);
  return new Set((values ?? []).filter((v): v is Permission => known.has(v)));
}

export function hasPermission(set: PermissionSet, permission: Permission): boolean {
  return set.has(permission);
}

export function hasAny(set: PermissionSet, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => set.has(p));
}

export function canGrantRole(granter: PermissionSet, rolePermissions: readonly Permission[], roleIsOwner: boolean): boolean {
  if (!granter.has("roles.manage")) return false;
  if (roleIsOwner && !granter.has("chapter.ownership")) return false;
  return rolePermissions.every((p) => granter.has(p));
}

export type ChapterModule = "recruitment" | "philanthropy" | "housing" | "standards" | "academics";

export const MEMBER_CLASS_LABEL = {
  new_member: "New member",
  active: "Active",
  associate: "Associate",
  alumni: "Alumni",
} as const;

export type MemberClass = keyof typeof MEMBER_CLASS_LABEL;

export const MEMBERSHIP_STATUS_LABEL = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  ended: "Former member",
} as const;

export type MembershipStatus = keyof typeof MEMBERSHIP_STATUS_LABEL;
