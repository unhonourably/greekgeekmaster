import { notFound } from "next/navigation";
import { personName } from "@/components/people";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { activeMembers, requireModule } from "@/lib/modules";
import { POLICY_CATEGORY } from "../../labels";
import { acknowledgePolicy, publishRevision } from "../../actions";

type Version = { id: string; version: number; body: string; change_summary: string | null; published_at: string; publisher: { display_name: string | null; full_name: string | null } | null };

export default async function PolicyPage({ params }: PageProps<"/c/[slug]/standards/policies/[policyId]">) {
  const { slug, policyId } = await params;
  const { chapter, user, can } = await requireModule(slug, "standards");
  const manage = can("standards.manage") || can("chapter.manage");
  const oversee = can("standards.manage") || can("standards.view");
  const supabase = await createClient();
  const { data: doc } = await supabase.from("policy_documents").select("id, title, category, requires_ack, current_version").eq("id", policyId).eq("chapter_id", chapter.id).maybeSingle();
  if (!doc || doc.current_version === 0) notFound();
  const { data: versionRows } = await supabase
    .from("policy_versions")
    .select("id, version, body, change_summary, published_at, publisher:profiles!policy_versions_published_by_fkey(display_name, full_name)")
    .eq("policy_id", doc.id)
    .order("version", { ascending: false });
  const versions = (versionRows ?? []) as unknown as Version[];
  const current = versions.find((v) => v.version === doc.current_version);
  if (!current) notFound();
  const { data: mine } = await supabase.from("policy_acknowledgments").select("acknowledged_at").eq("policy_version_id", current.id).eq("user_id", user.id).maybeSingle();

  let outstanding: string[] = [];
  let acknowledgedCount = 0;
  if (oversee && doc.requires_ack) {
    const [{ data: acks }, members] = await Promise.all([supabase.from("policy_acknowledgments").select("user_id").eq("policy_version_id", current.id).limit(5000), activeMembers(chapter.id)]);
    const ackUsers = new Set((acks ?? []).map((a) => a.user_id));
    acknowledgedCount = members.filter((m) => ackUsers.has(m.userId)).length;
    outstanding = members.filter((m) => !ackUsers.has(m.userId)).map((m) => m.name);
  }

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/standards`}>Standards</TextLink>}
        title={doc.title}
        description={`${POLICY_CATEGORY[doc.category] ?? doc.category} · version ${current.version} · published ${formatDate(current.published_at, chapter.timezone)}${current.publisher ? ` by ${personName(current.publisher)}` : ""}`}
      />
      {doc.requires_ack ? (
        mine ? (
          <Notice tone="positive" className="mb-6">
            You acknowledged version {current.version} on {formatDateTime(mine.acknowledged_at, chapter.timezone)}.
          </Notice>
        ) : (
          <Notice
            tone="warning"
            className="mb-6"
            title="Your acknowledgment is needed"
            action={
              <form action={acknowledgePolicy.bind(null, slug, doc.id, current.id)}>
                <SubmitButton size="sm" pendingLabel="Saving">I have read this policy</SubmitButton>
              </form>
            }
          >
            Read the policy below, then confirm.
          </Notice>
        )
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <Card>
            <CardBody>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{current.body}</div>
            </CardBody>
          </Card>
          {manage ? (
            <Card>
              <CardHeader title="Publish a revision" description="Everyone who must acknowledge will be asked again." />
              <CardBody>
                <SimpleForm
                  action={publishRevision.bind(null, slug, doc.id)}
                  submitLabel={`Publish version ${current.version + 1}`}
                  pendingLabel="Publishing"
                  resetOnSuccess={false}
                  fields={[
                    { name: "summary", label: "What changed", maxLength: 500 },
                    { name: "body", label: "Policy text", type: "textarea", defaultValue: current.body, maxLength: 50000 },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-8">
          {oversee && doc.requires_ack ? (
            <Card>
              <CardHeader title="Acknowledgments" description={`${acknowledgedCount} of ${acknowledgedCount + outstanding.length} active members.${outstanding.length ? " Still waiting on:" : ""}`} />
              {outstanding.length ? (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {outstanding.map((name, i) => (
                    <li key={`${name}-${i}`} className="px-5 py-2 text-[13px] text-ink-2">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-[13px] text-ink-3">Every active member has acknowledged this version.</p>
              )}
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Version history" />
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">Version {v.version}</p>
                    {v.version === doc.current_version ? <Badge tone="accent">Current</Badge> : null}
                  </div>
                  <p className="text-[12px] text-ink-3">{formatDate(v.published_at, chapter.timezone)}</p>
                  {v.change_summary ? <p className="mt-1 text-[13px] text-ink-2">{v.change_summary}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
