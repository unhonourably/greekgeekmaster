import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Avatar, RoleBadge, personName, type RoleChip } from "@/components/people";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Notice, TextLink } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, MEMBERSHIP_STATUS_LABEL, type MemberClass, type MembershipStatus } from "@/lib/permissions";
import { grantableRoles, listChapterRoles } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { listRecruiterCandidates, loadRecruiterCredits } from "@/lib/recruiters";
import { assignRole, endRole, removeMember, setRecruiter, updateMember } from "../actions";
import { MemberEditForm, RecruiterForm, RemoveMemberForm, RoleAssignForm } from "../member-forms";

export default async function MemberSettingsPage({ params }: PageProps<"/c/[slug]/settings/members/[membershipId]">) {
  const { slug, membershipId } = await params;
  const ctx = await requireChapter(slug, "members.manage");
  const { chapter } = ctx;
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) notFound();
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("memberships")
    .select("id, user_id, member_class, status, joined_at, ended_at, end_reason, profile:profiles!memberships_user_id_fkey(display_name, full_name, avatar_path, graduation_year)")
    .eq("id", membershipId)
    .eq("chapter_id", chapter.id)
    .maybeSingle();
  if (!m) notFound();
  const profile = (m.profile ?? {}) as unknown as { display_name: string | null; full_name: string | null; avatar_path: string | null; graduation_year: number | null };
  const [{ data: assignments }, { data: history }, roles, credits, candidates] = await Promise.all([
    supabase
      .from("role_assignments")
      .select("id, role_id, starts_at, ends_at, end_reason")
      .eq("membership_id", m.id)
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase
      .from("membership_history")
      .select("id, from_class, to_class, from_status, to_status, reason, created_at")
      .eq("membership_id", m.id)
      .order("created_at", { ascending: false })
      .limit(50),
    listChapterRoles(chapter.id),
    loadRecruiterCredits(chapter.id),
    listRecruiterCandidates(chapter.id, membershipId),
  ]);
  const credit = credits?.get(m.id as string) ?? null;
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const current = (assignments ?? []).filter((a) => !a.ends_at);
  const past = (assignments ?? []).filter((a) => a.ends_at);
  const heldIds = new Set(current.map((a) => a.role_id as string));
  const isSelf = m.user_id === ctx.user.id;
  const ended = m.status === "ended";
  const canRoles = ctx.can("roles.manage") && !isSelf && !ended && m.status !== "suspended";
  const assignable = canRoles ? grantableRoles(roles, ctx.permissions).filter((r) => !heldIds.has(r.id)).map((r) => ({ key: r.key, id: r.id, name: r.name })) : [];
  const name = personName(profile);
  const tz = chapter.timezone;

  return (
    <div className="space-y-6">
      <Link href={`/c/${slug}/settings/members`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All members
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} path={profile.avatar_path} size="lg" />
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink">{name}</h2>
          <p className="text-sm text-ink-2">
            {MEMBER_CLASS_LABEL[m.member_class as MemberClass]}
            {profile.graduation_year ? ` · Class of ${profile.graduation_year}` : ""}
          </p>
        </div>
        <Badge tone={m.status === "active" ? "positive" : m.status === "suspended" ? "danger" : "neutral"} className="ml-auto">
          {MEMBERSHIP_STATUS_LABEL[m.status as MembershipStatus]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Membership" />
            <CardBody className="space-y-4">
              {isSelf ? <Notice tone="info">You cannot change your own membership. Ask another officer.</Notice> : null}
              {ended ? <Notice tone="info" title="Former member">{m.end_reason ? `Reason: ${m.end_reason}` : "This membership has ended and is kept for records."}</Notice> : null}
              {!isSelf && !ended ? (
                <MemberEditForm action={updateMember.bind(null, slug, m.id as string)} memberClass={m.member_class as string} status={m.status as string} />
              ) : null}
              {!isSelf && !ended ? (
                <div className="border-t border-line pt-4">
                  <h3 className="text-sm font-medium text-ink">Remove from chapter</h3>
                  <p className="mt-1 text-[13px] text-ink-3">Ends the membership, officer roles, chat access, and any current room assignment.</p>
                  <div className="mt-3">
                    <RemoveMemberForm action={removeMember.bind(null, slug, m.id as string)} name={name} />
                  </div>
                </div>
              ) : null}
              <DefinitionList
                items={[
                  { label: "Joined", value: formatDate(m.joined_at as string, tz) },
                  ...(m.ended_at ? [{ label: "Ended", value: formatDate(m.ended_at as string, tz) }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              {(history ?? []).length === 0 ? (
                <p className="text-sm text-ink-3">No changes recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {(history ?? []).map((h) => (
                    <li key={h.id as number} className="flex gap-3 text-sm">
                      <span className="w-36 shrink-0 text-ink-3">{formatDateTime(h.created_at as string, tz)}</span>
                      <span className="text-ink-2">
                        {h.reason === "joined" && !h.from_status
                          ? `Joined as ${MEMBER_CLASS_LABEL[h.to_class as MemberClass].toLowerCase()}`
                          : [
                              h.from_class !== h.to_class ? `${MEMBER_CLASS_LABEL[h.from_class as MemberClass]} to ${MEMBER_CLASS_LABEL[h.to_class as MemberClass]}` : null,
                              h.from_status !== h.to_status ? `${MEMBERSHIP_STATUS_LABEL[h.from_status as MembershipStatus]} to ${MEMBERSHIP_STATUS_LABEL[h.to_status as MembershipStatus]}` : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                        {h.reason && h.reason !== "joined" ? <span className="text-ink-3">. {h.reason as string}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Roles" description={ctx.can("roles.manage") ? undefined : "You need role management permission to change roles."} />
            <CardBody className="space-y-4">
              {current.length === 0 ? (
                <p className="text-sm text-ink-3">No roles.</p>
              ) : (
                <ul className="space-y-2">
                  {current.map((a) => {
                    const role = roleById.get(a.role_id as string);
                    if (!role) return null;
                    const chip: RoleChip = { id: role.id, name: role.name, tone: role.badge_tone, is_owner: role.is_owner };
                    const removable = canRoles && (!role.is_owner || ctx.can("chapter.ownership"));
                    return (
                      <li key={a.id as string} className="flex items-center justify-between gap-2">
                        <span className="flex flex-col gap-0.5">
                          <RoleBadge role={chip} />
                          <span className="text-xs text-ink-3">Since {formatDate(a.starts_at as string, tz)}</span>
                        </span>
                        {removable ? (
                          <form action={endRole.bind(null, slug, a.id as string)}>
                            <ConfirmSubmit message={`Remove ${role.name} from ${name}?`} variant="ghost">
                              <X className="size-4" aria-hidden />
                              <span className="sr-only">Remove {role.name}</span>
                            </ConfirmSubmit>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canRoles ? <RoleAssignForm action={assignRole.bind(null, slug, m.id as string)} roles={assignable} /> : null}
              {isSelf ? <p className="text-xs text-ink-3">You cannot change your own roles.</p> : null}
              {ctx.can("roles.manage") ? <TextLink href={`/c/${slug}/settings/roles`} className="text-sm">Edit what roles can do</TextLink> : null}
            </CardBody>
          </Card>
          {credits ? (
            <Card>
              <CardHeader title="Recruitment" description="Only officers can see this." />
              <CardBody className="space-y-3">
                <p className="text-sm text-ink-2">
                  {credit?.recruiterName ? (
                    <>Recruited by <span className="font-medium text-ink">{credit.recruiterName}</span>{credit.source === "self_reported" ? " (they said so when joining)" : " (recorded by an officer)"}.</>
                  ) : credit ? (
                    "They weren't sure who recruited them."
                  ) : (
                    "No recruiter recorded."
                  )}
                </p>
                {!isSelf ? <RecruiterForm action={setRecruiter.bind(null, slug, m.id as string)} options={candidates} current={credit?.recruiterId ?? null} /> : null}
              </CardBody>
            </Card>
          ) : null}
          {past.length > 0 ? (
            <Card>
              <CardHeader title="Past roles" />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {past.map((a) => (
                    <li key={a.id as string} className="flex justify-between gap-2">
                      <span className="text-ink">{roleById.get(a.role_id as string)?.name ?? "Role"}</span>
                      <span className="text-ink-3">
                        {formatDate(a.starts_at as string, tz)} to {formatDate(a.ends_at as string, tz)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
