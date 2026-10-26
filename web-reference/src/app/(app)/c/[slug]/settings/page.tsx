import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, DefinitionList, Notice } from "@/components/ui";
import { personName } from "@/components/people";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { requestClosure, transferOwnership, updateChapterProfile, updateModules } from "./actions";
import { ClosureForm, ModulesForm, ProfileForm, TransferForm } from "./general-forms";

const US_ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico"];

export default async function GeneralSettingsPage({ params }: PageProps<"/c/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await requireChapter(slug);
  if (!ctx.can("chapter.manage")) {
    if (ctx.can("payments.configure") || ctx.can("finance.view")) redirect(`/c/${slug}/settings/billing`);
    if (ctx.can("members.manage")) redirect(`/c/${slug}/settings/members`);
    if (ctx.can("roles.manage")) redirect(`/c/${slug}/settings/roles`);
    redirect(`/c/${slug}/settings/audit`);
  }
  const supabase = await createClient();
  const [{ data: chapter }, members, { data: closureRows }] = await Promise.all([
    supabase.from("chapters").select("description, founded_year, greek_letters, timezone, modules, verified_at, slug, organization_name, designation").eq("id", ctx.chapter.id).single(),
    ctx.can("chapter.ownership")
      ? supabase
          .from("memberships")
          .select("id, user_id, profile:profiles!memberships_user_id_fkey(display_name, full_name)")
          .eq("chapter_id", ctx.chapter.id)
          .eq("status", "active")
          .neq("user_id", ctx.user.id)
          .limit(500)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase
      .from("chapter_closure_requests")
      .select("id, status, reason, created_at, decision_note")
      .eq("chapter_id", ctx.chapter.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const timezones = Array.from(new Set([...US_ZONES, chapter?.timezone ?? "America/New_York", ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [])]));
  const closure = (closureRows ?? [])[0] as { status: string; reason: string; decision_note: string | null } | undefined;
  const options = members
    .map((m) => ({ id: m.id as string, name: personName((m.profile ?? {}) as unknown as { display_name: string | null; full_name: string | null }) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Chapter profile" />
          <CardBody>
            <ProfileForm
              action={updateChapterProfile.bind(null, slug)}
              timezones={timezones}
              initial={{ greek_letters: chapter?.greek_letters ?? null, description: chapter?.description ?? null, founded_year: chapter?.founded_year ?? null, timezone: chapter?.timezone ?? "America/New_York" }}
            />
          </CardBody>
        </Card>
        <Card id="modules">
          <CardHeader title="Modules" description="Choose which programs your chapter uses." />
          <CardBody>
            <ModulesForm action={updateModules.bind(null, slug)} modules={(chapter?.modules ?? {}) as Record<string, boolean>} />
          </CardBody>
        </Card>
        {ctx.chapter.status !== "closed" ? (
          <Card>
            <CardHeader title="Close this chapter" description="Members lose access only after a platform administrator accepts the request. Financial records stay with the chapter." />
            <CardBody>
              {closure?.status === "pending" ? (
                <Notice tone="warning">Waiting for GreekGeek to review this request. The chapter stays open until it is accepted.</Notice>
              ) : (
                <div className="space-y-4">
                  {closure?.status === "declined" ? <Notice>The last request was declined{closure.decision_note ? `: ${closure.decision_note}` : "."}</Notice> : null}
                  <ClosureForm action={requestClosure.bind(null, slug)} />
                </div>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Verified identity" description="These details were confirmed during verification. Contact support to change them." />
          <CardBody>
            <DefinitionList
              items={[
                { label: "Organization", value: chapter?.organization_name },
                { label: "Chapter", value: chapter?.designation ?? "None" },
                { label: "Handle", value: <span className="font-mono text-xs">{chapter?.slug}</span> },
                { label: "Verified", value: chapter?.verified_at ? formatDate(chapter.verified_at, ctx.chapter.timezone) : "Not yet" },
              ]}
            />
          </CardBody>
        </Card>
        {ctx.can("chapter.ownership") ? (
          <Card>
            <CardHeader title="Administrator access" description="Administrators accept agreements, control the payment account, and can manage everything." />
            <CardBody>
              {options.length === 0 ? <p className="text-sm text-ink-3">Invite another member first.</p> : <TransferForm action={transferOwnership.bind(null, slug)} members={options} slug={slug} />}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
