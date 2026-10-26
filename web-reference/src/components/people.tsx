import { Crown } from "lucide-react";
import { Badge, cx, type Tone } from "@/components/ui";
import { initials } from "@/lib/names";

export type RoleChip = { id: string; key?: string; name: string; tone: string; is_officer?: boolean; is_owner?: boolean };

const ROLE_TONE: Record<string, Tone> = {
  neutral: "neutral",
  accent: "accent",
  gold: "gold",
  slate: "info",
  green: "positive",
  rose: "danger",
};

export function avatarUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const SIZE = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-lg", xl: "size-24 text-2xl" } as const;

export function Avatar({ name, path, size = "sm", className }: { name: string; path?: string | null; size?: keyof typeof SIZE; className?: string }) {
  const url = avatarUrl(path);
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-subtle font-medium text-ink-2", SIZE[size], className)} aria-hidden>
      {url ? <img src={url} alt="" className="size-full object-cover" loading="lazy" /> : initials(name)}
    </span>
  );
}

export function RoleBadge({ role }: { role: RoleChip }) {
  return (
    <Badge tone={ROLE_TONE[role.tone] ?? "neutral"}>
      {role.is_owner ? <Crown className="size-3" aria-hidden /> : null}
      {role.name}
    </Badge>
  );
}

export function RoleBadges({ roles, limit = 3, className }: { roles: RoleChip[]; limit?: number; className?: string }) {
  if (roles.length === 0) return null;
  const shown = roles.slice(0, limit);
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((r) => (
        <RoleBadge key={r.id} role={r} />
      ))}
      {roles.length > limit ? <span className="text-xs text-ink-3">+{roles.length - limit}</span> : null}
    </span>
  );
}

export function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name?.trim() || p.full_name?.trim() || "Member";
}
