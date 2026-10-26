import { CircleCheck } from "lucide-react";
import { Badge, Card, EmptyState, Money, PageHeader, Table, Td, Th, Tr } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, requestTime } from "@/lib/format";

type Row = {
  payment_id: string;
  chapter: string;
  status: string;
  amount_cents: number;
  platform_fee_cents: number;
  application_fee_cents: number | null;
  processing_fee_cents: number | null;
  reconciliation_status: string;
  reconciliation_note: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
};

function issue(r: Row, now: number): { label: string; tone: "danger" | "warning" } {
  if (r.reconciliation_status === "mismatch") return { label: "Amount mismatch", tone: "danger" };
  if (r.status === "processing" && now - new Date(r.created_at).getTime() > 7 * 86_400_000) return { label: "Processing over 7 days", tone: "warning" };
  return { label: "Processing fee not synced", tone: "warning" };
}

export default async function ReconciliationPage() {
  await requireStaff(["finance"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_reconciliation_queue", { p_limit: 200 });
  const rows = (data ?? []) as Row[];
  const now = requestTime();

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Payments where Stripe and the ledger disagree, the fee breakdown has not synced, or an ACH payment has been processing for over a week. Webhook replays resolve most items; mismatches need investigation in the chapter's connected account in Stripe."
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={CircleCheck} title="Everything reconciles">Every online payment matches its ledger entries.</EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Payment</Th>
                <Th>Issue</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Expected fee</Th>
                <Th align="right">Stripe fee</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const i = issue(r, now);
                return (
                  <Tr key={r.payment_id}>
                    <Td>
                      <span className="block">{r.chapter}</span>
                      <span className="block font-mono text-[12px] text-ink-3">{r.stripe_payment_intent_id ?? r.payment_id}</span>
                    </Td>
                    <Td>
                      <Badge tone={i.tone}>{i.label}</Badge>
                      {r.reconciliation_note ? <span className="mt-1 block max-w-xs text-[12px] text-ink-3">{r.reconciliation_note}</span> : null}
                    </Td>
                    <Td align="right"><Money cents={r.amount_cents} /></Td>
                    <Td align="right"><Money cents={r.platform_fee_cents} /></Td>
                    <Td align="right">{r.application_fee_cents === null ? <span className="text-ink-3">None</span> : <Money cents={r.application_fee_cents} />}</Td>
                    <Td className="whitespace-nowrap text-[13px] text-ink-3">{formatDateTime(r.created_at)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
