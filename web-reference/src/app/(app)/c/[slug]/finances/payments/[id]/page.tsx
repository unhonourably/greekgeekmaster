import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Money, Notice, PageHeader, Table, Td, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { PAYMENT_STATUS_LABEL, paymentMethodLabel, paymentTone, type PaymentStatus } from "@/lib/payment-state";
import { LEDGER_ACCOUNT_LABEL, LEDGER_KIND_LABEL } from "@/lib/ledger";
import { requestRefund } from "../../actions";
import { RefundForm } from "../../finance-forms";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentDetail({ params }: PageProps<"/c/[slug]/finances/payments/[id]">) {
  const { slug, id } = await params;
  const { chapter, can, user } = await requireChapter(slug, "finance.view");
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("payments")
    .select("*, membership:memberships(id, user_id, user:profiles!memberships_user_id_fkey(full_name, display_name)), assessment:member_assessments(dues:dues_assessments(title)), receipt:receipts(receipt_number)")
    .eq("id", id)
    .eq("chapter_id", chapter.id)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: refunds }, { data: disputes }, { data: txns }] = await Promise.all([
    supabase.from("refunds").select("id, amount_cents, expected_fee_refund_cents, reason, status, origin, failure_reason, created_at, succeeded_at").eq("payment_id", p.id).order("created_at"),
    supabase.from("disputes").select("id, amount_cents, reason, status, outcome, evidence_due_by, fee_cents, created_at").eq("payment_id", p.id).order("created_at"),
    supabase.from("ledger_transactions").select("id, kind, description, occurred_at, ledger_entries(id, account, amount_cents)").eq("payment_id", p.id).order("occurred_at"),
  ]);
  const m = p.membership as unknown as { id: string; user_id: string; user: { full_name: string; display_name: string } | null } | null;
  const title = (p.assessment as unknown as { dues: { title: string } | null } | null)?.dues?.title ?? "Payment";
  const receipt = (p.receipt as unknown as { receipt_number: string } | Array<{ receipt_number: string }> | null);
  const receiptNumber = Array.isArray(receipt) ? receipt[0]?.receipt_number : receipt?.receipt_number;
  const pending = (refunds ?? []).filter((r) => r.status === "pending" || r.status === "processing").reduce((s, r) => s + Number(r.amount_cents), 0);
  const refundable = Number(p.amount_cents) - Number(p.refunded_cents) - pending;
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: chapter.timezone });
  const isOwn = m?.user_id === user.id;
  const canRefund = can("finance.refund") && p.kind === "stripe" && (p.status === "succeeded" || p.status === "partially_refunded") && refundable > 0 && !isOwn;
  const feePortion = p.application_fee_cents ? Math.round((Number(p.application_fee_cents) * refundable) / Number(p.amount_cents)) : 0;
  const net = Number(p.amount_cents) - Number(p.platform_fee_cents ?? 0) - Number(p.processing_fee_cents ?? 0);

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/c/${chapter.slug}/finances/payments`} className="hover:text-ink">Payments</Link>}
        title={`${formatCents(Number(p.amount_cents))} from ${m?.user?.full_name || m?.user?.display_name || "member"}`}
        description={title}
        actions={<Badge tone={paymentTone(p.status)}>{PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status}</Badge>}
      />
      {p.reconciliation_status === "mismatch" ? (
        <Notice tone="danger" title="Reconciliation mismatch" className="mb-6">{p.reconciliation_note ?? "Stripe reported different amounts than expected. Platform support has been alerted."}</Notice>
      ) : null}
      {p.status === "failed" && p.failure_message ? <Notice tone="danger" title="Payment failed" className="mb-6">{p.failure_message}</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Breakdown" />
            <Table>
              <tbody>
                <Tr><Td>Member paid</Td><Td align="right"><Money cents={Number(p.amount_cents)} /></Td></Tr>
                {p.kind === "stripe" ? (
                  <>
                    <Tr><Td>Platform fee ({((Number(p.platform_fee_bps ?? 0)) / 100).toFixed(2)}%)</Td><Td align="right"><Money cents={-Number(p.platform_fee_cents)} /></Td></Tr>
                    <Tr><Td>Stripe processing fee</Td><Td align="right">{p.processing_fee_cents !== null ? <Money cents={-Number(p.processing_fee_cents)} /> : <span className="text-ink-3">Waiting for Stripe</span>}</Td></Tr>
                    <tr className="bg-canvas/60"><Td className="font-semibold">Chapter receives</Td><Td align="right" className="font-semibold"><Money cents={net} /></Td></tr>
                  </>
                ) : (
                  <Tr><Td className="text-ink-3">Offline payments have no fees</Td><Td /></Tr>
                )}
                {Number(p.refunded_cents) > 0 ? <Tr><Td>Refunded</Td><Td align="right"><Money cents={-Number(p.refunded_cents)} /></Td></Tr> : null}
                {Number(p.application_fee_refunded_cents) > 0 ? <Tr><Td>Platform fee returned</Td><Td align="right"><Money cents={Number(p.application_fee_refunded_cents)} /></Td></Tr> : null}
              </tbody>
            </Table>
          </Card>
          {(refunds ?? []).length > 0 ? (
            <Card>
              <CardHeader title="Refunds" />
              <Table>
                <thead><tr><Th>Date</Th><Th>Reason</Th><Th>Status</Th><Th align="right">Amount</Th></tr></thead>
                <tbody>
                  {(refunds ?? []).map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap text-ink-2">{fmt.format(new Date(r.created_at))}</Td>
                      <Td>{r.reason}{r.failure_reason ? <span className="block text-[12px] text-danger">{r.failure_reason}</span> : null}</Td>
                      <Td><Badge tone={r.status === "succeeded" ? "positive" : r.status === "failed" ? "danger" : "info"}>{r.status}</Badge></Td>
                      <Td align="right"><Money cents={Number(r.amount_cents)} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
          {(disputes ?? []).length > 0 ? (
            <Card>
              <CardHeader title="Disputes" description="Respond to disputes from your Stripe Dashboard before the evidence deadline." />
              <Table>
                <thead><tr><Th>Opened</Th><Th>Reason</Th><Th>Status</Th><Th>Evidence due</Th><Th align="right">Amount</Th></tr></thead>
                <tbody>
                  {(disputes ?? []).map((d) => (
                    <Tr key={d.id}>
                      <Td className="whitespace-nowrap text-ink-2">{fmt.format(new Date(d.created_at))}</Td>
                      <Td>{d.reason ?? "Unknown"}</Td>
                      <Td><Badge tone={d.outcome === "won" ? "positive" : d.outcome === "lost" ? "danger" : "warning"}>{d.outcome ?? d.status}</Badge></Td>
                      <Td className="text-ink-2">{d.evidence_due_by ? fmt.format(new Date(d.evidence_due_by)) : "—"}</Td>
                      <Td align="right"><Money cents={Number(d.amount_cents)} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Ledger entries" description="Each transaction balances to zero." />
            <CardBody className="space-y-4">
              {((txns ?? []) as unknown as Array<{ id: string; kind: string; description: string; occurred_at: string; ledger_entries: Array<{ id: number; account: string; amount_cents: number }> }>).map((t) => (
                <div key={t.id} className="rounded-md border border-line">
                  <div className="flex items-center justify-between border-b border-line bg-canvas/60 px-3 py-2 text-[13px]">
                    <span className="font-medium text-ink">{LEDGER_KIND_LABEL[t.kind] ?? t.kind}</span>
                    <span className="text-ink-3">{fmt.format(new Date(t.occurred_at))}</span>
                  </div>
                  <ul className="divide-y divide-line text-[13px]">
                    {t.ledger_entries.map((e) => (
                      <li key={e.id} className="flex justify-between px-3 py-1.5">
                        <span className="text-ink-2">{LEDGER_ACCOUNT_LABEL[e.account] ?? e.account}</span>
                        <Money cents={Number(e.amount_cents)} signed />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {(txns ?? []).length === 0 ? <p className="text-sm text-ink-3">Nothing posted yet.</p> : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: "Member", value: m ? <Link href={`/c/${chapter.slug}/finances/members/${m.id}`} className="text-accent hover:underline">{m.user?.full_name || m.user?.display_name}</Link> : "—" },
                  { label: "Method", value: paymentMethodLabel(p.kind, p.method) },
                  { label: "Created", value: fmt.format(new Date(p.created_at)) },
                  { label: "Paid", value: p.succeeded_at ? fmt.format(new Date(p.succeeded_at)) : "—" },
                  { label: "Receipt", value: receiptNumber ?? "—" },
                  ...(p.kind === "offline" ? [{ label: "Reference", value: p.offline_reference ?? "—" }, { label: "Memo", value: p.memo ?? "—" }] : []),
                  ...(p.stripe_payment_intent_id ? [{ label: "Stripe", value: <span className="font-mono text-[12px]">{p.stripe_payment_intent_id}</span> }] : []),
                ]}
              />
            </CardBody>
          </Card>
          {canRefund ? (
            <Card>
              <CardHeader title="Refund" />
              <CardBody>
                <RefundForm
                  action={requestRefund.bind(null, chapter.slug, p.id)}
                  refundableCents={refundable}
                  feeNote={`We return the matching share of the platform fee automatically (about ${formatCents(feePortion)} on a full refund). Stripe keeps its processing fee.`}
                />
              </CardBody>
            </Card>
          ) : isOwn && can("finance.refund") ? (
            <Notice tone="info">Another officer must refund your own payment.</Notice>
          ) : null}
        </div>
      </div>
    </>
  );
}
