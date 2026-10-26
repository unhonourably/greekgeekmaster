import { BookCheck, FileText, GraduationCap, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, StatGrid } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { requireModule, todayIn } from "@/lib/modules";
import { CLASS_LABEL, INCIDENT_STATUS, POLICY_CATEGORY } from "./labels";
import { completeTraining, createPolicy, createTraining } from "./actions";

type Policy = { id: string; title: string; category: string; requires_ack: boolean; current_version: number };
type Training = { id: string; title: string; description: string | null; due_on: string | null; applies_to: string[] };

export default async function StandardsPage({ params }: PageProps<"/c/[slug]/standards">) {
  const { slug } = await params;
  const { chapter, user, membership, can } = await requireModule(slug, "standards");
  const manage = can("standards.manage");
  const managePolicies = manage || can("chapter.manage");
  const oversee = manage || can("standards.view");
  const supabase = await createClient();
  const today = todayIn(chapter.timezone, requestTime());

  const [policiesRes, versionsRes, myAcksRes, trainingsRes, myCompletionsRes, myReportsRes] = await Promise.all([
    supabase.from("policy_documents").select("id, title, category, requires_ack, current_version").eq("chapter_id", chapter.id).gt("current_version", 0).order("title"),
    supabase.from("policy_versions").select("id, policy_id, version, published_at").eq("chapter_id", chapter.id),
    supabase.from("policy_acknowledgments").select("policy_version_id").eq("chapter_id", chapter.id).eq("user_id", user.id),
    supabase.from("training_requirements").select("id, title, description, due_on, applies_to").eq("chapter_id", chapter.id).order("due_on", { ascending: true, nullsFirst: false }),
    supabase.from("training_completions").select("requirement_id, verified_at").eq("chapter_id", chapter.id).eq("user_id", user.id),
    supabase.from("incident_reports").select("id, category, status, created_at").eq("chapter_id", chapter.id).eq("reporter_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const policies = (policiesRes.data ?? []) as Policy[];
  const versions = (versionsRes.data ?? []) as Array<{ id: string; policy_id: string; version: number; published_at: string }>;
  const currentVersion = new Map<string, { id: string; published_at: string }>();
  for (const p of policies) {
    const v = versions.find((x) => x.policy_id === p.id && x.version === p.current_version);
    if (v) currentVersion.set(p.id, v);
  }
  const myAcks = new Set((myAcksRes.data ?? []).map((a) => a.policy_version_id));
  const needsAck = policies.filter((p) => p.requires_ack && !myAcks.has(currentVersion.get(p.id)?.id ?? ""));
  const trainings = ((trainingsRes.data ?? []) as Training[]).filter((t) => oversee || t.applies_to.includes(membership.member_class));
  const myCompletions = new Map((myCompletionsRes.data ?? []).map((c) => [c.requirement_id, c.verified_at as string | null]));
  const myTrainings = trainings.filter((t) => t.applies_to.includes(membership.member_class));
  const outstanding = myTrainings.filter((t) => !myCompletions.has(t.id));
  const myReports = myReportsRes.data ?? [];

  let ackRate: Map<string, number> | null = null;
  let activeCount = 0;
  if (oversee && policies.length) {
    const ids = [...currentVersion.values()].map((v) => v.id);
    const [{ data: acks }, { count }] = await Promise.all([
      supabase.from("policy_acknowledgments").select("policy_version_id").in("policy_version_id", ids).limit(20000),
      supabase.from("memberships").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id).eq("status", "active"),
    ]);
    activeCount = count ?? 0;
    ackRate = new Map();
    for (const a of acks ?? []) ackRate.set(a.policy_version_id, (ackRate.get(a.policy_version_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Standards"
        description="Chapter policies, required trainings, and confidential reporting."
        actions={
          <div className="flex gap-2">
            {manage ? <ButtonLink href={`/c/${slug}/standards/incidents`} variant="secondary">Incident reports</ButtonLink> : null}
            <ButtonLink href={`/c/${slug}/standards/report`} variant={manage ? "ghost" : "secondary"}>
              <ShieldAlert className="size-4" aria-hidden />
              Report a concern
            </ButtonLink>
          </div>
        }
      />
      <StatGrid className="mb-8">
        <Stat label="Policies to acknowledge" value={needsAck.length} tone={needsAck.length ? "warning" : undefined} />
        <Stat label="Trainings outstanding" value={outstanding.length} tone={outstanding.some((t) => t.due_on && t.due_on < today) ? "danger" : outstanding.length ? "warning" : undefined} />
        <Stat label="Published policies" value={policies.length} />
        <Stat label="My reports" value={myReports.length} />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Card>
            <CardHeader title="Policies" />
            {policies.length === 0 ? (
              <EmptyState icon={FileText} title="No policies published">{managePolicies ? "Publish the first policy with the form on this page." : "Policies your officers publish will appear here."}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {policies.map((p) => {
                  const v = currentVersion.get(p.id);
                  const acked = v ? myAcks.has(v.id) : false;
                  const rate = v && ackRate ? (ackRate.get(v.id) ?? 0) : null;
                  return (
                    <li key={p.id}>
                      <Link href={`/c/${slug}/standards/policies/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{p.title}</p>
                          <p className="text-[12px] text-ink-3">
                            {POLICY_CATEGORY[p.category] ?? p.category} · version {p.current_version}
                            {v ? ` · ${formatDate(v.published_at, chapter.timezone)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {rate !== null && p.requires_ack ? (
                            <span className="text-[12px] text-ink-3 tnum">
                              {rate} of {activeCount} acknowledged
                            </span>
                          ) : null}
                          {p.requires_ack ? acked ? <Badge tone="positive">Acknowledged</Badge> : <Badge tone="warning">Needs acknowledgment</Badge> : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={oversee ? "Training requirements" : "My trainings"} />
            {trainings.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No trainings required">{manage ? "Add a training requirement with the form on this page." : "Required trainings will appear here."}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {trainings.map((t) => {
                  const applies = t.applies_to.includes(membership.member_class);
                  const done = myCompletions.has(t.id);
                  const verified = myCompletions.get(t.id);
                  const late = !done && t.due_on && t.due_on < today;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        {oversee ? (
                          <Link href={`/c/${slug}/standards/trainings/${t.id}`} className="text-sm font-medium text-ink hover:underline">
                            {t.title}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-ink">{t.title}</p>
                        )}
                        <p className={late && applies ? "text-[12px] text-danger" : "text-[12px] text-ink-3"}>
                          {[t.due_on ? `Due ${formatDate(t.due_on, "UTC")}` : "No due date", t.applies_to.map((c) => CLASS_LABEL[c] ?? c).join(", ")].join(" · ")}
                        </p>
                        {t.description ? <p className="mt-1 max-w-xl text-[13px] text-ink-2">{t.description}</p> : null}
                      </div>
                      {applies ? (
                        done ? (
                          <Badge tone={verified ? "positive" : "info"}>{verified ? "Verified" : "Completed, awaiting verification"}</Badge>
                        ) : (
                          <form action={completeTraining.bind(null, slug, t.id)}>
                            <SubmitButton size="sm" variant="secondary">I completed this</SubmitButton>
                          </form>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {myReports.length ? (
            <Card>
              <CardHeader title="Reports I filed" description="Only standards officers can read reports." />
              <ul className="divide-y divide-line">
                {myReports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <p className="text-sm text-ink">Filed {formatDate(r.created_at, chapter.timezone)}</p>
                    <Badge tone={INCIDENT_STATUS[r.status as keyof typeof INCIDENT_STATUS]?.tone ?? "neutral"}>{INCIDENT_STATUS[r.status as keyof typeof INCIDENT_STATUS]?.label ?? r.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-8">
          {managePolicies ? (
            <Card>
              <CardHeader title="Publish a policy" description="Published versions are permanent. Revisions create a new version." />
              <CardBody>
                <SimpleForm
                  action={createPolicy.bind(null, slug)}
                  submitLabel="Publish"
                  pendingLabel="Publishing"
                  fields={[
                    { name: "title", label: "Title", maxLength: 140 },
                    { name: "category", label: "Category", type: "select", defaultValue: "general", options: Object.entries(POLICY_CATEGORY).map(([value, label]) => ({ value, label })) },
                    { name: "body", label: "Policy text", type: "textarea", maxLength: 50000 },
                    { name: "requires_ack", label: "Members must acknowledge", type: "checkbox", defaultChecked: true, hint: "Members are notified and asked to confirm they read it." },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}
          {manage ? (
            <Card>
              <CardHeader title="Add a training requirement" />
              <CardBody>
                <SimpleForm
                  action={createTraining.bind(null, slug)}
                  submitLabel="Add requirement"
                  fields={[
                    { name: "title", label: "Training", placeholder: "Hazing prevention", maxLength: 140 },
                    { name: "due_on", label: "Due", type: "date", min: today },
                    { name: "description", label: "How to complete it", type: "textarea", maxLength: 2000 },
                    { name: "class_new_member", label: CLASS_LABEL.new_member, type: "checkbox", defaultChecked: true, span: "half" },
                    { name: "class_active", label: CLASS_LABEL.active, type: "checkbox", defaultChecked: true, span: "half" },
                    { name: "class_associate", label: CLASS_LABEL.associate, type: "checkbox", span: "half" },
                    { name: "class_alumni", label: CLASS_LABEL.alumni, type: "checkbox", span: "half" },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}
          {!managePolicies && !manage ? (
            <Card>
              <CardBody className="flex gap-3">
                <BookCheck className="size-5 shrink-0 text-ink-3" aria-hidden />
                <p className="text-[13px] text-ink-2">Acknowledging a policy records that you read the current version. If it is revised, you will be asked to acknowledge again.</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
