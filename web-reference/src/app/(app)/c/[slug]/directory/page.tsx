import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { Avatar, RoleBadges, personName, type RoleChip } from "@/components/people";
import { Badge, Card, EmptyState, Input, PageHeader, Select, TextLink, buttonClass } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { viewerIsPledge } from "@/lib/pledge";
import { listChapterRoles } from "@/lib/roles";

const PAGE = 48;

type Row = {
  membership_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_path: string | null;
  graduation_year: number | null;
  member_class: MemberClass;
  roles: RoleChip[];
  in_house: boolean | null;
  total_count: number;
};

export default async function DirectoryPage({ params, searchParams }: PageProps<"/c/[slug]/directory">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug);
  const { chapter } = ctx;
  const pledge = await viewerIsPledge(chapter.id);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const klass = typeof sp.class === "string" && sp.class in MEMBER_CLASS_LABEL ? (sp.class as MemberClass) : null;
  const house = !pledge && (sp.house === "in" || sp.house === "out") ? sp.house : null;
  const roles = await listChapterRoles(chapter.id);
  const role = typeof sp.role === "string" && roles.some((r) => r.id === sp.role) ? sp.role : null;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const supabase = await createClient();
  const { data } = await supabase.rpc("chapter_directory", {
    p_chapter: chapter.id,
    p_search: q || null,
    p_class: klass,
    p_role: role,
    p_status: null,
    p_limit: PAGE,
    p_offset: (page - 1) * PAGE,
    p_residence: house,
  });
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const base = `/c/${slug}/directory`;
  const qs = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (klass) s.set("class", klass);
    if (house) s.set("house", house);
    if (role) s.set("role", role);
    if (p > 1) s.set("page", String(p));
    const str = s.toString();
    return str ? `${base}?${str}` : base;
  };
  const filtered = Boolean(q || klass || role || house);

  return (
    <>
      <PageHeader
        title="Directory"
        description={`${total} ${total === 1 ? "member" : "members"}${filtered ? " match" : ""}`}
        actions={
          ctx.can("members.manage") ? (
            <div className="flex gap-2">
              <Link href={`/c/${slug}/settings/members`} className={buttonClass("ghost", "sm")}>Manage members</Link>
              <Link href={`/c/${slug}/settings/members#add`} className={buttonClass("primary", "sm")}>
                <UserPlus className="size-4" aria-hidden />
                Add member
              </Link>
            </div>
          ) : null
        }
      />
      <form action={base} className="mb-6 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search by name" className="pl-8" aria-label="Search by name" />
        </div>
        <Select name="class" defaultValue={klass ?? ""} aria-label="Member class" className="w-40">
          <option value="">All classes</option>
          {Object.entries(MEMBER_CLASS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        {pledge ? null : (
          <Select name="house" defaultValue={house ?? ""} aria-label="In house or out of house" className="w-44">
            <option value="">In or out of house</option>
            <option value="in">In house</option>
            <option value="out">Out of house</option>
          </Select>
        )}
        <Select name="role" defaultValue={role ?? ""} aria-label="Role" className="w-48">
          <option value="">Any role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
      </form>
      {rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={Users} title={filtered ? "No one matches" : "No members yet"}>
            {filtered ? <TextLink href={base}>Clear filters</TextLink> : null}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => (
            <li key={m.membership_id}>
              <Link href={`/c/${slug}/members/${m.user_id}`} className="flex h-full items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink-3/40">
                <Avatar name={personName(m)} path={m.avatar_path} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{personName(m)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs text-ink-3">
                      {MEMBER_CLASS_LABEL[m.member_class]}
                      {m.graduation_year ? ` · ${m.graduation_year}` : ""}
                    </span>
                    {m.member_class === "active" && typeof m.in_house === "boolean" ? (
                      <Badge tone={m.in_house ? "positive" : "neutral"}>{m.in_house ? "In house" : "Out of house"}</Badge>
                    ) : null}
                  </span>
                  <RoleBadges roles={m.roles} className="mt-2" limit={2} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={qs(page - 1)} className={buttonClass("secondary", "sm")}>Previous</Link> : <span />}
          <span className="text-ink-3">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs(page + 1)} className={buttonClass("secondary", "sm")}>Next</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
