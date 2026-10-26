import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDashed } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, DefinitionList, Money, Notice, PageHeader, Table, Td, Th, Tr } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { MemberClass } from "@/lib/permissions";
import { calculatePlatformFee } from "@/lib/fees";
import { getChapterPricing } from "@/lib/chapter-pricing";
import { getReadiness } from "@/lib/readiness";
import { formatCents } from "@/lib/money";
import { requestTime } from "@/lib/format";
import { todayIn } from "@/lib/modules";
import { issueAssessment, setAssessmentStatus, updateAssessment } from "../../actions";
import { DraftDetails, IssueForm } from "../../finance-forms";
import { SendChargeButton } from "./send-charge-button";

export const metadata: Metadata = { title: "Assessment" };

const MA_TONE = { open: "warning", partially_paid: "info", paid: "positive", voided: "neutral" } as const;
const MA_LABEL = { open: "Unpaid", partially_paid: "Partly paid", paid: "Paid", voided: "Voided" } as const;
const CATEGORY_LABEL: Record<string, string> = { dues: "Dues", new_member_fee: "New member fee", fine: "Fine", housing: "Housing", event: "Event", other: "Other" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", issued: "Sent", closed: "Closed", cancelled: "Cancelled" };

function Step({ n, title, description, id, children }: { n: number; title: string; description?: string; id?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-semibold text-on-accent tnum">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-ink-3">{description}</p> : null}
        </div>
      </div>
      <CardBody className="py-5">{children}</CardBody>
    </Card>
  );
}

export default async function AssessmentDetail({ params }: PageProps<"/c/[slug]/finances/assessments/[id]">) {
  const { slug, id } = await params;
  const { chapter, can } = await requireChapter(slug, "finance.view");
  const supabase = await createClient();
  const { data: a } = await supabase.from("dues_assessments").select("*").eq("id", id).eq("chapter_id", chapter.id).maybeSingle();
  if (!a) notFound();
  const today = todayIn(chapter.timezone, requestTime());
  const [{ data: rows }, { data: members }, pricing, { data: exemptions }, readiness, { data: housed }] = await Promise.all([
    supabase.from("member_assessment_balances").select("id, membership_id, amount_cents, outstanding_cents, processing_cents, status").eq("assessment_id", a.id),
    supabase.from("memberships").select("id, member_class, status, joined_at, user:profiles!memberships_user_id_fkey(full_name, display_name)").eq("chapter_id", chapter.id).in("status", ["active", "inactive"]),
    getChapterPricing(chapter.id),
    supabase.from("assessment_exemptions").select("membership_id").eq("assessment_id", a.id),
    getReadiness(chapter.id),
    supabase.from("room_assignments").select("membership_id").eq("chapter_id", chapter.id).lte("starts_on", today).or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);
  const inHouseIds = new Set((housed ?? []).map((row) => row.membership_id as string));
  const exemptIds = (exemptions ?? []).map((e) => e.membership_id as string);
  const memberList = ((members ?? []) as unknown as Array<{ id: string; member_class: MemberClass; status: string; joined_at: string | null; user: { full_name: string; display_name: string } | null }>).map((m) => ({
    id: m.id,
    name: m.user?.full_name || m.user?.display_name || "Member",
    memberClass: m.member_class,
    active: m.status === "active",
    inHouse: m.member_class === "active" && inHouseIds.has(m.id),
    joinedAt: m.joined_at,
  }));
  const nameById = new Map(memberList.map((m) => [m.id, m.name]));
  const assessed = new Set((rows ?? []).map((r) => r.membership_id));
  const unassessed = memberList.filter((m) => !assessed.has(m.id)).sort((x, y) => x.name.localeCompare(y.name));
  const remaining = unassessed.filter((m) => !exemptIds.includes(m.id));
  const issuedAt = a.issued_at ? new Date(a.issued_at).getTime() : null;
  const lateJoiners = issuedAt === null ? [] : remaining.filter((m) => m.joinedAt && new Date(m.joinedAt).getTime() > issuedAt);
  const live = (rows ?? []).filter((r) => r.status !== "voided");
  const billed = live.reduce((s, r) => s + Number(r.amount_cents), 0);
  const outstanding = live.reduce((s, r) => s + Math.max(0, Number(r.outstanding_cents)), 0);
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
  const base = `/c/${chapter.slug}/finances`;
  const isDraft = a.status === "draft";
  const open = isDraft || a.status === "issued";
  const amount = Number(a.default_amount_cents);
  const lateFee = Number(a.late_fee_cents);
  const fee = calculatePlatformFee(amount, pricing.rule);
  const dueLabel = dateFmt.format(new Date(a.due_date));
  const manage = can("finance.manage");

  const issueForm = (
    <IssueForm
      key={`${a.status}-${live.length}-${exemptIds.join(",")}`}
      initialExempt={exemptIds}
      action={issueAssessment.bind(null, chapter.slug, a.id)}
      members={unassessed}
      defaultCents={amount}
      title={a.title}
      dueLabel={dueLabel}
      alreadyBilled={live.length}
    />
  );

  const header = (
    <PageHeader
      eyebrow={<Link href={`${base}/assessments`} className="hover:text-ink">Assessments</Link>}
      title={a.title}
      description={a.description ?? undefined}
      actions={
        <div className="flex items-center gap-2">
          <Badge tone={a.status === "issued" ? "info" : a.status === "closed" ? "positive" : "neutral"}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
          {manage && a.status === "issued" ? (
            <form action={setAssessmentStatus.bind(null, chapter.slug, a.id, "closed")}>
              <ConfirmSubmit message="Close this assessment? Members who still owe keep their balance, and new members can only be added one at a time from their account page." variant="secondary">Close</ConfirmSubmit>
            </form>
          ) : null}
          {manage && isDraft ? (
            <>
              <form action={setAssessmentStatus.bind(null, chapter.slug, a.id, "cancelled")}>
                <ConfirmSubmit message="Delete this draft? Nobody has been charged." variant="ghost">Delete draft</ConfirmSubmit>
              </form>
              <SendChargeButton />
            </>
          ) : null}
        </div>
      }
    />
  );

  if (isDraft && manage) {
    return (
      <>
        {header}
          <Notice tone="info" title="This is a draft" className="mb-6">
          Nobody has been charged yet. Check the details, choose who gets charged, then press Send charge.
          {readiness && !readiness.can_collect ? " Online payments are not set up yet, so members will see the charge but pay you by cash or check until Stripe is connected." : ""}
        </Notice>
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Step n={1} title="What you are charging" description="You can edit anything until you send it.">
              <DraftDetails
                action={updateAssessment.bind(null, chapter.slug, a.id)}
                initial={{
                  title: a.title,
                  description: a.description ?? "",
                  category: a.category,
                  amount: (amount / 100).toFixed(2),
                  due_date: a.due_date,
                  late_fee: lateFee > 0 ? (lateFee / 100).toFixed(2) : "",
                  late_fee_grace_days: String(a.late_fee_grace_days),
                  allow_installments: a.allow_installments ? "on" : "",
                  max_installments: String(a.max_installments),
                }}
                rows={[
                  { label: "Title", value: a.title },
                  { label: "Category", value: CATEGORY_LABEL[a.category] ?? a.category },
                  { label: "Amount per member", value: formatCents(amount) },
                  { label: "Due date", value: dueLabel },
                  { label: "Late fee", value: lateFee > 0 ? `${formatCents(lateFee)} after ${a.late_fee_grace_days} days` : "None" },
                  { label: "Installments", value: a.allow_installments ? `Up to ${a.max_installments} payments` : "Pay in full" },
                ]}
              />
            </Step>
            <Step n={2} id="send" title="Who gets charged, then send" description="Send it to everyone, only actives who live in the house, or only actives who live out. Exempt anyone who should skip this round.">
              {issueForm}
            </Step>
          </div>
          <aside className="space-y-6 self-start xl:sticky xl:top-20">
            <Card>
              <CardHeader title="What members will see" />
              <CardBody className="space-y-3">
                <div className="rounded-lg border border-line bg-canvas p-4">
                  <p className="text-[12px] text-ink-3">{CATEGORY_LABEL[a.category] ?? "Charge"} · {chapter.organization_name}</p>
                  <p className="mt-1 font-medium text-ink">{a.title}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink tnum">{formatCents(amount)}</p>
                  <p className="text-[13px] text-ink-2">Due {dueLabel}</p>
                  {a.allow_installments ? <p className="mt-2 text-[12px] text-ink-3">Can split into up to {a.max_installments} payments</p> : null}
                  {lateFee > 0 ? <p className="mt-1 text-[12px] text-ink-3">{formatCents(lateFee)} late fee after {a.late_fee_grace_days} days</p> : null}
                </div>
                <p className="text-[12px] text-ink-3">Platform fee of {formatCents(fee)} applies if paid online. Cash and check payments you record have no fee.</p>
              </CardBody>
            </Card>
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Members charged" description={`${live.length} members · ${formatCents(billed)} billed · ${formatCents(outstanding)} outstanding`} />
            {(rows ?? []).length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-6 text-sm text-ink-3">
                <CircleDashed className="size-4" aria-hidden />
                Not sent to anyone yet.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Outstanding</Th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? [])
                    .map((r) => ({ ...r, name: nameById.get(r.membership_id) ?? "Former member" }))
                    .sort((x, y) => x.name.localeCompare(y.name))
                    .map((r) => (
                      <Tr key={r.id}>
                        <Td>
                          <Link href={`${base}/members/${r.membership_id}`} className="hover:underline">{r.name}</Link>
                        </Td>
                        <Td>
                          <Badge tone={MA_TONE[r.status as keyof typeof MA_TONE]}>{MA_LABEL[r.status as keyof typeof MA_LABEL]}</Badge>
                          {Number(r.processing_cents) > 0 ? <Badge tone="info" className="ml-1">Clearing</Badge> : null}
                        </Td>
                        <Td align="right"><Money cents={Number(r.amount_cents)} /></Td>
                        <Td align="right"><Money cents={Math.max(0, Number(r.outstanding_cents))} /></Td>
                      </Tr>
                    ))}
                </tbody>
              </Table>
            )}
          </Card>
          {manage && open && unassessed.length > 0 ? (
            <Card>
              <CardHeader
                title="Charge more members"
                description={`${remaining.length} ${remaining.length === 1 ? "member has" : "members have"} not been charged for this yet${exemptIds.length ? `, and ${exemptIds.length} ${exemptIds.length === 1 ? "is" : "are"} exempt` : ""}.${lateJoiners.length ? ` ${lateJoiners.length} joined after it went out.` : ""}`}
              />
              <CardBody className="py-5">{issueForm}</CardBody>
            </Card>
          ) : null}
          {manage && a.status === "closed" && lateJoiners.length > 0 ? (
            <Card>
              <CardHeader title="Joined after this went out" description="This assessment is closed, but you can still charge these members one at a time, prorated if you like." />
              <ul className="divide-y divide-line">
                {lateJoiners.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                      {m.joinedAt ? <p className="text-[12px] text-ink-3">Joined {dateFmt.format(new Date(m.joinedAt))}</p> : null}
                    </div>
                    <ButtonLink href={`${base}/members/${m.id}`} size="sm" variant="secondary">Add charge</ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <Card className="self-start">
          <CardHeader title="Details" />
          <CardBody>
            <DefinitionList
              items={[
                { label: "Amount", value: <Money cents={amount} /> },
                { label: "Due", value: dueLabel },
                { label: "Late fee", value: lateFee > 0 ? `${formatCents(lateFee)} after ${a.late_fee_grace_days} days` : "None" },
                { label: "Installments", value: a.allow_installments ? `Up to ${a.max_installments}` : "Not allowed" },
                { label: "Platform fee", value: `${formatCents(fee)} if paid online` },
                { label: "Members", value: `${live.length} charged` },
                { label: "Exempt", value: exemptIds.length ? exemptIds.map((x) => nameById.get(x) ?? "Member").join(", ") : "None" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
