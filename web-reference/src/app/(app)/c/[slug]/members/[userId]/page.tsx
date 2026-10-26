import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AtSign, Globe, MessageSquare, Pencil, Phone, Settings2, X } from "lucide-react";
import { Avatar, RoleBadge, personName, type RoleChip } from "@/components/people";
import { BADGE_CATEGORY_LABEL, BadgeIcon } from "@/components/badge-icon";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Notice, buttonClass } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { viewerIsPledge } from "@/lib/pledge";
import { todayIn } from "@/lib/modules";
import { formatDate, requestTime } from "@/lib/format";
import { awardBadge, revokeBadge, startDirectMessage } from "../actions";
import { AwardForm } from "../award-form";

type Profile = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_path: string | null;
  graduation_year: number | null;
  membership_id: string;
  member_class: MemberClass;
  status: string;
  joined_at: string;
  details: { pronouns?: string; major?: string; hometown?: string; bio?: string; interests?: string[]; social_links?: Record<string, string>; phone?: string };
  roles: Array<RoleChip & { since: string }>;
  role_history: Array<{ name: string; started: string; ended: string }>;
  achievements: Array<{ id: string; name: string; icon: string; category: string; awarded_at: string; note: string | null }>;
};

function safeLink(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default async function MemberProfilePage({ params, searchParams }: PageProps<"/c/[slug]/members/[userId]">) {
  const { slug, userId } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("member_profile", { p_chapter: ctx.chapter.id, p_user: userId });
  const p = data as Profile | null;
  if (!p) notFound();
  const name = personName(p);
  const isSelf = userId === ctx.user.id;
  const officer = ctx.can("members.manage");
  const tz = ctx.chapter.timezone;
  const [{ data: badges }, { data: awarded }] = officer
    ? await Promise.all([
        supabase.from("achievement_badges").select("id, name").eq("chapter_id", ctx.chapter.id).order("name"),
        supabase.from("member_achievements").select("id, badge_id").eq("membership_id", p.membership_id).is("revoked_at", null),
      ])
    : [{ data: [] }, { data: [] }];
  const awardIdByBadge = new Map((awarded ?? []).map((a) => [a.badge_id as string, a.id as string]));
  const d = p.details ?? {};
  const links = Object.entries(d.social_links ?? {})
    .map(([label, url]) => ({ label, url: safeLink(url) }))
    .filter((l): l is { label: string; url: string } => Boolean(l.url));
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  const pledge = await viewerIsPledge(ctx.chapter.id);
  let livesIn: boolean | null = null;
  if (!pledge && p.member_class === "active") {
    const today = todayIn(tz, requestTime());
    const { count } = await supabase
      .from("room_assignments")
      .select("id", { count: "exact", head: true })
      .eq("membership_id", p.membership_id)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`);
    livesIn = (count ?? 0) > 0;
  }

  return (
    <div className="space-y-6">
      <Link href={`/c/${slug}/directory`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Directory
      </Link>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap items-start gap-5">
        <Avatar name={name} path={p.avatar_path} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">{name}</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            {[p.display_name && p.full_name && p.display_name !== p.full_name ? p.full_name : null, d.pronouns, MEMBER_CLASS_LABEL[p.member_class], p.graduation_year ? `Class of ${p.graduation_year}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {livesIn === null ? null : (
            <div className="mt-2">
              <Badge tone={livesIn ? "positive" : "neutral"}>{livesIn ? "In house" : "Out of house"}</Badge>
            </div>
          )}
          {p.roles.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.roles.map((r) => (
                <RoleBadge key={r.id} role={r} />
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {isSelf ? (
            <Link href="/account" className={buttonClass("secondary", "sm")}>
              <Pencil className="size-4" aria-hidden />
              Edit profile
            </Link>
          ) : p.status === "active" ? (
            <form action={startDirectMessage.bind(null, slug, userId)}>
              <SubmitButton size="sm" variant="secondary">
                <MessageSquare className="size-4" aria-hidden />
                Message
              </SubmitButton>
            </form>
          ) : null}
          {officer && !isSelf ? (
            <Link href={`/c/${slug}/settings/members/${p.membership_id}`} className={buttonClass("ghost", "sm")}>
              <Settings2 className="size-4" aria-hidden />
              Manage
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="About" />
            <CardBody className="space-y-4">
              {d.bio ? <p className="whitespace-pre-line text-sm leading-6 text-ink">{d.bio}</p> : <p className="text-sm text-ink-3">{isSelf ? "Add a short bio from your account settings." : "No bio yet."}</p>}
              <DefinitionList
                items={[
                  ...(d.major ? [{ label: "Major", value: d.major }] : []),
                  ...(d.hometown ? [{ label: "Hometown", value: d.hometown }] : []),
                  { label: "Member since", value: formatDate(p.joined_at, tz) },
                ]}
              />
              {d.interests?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {d.interests.map((i) => (
                    <Badge key={i}>{i}</Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Badges" />
            <CardBody>
              {p.achievements.length === 0 ? (
                <p className="text-sm text-ink-3">No badges yet.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {p.achievements.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 rounded-md border border-line p-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
                        <BadgeIcon icon={a.icon} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{a.name}</span>
                        <span className="block text-xs text-ink-3">
                          {BADGE_CATEGORY_LABEL[a.category]} · {formatDate(a.awarded_at, tz)}
                        </span>
                        {a.note ? <span className="mt-1 block text-xs text-ink-2">{a.note}</span> : null}
                      </span>
                      {officer && awardIdByBadge.get(a.id) ? (
                        <form action={revokeBadge.bind(null, slug, awardIdByBadge.get(a.id) as string, userId)}>
                          <ConfirmSubmit message={`Remove the ${a.name} badge?`} variant="ghost">
                            <X className="size-4" aria-hidden />
                            <span className="sr-only">Remove badge</span>
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {officer && p.status === "active" ? (
                <div className="mt-5 border-t border-line pt-5">
                  <AwardForm action={awardBadge.bind(null, slug, p.membership_id, userId)} badges={(badges ?? []).filter((b) => !awardIdByBadge.has(b.id as string)).map((b) => ({ id: b.id as string, name: b.name as string }))} />
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {d.phone || links.length ? (
            <Card>
              <CardHeader title="Contact" />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {d.phone ? (
                    <li className="flex items-center gap-2">
                      <Phone className="size-4 text-ink-3" aria-hidden />
                      <a href={`tel:${d.phone.replace(/[^\d+]/g, "")}`} className="text-ink hover:underline">{d.phone}</a>
                    </li>
                  ) : null}
                  {links.map((l) => (
                    <li key={l.label} className="flex items-center gap-2">
                      {l.label.toLowerCase().includes("instagram") || l.label.toLowerCase().includes("x") ? <AtSign className="size-4 text-ink-3" aria-hidden /> : <Globe className="size-4 text-ink-3" aria-hidden />}
                      <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-ink hover:underline">{l.label}</a>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Positions" />
            <CardBody>
              {p.roles.length === 0 && p.role_history.length === 0 ? (
                <p className="text-sm text-ink-3">No officer positions.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {p.roles.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="text-ink">{r.name}</span>
                      <span className="text-ink-3">Since {formatDate(r.since, tz)}</span>
                    </li>
                  ))}
                  {p.role_history.map((r) => (
                    <li key={`${r.name}-${r.started}`} className="flex justify-between gap-2">
                      <span className="text-ink-2">{r.name}</span>
                      <span className="text-ink-3">
                        {new Date(r.started).getFullYear()} to {new Date(r.ended).getFullYear()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
