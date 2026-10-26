import Link from "next/link";
import { Search, Upload, UserPlus, Users, X } from "lucide-react";
import { Avatar, RoleBadges, personName, type RoleChip } from "@/components/people";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, Notice, TextLink, buttonClass } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, MEMBERSHIP_STATUS_LABEL, type MemberClass, type MembershipStatus } from "@/lib/permissions";
import { grantableRoles, listChapterRoles } from "@/lib/roles";
import { formatDate, requestTime } from "@/lib/format";
import { loadRecruiterCredits } from "@/lib/recruiters";
import { importMembers, inviteMember, revokeInvitation } from "./actions";
import { ImportForm, InviteForm } from "./member-forms";

const STATUS_FILTERS = [
  { value: "", label: "Current" },
  { value: "suspended", label: "Suspended" },
  { value: "ended", label: "Former" },
] as const;

type DirectoryRow = {
  membership_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_path: string | null;
  member_class: MemberClass;
  status: MembershipStatus;
  joined_at: string;
  roles: RoleChip[];
  in_house?: boolean | null;
  total_count: number;
};

export default async function MembersSettingsPage({ params, searchParams }: PageProps<"/c/[slug]/settings/members">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug, "members.manage");
  const { chapter } = ctx;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const status = STATUS_FILTERS.find((f) => f.value === sp.status)?.value ?? "";
  const supabase = await createClient();
  const [{ data: members }, { data: invites }, roles, credits] = await Promise.all([
    supabase.rpc("chapter_directory", { p_chapter: chapter.id, p_search: q || null, p_class: null, p_role: null, p_status: status || null, p_limit: 200, p_offset: 0 }),
    supabase
      .from("chapter_invitations")
      .select("id, email, full_name, member_class, role_keys, created_at, expires_at")
      .eq("chapter_id", chapter.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200),
    listChapterRoles(chapter.id),
    loadRecruiterCredits(chapter.id),
  ]);
  const rows = (members ?? []) as DirectoryRow[];
  const total = rows[0]?.total_count ?? 0;
  const grantable = grantableRoles(roles, ctx.permissions).map((r) => ({ key: r.key, id: r.id, name: r.name }));
  const roleName = new Map(roles.map((r) => [r.key, r.name]));
  const base = `/c/${slug}/settings/members`;
  const now = requestTime();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="order-2 space-y-6 lg:order-1">
        {chapter.status !== "verified" ? <Notice tone="warning">Invitations open once the chapter is verified.</Notice> : null}
        <Card>
          <CardHeader title="Members" description={`${total} ${status === "ended" ? "former" : status === "suspended" ? "suspended" : "current"} member${total === 1 ? "" : "s"}`} />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex gap-1" aria-label="Filter members">
                {STATUS_FILTERS.map((f) => (
                  <Link
                    key={f.value}
                    href={f.value ? `${base}?status=${f.value}` : base}
                    className={buttonClass(status === f.value ? "secondary" : "ghost", "sm")}
                    aria-current={status === f.value ? "page" : undefined}
                  >
                    {f.label}
                  </Link>
                ))}
              </nav>
              <form className="relative w-full sm:w-64" action={base}>
                {status ? <input type="hidden" name="status" value={status} /> : null}
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input name="q" defaultValue={q} placeholder="Search by name" className="pl-8" aria-label="Search members" />
              </form>
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={Users} title={q ? "No one matches that search" : "No members here"}>
                {q ? <TextLink href={status ? `${base}?status=${status}` : base}>Clear search</TextLink> : "Add people with the form on this page."}
              </EmptyState>
            ) : (
              <ul className="-mx-5 divide-y divide-line border-t border-line">
                {rows.map((m) => {
                  const credit = credits?.get(m.membership_id);
                  const recruited = !credits ? null : credit?.recruiterName ? `Recruited by ${credit.recruiterName}` : credits.has(m.membership_id) ? "Recruiter not sure" : "Recruiter not recorded";
                  return (
                    <li key={m.membership_id} className="flex items-start gap-3 px-5 py-3">
                      <Avatar name={personName(m)} path={m.avatar_path} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-ink">{personName(m)}</span>
                          <span className="text-sm text-ink-2">{MEMBER_CLASS_LABEL[m.member_class]}</span>
                          {m.member_class === "active" && typeof m.in_house === "boolean" ? (
                            <Badge tone={m.in_house ? "positive" : "neutral"}>{m.in_house ? "In house" : "Out of house"}</Badge>
                          ) : null}
                          {m.status === "inactive" ? <Badge>{MEMBERSHIP_STATUS_LABEL.inactive}</Badge> : null}
                        </div>
                        {m.full_name && m.display_name && m.display_name !== m.full_name ? <p className="truncate text-xs text-ink-3">{m.full_name}</p> : null}
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
                          {recruited ? <span>{recruited}</span> : null}
                          <span>Joined {formatDate(m.joined_at, chapter.timezone)}</span>
                        </p>
                        <RoleBadges roles={m.roles} className="mt-1.5" />
                      </div>
                      <Link href={`${base}/${m.membership_id}`} className={buttonClass("ghost", "sm") + " shrink-0"}>Manage</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pending invitations" description="Links expire 14 days after sending." />
          {(invites ?? []).length === 0 ? (
            <CardBody><p className="text-sm text-ink-3">No pending invitations.</p></CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {(invites ?? []).map((inv) => {
                const expired = new Date(inv.expires_at as string).getTime() < now;
                const roleLabel = ((inv.role_keys as string[]) ?? []).map((k) => roleName.get(k) ?? k).join(", ");
                return (
                  <li key={inv.id as string} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{inv.email as string}</p>
                      {inv.full_name ? <p className="truncate text-xs text-ink-3">{inv.full_name as string}</p> : null}
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                        <span>{MEMBER_CLASS_LABEL[inv.member_class as MemberClass]}</span>
                        <span>{roleLabel || "No role"}</span>
                        {expired ? <Badge tone="warning">Expired</Badge> : <span>Expires {formatDate(inv.expires_at as string, chapter.timezone)}</span>}
                      </p>
                    </div>
                    <form action={revokeInvitation.bind(null, slug, inv.id as string)} className="shrink-0">
                      <ConfirmSubmit message={`Revoke the invitation for ${inv.email}?`} variant="ghost">
                        <X className="size-4" aria-hidden />
                        Revoke
                      </ConfirmSubmit>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="order-1 space-y-6 lg:order-2">
        <Card id="add">
          <CardHeader
            title={<span className="flex items-center gap-2"><UserPlus className="size-4 text-ink-3" aria-hidden />Add a member</span>}
            description="If they already have an account, they are added right away. Otherwise they get an invitation link and join when they sign up."
          />
          <CardBody>
            <InviteForm action={inviteMember.bind(null, slug)} roles={grantable} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Upload className="size-4 text-ink-3" aria-hidden />Import from a spreadsheet</span>}
            description="Everyone on the list gets an invitation. Nobody is added until they accept."
          />
          <CardBody>
            <ImportForm action={importMembers.bind(null, slug)} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
