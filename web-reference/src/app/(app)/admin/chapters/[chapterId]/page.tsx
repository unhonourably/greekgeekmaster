import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Money, Notice, PageHeader, Table, Td, TextLink, Th, Tr } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { auditLabel } from "@/lib/audit";
import { setChapterStatus } from "../../actions";
import { StatusForm } from "./status-form";

export default async function AdminChapter({ params }: PageProps<"/admin/chapters/[chapterId]">) {
  const { chapterId } = await params;
  const { role } = await requireStaff(["support", "reviewer", "finance"]);
  const supabase = await createClient();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, slug, organization_name, designation, greek_letters, status, suspended_reason, verified_at, verification_method, timezone, created_at, university:universities(name)")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter) notFound();
  const finance = role === "admin" || role === "finance";
  const [{ data: overview }, { data: subs }, { data: invoices }, { data: account }, { data: audit }, { data: application }] = await Promise.all([
    supabase.rpc("platform_chapter_overview", { p_search: chapter.slug, p_status: null, p_limit: 5, p_offset: 0 }),
    finance ? supabase.from("chapter_subscriptions").select("status, unit_amount_cents, billing_interval, current_period_end, cancel_at_period_end").eq("chapter_id", chapter.id).order("updated_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
    finance ? supabase.from("saas_invoices").select("stripe_invoice_id, amount_paid_cents, status, paid_at, created_at").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    finance || role === "support" ? supabase.from("connected_accounts").select("stripe_account_id, livemode, card_payments_status, payouts_status, requirements_due, disabled_reason").eq("chapter_id", chapter.id).maybeSingle() : Promise.resolve({ data: null }),
    role === "admin" ? supabase.from("audit_logs").select("id, action, actor_kind, created_at").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
    supabase.from("chapter_applications").select("id").eq("created_chapter_id", chapter.id).order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const o = ((overview ?? []) as Array<{ id: string; active_members: number }>).find((r) => r.id === chapter.id);
  const sub = ((subs ?? []) as Array<{ status: string; unit_amount_cents: number | null; billing_interval: string | null; current_period_end: string | null; cancel_at_period_end: boolean }>)[0];
  const university = chapter.university as unknown as { name: string } | null;

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/admin/chapters">Chapters</TextLink>}
        title={[chapter.organization_name, chapter.designation].filter(Boolean).join(", ")}
        description={university?.name}
        actions={<Badge tone={chapter.status === "verified" ? "positive" : chapter.status === "suspended" ? "danger" : "neutral"}>{chapter.status}</Badge>}
      />
      {chapter.status === "suspended" && chapter.suspended_reason ? (
        <Notice tone="danger" title="Suspended" className="mb-6">{chapter.suspended_reason}</Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Chapter" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: "Slug", value: <span className="font-mono text-[13px]">{chapter.slug}</span> },
                  { label: "Greek letters", value: chapter.greek_letters ?? "None" },
                  { label: "Active members", value: o?.active_members ?? 0 },
                  { label: "Verified", value: chapter.verified_at ? `${formatDate(chapter.verified_at)} by ${chapter.verification_method?.replace(/_/g, " ") ?? "review"}` : "Not verified" },
                  { label: "Application", value: application ? <Link href={`/admin/verification/${application.id}`} className="text-accent hover:underline">Open application</Link> : "None on file" },
                  { label: "Time zone", value: chapter.timezone },
                ]}
              />
            </CardBody>
          </Card>
          {finance ? (
            <Card>
              <CardHeader title="Subscription" description="The $30 monthly chapter subscription, billed through Stripe Billing." />
              <CardBody className="space-y-4">
                {sub ? (
                  <DefinitionList
                    items={[
                      { label: "Status", value: <Badge tone={sub.status === "active" || sub.status === "trialing" ? "positive" : "warning"}>{sub.status.replace(/_/g, " ")}</Badge> },
                      { label: "Price", value: sub.unit_amount_cents ? <><Money cents={sub.unit_amount_cents} /> per {sub.billing_interval ?? "month"}</> : "Unknown" },
                      { label: "Renews", value: sub.current_period_end ? `${formatDate(sub.current_period_end)}${sub.cancel_at_period_end ? " (cancels)" : ""}` : "Unknown" },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-ink-3">No subscription yet.</p>
                )}
                {(invoices ?? []).length ? (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Invoice</Th>
                        <Th>Status</Th>
                        <Th align="right">Paid</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoices as Array<{ stripe_invoice_id: string; amount_paid_cents: number; status: string; paid_at: string | null; created_at: string }>).map((i) => (
                        <Tr key={i.stripe_invoice_id}>
                          <Td className="text-[13px]">{formatDate(i.paid_at ?? i.created_at)}</Td>
                          <Td className="text-[13px]">{i.status}</Td>
                          <Td align="right"><Money cents={i.amount_paid_cents} /></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          {account ? (
            <Card>
              <CardHeader title="Payments account" description="Stripe Connect account that receives member dues." />
              <CardBody>
                <DefinitionList
                  items={[
                    { label: "Account", value: <span className="font-mono text-[13px]">{account.stripe_account_id}</span> },
                    { label: "Mode", value: account.livemode ? "Live" : "Test" },
                    { label: "Card payments", value: account.card_payments_status },
                    { label: "Payouts", value: account.payouts_status },
                    { label: "Requirements due", value: (account.requirements_due as string[]).length ? (account.requirements_due as string[]).join(", ") : "None" },
                    ...(account.disabled_reason ? [{ label: "Disabled reason", value: account.disabled_reason }] : []),
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}
          {role === "admin" && (audit ?? []).length ? (
            <Card>
              <CardHeader title="Recent audit events" />
              <CardBody>
                <ul className="space-y-1.5 text-[13px]">
                  {(audit as Array<{ id: number; action: string; actor_kind: string; created_at: string }>).map((a) => (
                    <li key={a.id} className="flex justify-between gap-3">
                      <span className="text-ink-2">{auditLabel(a.action)}</span>
                      <span className="shrink-0 text-ink-3">{formatDateTime(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div>
          {role === "admin" ? (
            <Card>
              <CardHeader title="Change status" description="Suspending pauses dues collection, invitations, and new payments. Members keep read access." />
              <CardBody>
                <StatusForm action={setChapterStatus.bind(null, chapter.id)} current={chapter.status} />
              </CardBody>
            </Card>
          ) : (
            <Notice>Only platform administrators can change a chapter&apos;s status.</Notice>
          )}
        </div>
      </div>
    </>
  );
}
