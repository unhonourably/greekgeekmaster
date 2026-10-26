import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Money, Notice, Table, Td, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getReadiness } from "@/lib/readiness";
import { createAssessment } from "../actions";
import { AssessmentForm } from "../finance-forms";

export const metadata: Metadata = { title: "Assessments" };

const STATUS_TONE = { draft: "neutral", issued: "info", closed: "positive", cancelled: "neutral" } as const;
const STATUS_LABEL: Record<string, string> = { draft: "Draft", issued: "Sent", closed: "Closed", cancelled: "Cancelled" };
const CATEGORY_LABEL: Record<string, string> = { dues: "Dues", new_member_fee: "New member fee", fine: "Fine", housing: "Housing", event: "Event", other: "Other" };

export default async function AssessmentsPage({ params }: PageProps<"/c/[slug]/finances/assessments">) {
  const { slug } = await params;
  const { chapter, can } = await requireChapter(slug, "finance.view");
  const supabase = await createClient();
  const [{ data: assessments }, { data: totals }, readiness] = await Promise.all([
    supabase
      .from("dues_assessments")
      .select("id, title, category, default_amount_cents, due_date, status, allow_installments, created_at")
      .eq("chapter_id", chapter.id)
      .neq("status", "cancelled")
      .order("due_date", { ascending: false }),
    supabase.from("member_assessment_balances").select("assessment_id, amount_cents, outstanding_cents, status").eq("chapter_id", chapter.id),
    getReadiness(chapter.id),
  ]);
  const agg = new Map<string, { count: number; billed: number; outstanding: number }>();
  for (const t of totals ?? []) {
    if (t.status === "voided") continue;
    const a = agg.get(t.assessment_id) ?? { count: 0, billed: 0, outstanding: 0 };
    a.count += 1;
    a.billed += Number(t.amount_cents);
    a.outstanding += Math.max(0, Number(t.outstanding_cents));
    agg.set(t.assessment_id, a);
  }
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

  return (
    <>
    {readiness && !readiness.can_collect ? (
      <Notice
        tone="warning"
        title="Members cannot pay online yet"
        className="mb-6"
        action={can("chapter.manage") || can("payments.configure") ? <ButtonLink href={`/c/${chapter.slug}/settings/billing`} size="sm" variant="secondary">Set up Stripe</ButtonLink> : undefined}
      >
        You can still create and issue charges and record cash or check payments. Online card and bank payments turn on once Stripe setup is finished under Settings, Stripe and billing.
      </Notice>
    ) : null}
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader title="Assessments" description="Charges issued to members, such as dues, fees, and fines." />
        {(assessments ?? []).length === 0 ? (
          <EmptyState icon={ReceiptText} title="No charges yet">Create one on the right to bill members.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th align="right">Members</Th>
                <Th align="right">Billed</Th>
                <Th align="right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {(assessments ?? []).map((a) => {
                const t = agg.get(a.id) ?? { count: 0, billed: 0, outstanding: 0 };
                return (
                  <Tr key={a.id}>
                    <Td>
                      <Link href={`/c/${chapter.slug}/finances/assessments/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                      <span className="block text-[12px] text-ink-3">{CATEGORY_LABEL[a.category]}{a.allow_installments ? " · installments allowed" : ""}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{dateFmt.format(new Date(a.due_date))}</Td>
                    <Td>
                      {a.status === "draft" && can("finance.manage") ? (
                        <Link href={`/c/${chapter.slug}/finances/assessments/${a.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                          Draft · finish and send
                        </Link>
                      ) : (
                        <Badge tone={STATUS_TONE[a.status as keyof typeof STATUS_TONE]}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                      )}
                    </Td>
                    <Td align="right">{t.count}</Td>
                    <Td align="right"><Money cents={t.billed} /></Td>
                    <Td align="right"><Money cents={t.outstanding} className={t.outstanding > 0 ? "font-medium" : "text-ink-3"} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {can("finance.manage") ? (
        <Card className="self-start">
          <CardHeader title="New charge" description="Step 1 of 2. Set the amount and due date. Next you choose who gets charged and send it. Nobody is billed until you send." />
          <CardBody>
            <AssessmentForm action={createAssessment.bind(null, chapter.slug)} defaultDueDate={due.toISOString().slice(0, 10)} submitLabel="Continue to recipients" pendingLabel="Saving draft" />
          </CardBody>
        </Card>
      ) : null}
    </div>
    </>
  );
}
