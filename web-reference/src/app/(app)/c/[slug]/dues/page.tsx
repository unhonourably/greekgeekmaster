import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ReceiptText } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, Notice, PageHeader, Table, Td, Th, Tr } from "@/components/ui";
import { ConfirmSubmit, ExternalActionForm, ExternalSubmitButton } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { PAYMENT_STATUS_LABEL, paymentMethodLabel, paymentTone, type PaymentStatus } from "@/lib/payment-state";
import { cancelPlan, createPlan, payCharge } from "./actions";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "My dues" };

const ERRORS: Record<string, string> = {
  stripe: "Online payments are not available right now.",
  rate: "Too many payment attempts. Wait a few minutes and try again.",
  invalid: "That charge could not be found.",
};

type Charge = {
  id: string;
  title: string;
  category: string;
  amount_cents: number;
  outstanding_cents: number;
  processing_cents: number;
  due_date: string;
  status: string;
  allow_installments: boolean;
  max_installments: number;
};

type Plan = { id: string; member_assessment_id: string; installments: Array<{ id: string; sequence: number; amount_cents: number; due_date: string; status: string }> };

export default async function DuesPage({ params, searchParams }: PageProps<"/c/[slug]/dues">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter, membership } = await requireChapter(slug);
  const supabase = await createClient();
  const [{ data: balance }, { data: chargeRows }, { data: planRows }, { data: payments }, { data: readiness }] = await Promise.all([
    supabase.rpc("member_balance", { p_membership: membership.id }),
    supabase.from("member_assessment_balances").select("id, title, category, amount_cents, outstanding_cents, processing_cents, due_date, status, allow_installments, max_installments").eq("membership_id", membership.id).order("due_date"),
    supabase.from("installment_plans").select("id, member_assessment_id, installments(id, sequence, amount_cents, due_date, status)").eq("status", "active"),
    supabase
      .from("payments")
      .select("id, kind, method, status, amount_cents, refunded_cents, created_at, succeeded_at, failure_message, assessment:member_assessments(dues:dues_assessments(title)), receipt:receipts(receipt_number)")
      .eq("membership_id", membership.id)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("chapter_payment_readiness", { p_chapter: chapter.id }),
  ]);
  const bal = balance as { balance_cents: number; processing_cents: number; next_due_date: string | null } | null;
  const charges = (chargeRows ?? []) as Charge[];
  const open = charges.filter((c) => c.status !== "voided" && Number(c.outstanding_cents) > 0);
  const settled = charges.filter((c) => !(c.status !== "voided" && Number(c.outstanding_cents) > 0));
  const plans = new Map(((planRows ?? []) as Plan[]).map((p) => [p.member_assessment_id, p]));
  const canPayOnline = Boolean((readiness as { can_collect?: boolean } | null)?.can_collect);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: chapter.timezone }).format(new Date());
  const dueFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: chapter.timezone });
  const errorMessage = typeof sp.error === "string" ? ERRORS[sp.error] ?? sp.error : null;
  const pay = payCharge.bind(null, chapter.slug);

  return (
    <>
      <PageHeader title="My dues" description={`Your balance with ${chapter.organization_name}. You pay exactly what you owe; no fees are added.`} />
      {errorMessage ? <Notice tone="danger" className="mb-6">{errorMessage}</Notice> : null}
      {sp.checkout === "success" ? (
        <Notice tone="positive" title="Payment submitted" className="mb-6">
          Card payments confirm within a minute. Bank payments take 3 to 5 business days to clear; your balance shows them as clearing until then.
        </Notice>
      ) : null}
      {sp.checkout === "canceled" ? <Notice tone="info" className="mb-6">Checkout canceled. You were not charged.</Notice> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-3">Balance</p>
            <p className="mt-1 text-2xl font-semibold text-ink tnum">{formatCents(Number(bal?.balance_cents ?? 0))}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-3">Clearing</p>
            <p className="mt-1 text-2xl font-semibold text-ink tnum">{formatCents(Number(bal?.processing_cents ?? 0))}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-3">Next due</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{bal?.next_due_date ? dueFmt.format(new Date(bal.next_due_date)) : "Nothing due"}</p>
          </CardBody>
        </Card>
      </div>

      {!canPayOnline && open.length > 0 ? (
        <Notice tone="info" className="mb-6">Your chapter is not accepting online payments yet. Pay your treasurer directly; they will record it here.</Notice>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="Open charges" />
        {open.length === 0 ? (
          <EmptyState icon={CreditCard} title="You are all paid up">New charges from your treasurer will appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((c) => {
              const plan = plans.get(c.id);
              const nextInstallment = plan?.installments.filter((i) => i.status === "scheduled").sort((a, b) => a.sequence - b.sequence)[0];
              const overdue = c.due_date < today;
              const clearing = Number(c.processing_cents) > 0;
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                        {c.title}
                        {overdue && !plan ? <Badge tone="danger">Overdue</Badge> : null}
                        {clearing ? <Badge tone="info">{formatCents(Number(c.processing_cents))} clearing</Badge> : null}
                        {plan ? <Badge tone="accent">Installment plan</Badge> : null}
                      </p>
                      <p className="text-[13px] text-ink-3">
                        Due {dueFmt.format(new Date(c.due_date))} · {formatCents(Number(c.amount_cents))} total
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money cents={Number(c.outstanding_cents)} className="text-lg font-semibold" />
                      {canPayOnline && !clearing ? (
                        <ExternalActionForm action={pay}>
                          <input type="hidden" name="member_assessment" value={c.id} />
                          {nextInstallment ? <input type="hidden" name="installment" value={nextInstallment.id} /> : null}
                          <ExternalSubmitButton size="sm" pendingLabel="Opening checkout">
                            {nextInstallment ? `Pay ${formatCents(Math.min(Number(nextInstallment.amount_cents), Number(c.outstanding_cents)))}` : "Pay now"}
                          </ExternalSubmitButton>
                        </ExternalActionForm>
                      ) : null}
                    </div>
                  </div>
                  {plan ? (
                    <div className="mt-3 rounded-md border border-line">
                      <ul className="divide-y divide-line text-[13px]">
                        {plan.installments.sort((a, b) => a.sequence - b.sequence).map((i) => (
                          <li key={i.id} className="flex items-center justify-between px-3 py-1.5">
                            <span className="text-ink-2">Payment {i.sequence} · by {dueFmt.format(new Date(i.due_date))}</span>
                            <span className="flex items-center gap-2">
                              {i.status === "paid" ? <Badge tone="positive">Paid</Badge> : i.due_date < today ? <Badge tone="danger">Overdue</Badge> : null}
                              <Money cents={Number(i.amount_cents)} />
                            </span>
                          </li>
                        ))}
                      </ul>
                      <form action={cancelPlan.bind(null, chapter.slug, plan.id)} className="border-t border-line px-3 py-2">
                        <ConfirmSubmit message="Cancel this installment plan? The full remaining balance will be due on the original date." variant="ghost">Cancel plan</ConfirmSubmit>
                      </form>
                    </div>
                  ) : c.allow_installments && canPayOnline && !clearing && Number(c.outstanding_cents) >= 100 ? (
                    <details className="mt-3 rounded-md border border-line px-4 py-3">
                      <summary className="cursor-pointer text-[13px] font-medium text-accent">Pay in installments</summary>
                      <div className="mt-3">
                        <PlanForm action={createPlan.bind(null, chapter.slug)} memberAssessmentId={c.id} outstanding={Number(c.outstanding_cents)} max={c.max_installments} today={today} />
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Payment history" />
        {(payments ?? []).length === 0 ? (
          <EmptyState icon={ReceiptText} title="No payments yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>For</Th>
                <Th>Method</Th>
                <Th>Status</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Receipt</Th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => {
                const receipt = p.receipt as unknown as { receipt_number: string } | Array<{ receipt_number: string }> | null;
                const number = Array.isArray(receipt) ? receipt[0]?.receipt_number : receipt?.receipt_number;
                return (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap text-ink-2">{fmt.format(new Date(p.succeeded_at ?? p.created_at))}</Td>
                    <Td>{(p.assessment as unknown as { dues: { title: string } | null } | null)?.dues?.title}</Td>
                    <Td className="text-ink-2">{paymentMethodLabel(p.kind, p.method)}</Td>
                    <Td>
                      <Badge tone={paymentTone(p.status)}>{PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status}</Badge>
                      {p.status === "failed" && p.failure_message ? <span className="block text-[12px] text-danger">{p.failure_message}</span> : null}
                    </Td>
                    <Td align="right"><Money cents={Number(p.amount_cents)} /></Td>
                    <Td align="right">{number ? <Link href={`/c/${chapter.slug}/dues/receipts/${p.id}`} className="text-accent hover:underline">{number}</Link> : <span className="text-ink-3">—</span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {settled.length > 0 ? <p className="mt-4 text-[13px] text-ink-3">{settled.length} settled or voided charge{settled.length === 1 ? "" : "s"} not shown.</p> : null}
    </>
  );
}
