import { Receipt } from "lucide-react";
import { personName } from "@/components/people";
import { SimpleForm } from "@/components/simple-form";
import { Badge, Card, CardHeader, EmptyState, Money, Notice, Stat, StatGrid, Table, Td, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { REIMBURSEMENT_STATUS, type ReimbursementStatus } from "../../reimbursements/labels";
import { reviewReimbursement } from "../../reimbursements/actions";

type Row = {
  id: string;
  user_id: string;
  description: string;
  amount_cents: number;
  spent_on: string;
  status: ReimbursementStatus;
  review_note: string | null;
  paid_reference: string | null;
  created_at: string;
  requester: { display_name: string | null; full_name: string | null } | null;
};

export default async function FinanceReimbursementsPage({ params }: PageProps<"/c/[slug]/finances/reimbursements">) {
  const { slug } = await params;
  const { chapter, user, can } = await requireChapter(slug, "finance.view");
  const manage = can("finance.manage");
  const supabase = await createClient();
  const { data } = await supabase
    .from("reimbursement_requests")
    .select("id, user_id, description, amount_cents, spent_on, status, review_note, paid_reference, created_at, requester:profiles!reimbursement_requests_user_id_fkey(display_name, full_name)")
    .eq("chapter_id", chapter.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as unknown as Row[];
  const open = rows.filter((r) => r.status === "submitted" || r.status === "approved").reverse();
  const history = rows.filter((r) => r.status === "paid" || r.status === "rejected").slice(0, 50);
  const sum = (s: ReimbursementStatus) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.amount_cents, 0);

  return (
    <div className="space-y-8">
      <Notice tone="info">Reimbursements are paid outside GreekGeek. Marking one paid records the payout for bookkeeping and notifies the member. It does not move money or change dues balances.</Notice>
      <StatGrid>
        <Stat label="Awaiting review" value={<Money cents={sum("submitted")} currency={chapter.currency} />} />
        <Stat label="Approved, unpaid" value={<Money cents={sum("approved")} currency={chapter.currency} />} tone={sum("approved") ? "warning" : undefined} />
        <Stat label="Paid, last 300 requests" value={<Money cents={sum("paid")} currency={chapter.currency} />} />
        <Stat label="Open requests" value={open.length} />
      </StatGrid>

      <Card>
        <CardHeader title="Open requests" description={manage ? "You cannot review your own requests." : "Only officers with finance management can decide."} />
        {open.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing to review">New requests from members appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((r) => (
              <li key={r.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_20rem]">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">
                      <Money cents={r.amount_cents} currency={chapter.currency} />
                    </p>
                    <Badge tone={REIMBURSEMENT_STATUS[r.status].tone}>{REIMBURSEMENT_STATUS[r.status].label}</Badge>
                  </div>
                  <p className="text-sm text-ink-2">{r.description}</p>
                  <p className="text-[12px] text-ink-3">
                    {r.requester ? personName(r.requester) : "Member"} · spent {formatDate(r.spent_on, "UTC")} · requested {formatDate(r.created_at, chapter.timezone)}
                  </p>
                  {r.review_note ? <p className="text-[12px] text-ink-3">Note: {r.review_note}</p> : null}
                </div>
                {manage && r.user_id !== user.id ? (
                  <SimpleForm
                    action={reviewReimbursement.bind(null, slug, r.id)}
                    submitLabel="Save decision"
                    resetOnSuccess={false}
                    fields={
                      r.status === "submitted"
                        ? [
                            {
                              name: "decision",
                              label: "Decision",
                              type: "select",
                              options: [
                                { value: "approved", label: "Approve" },
                                { value: "rejected", label: "Reject" },
                              ],
                            },
                            { name: "note", label: "Note to the member", maxLength: 500, hint: "Required when rejecting" },
                          ]
                        : [
                            { name: "decision", label: "Decision", type: "select", options: [{ value: "paid", label: "Mark as paid" }] },
                            { name: "paid_reference", label: "Payment reference", placeholder: "Check 1042", maxLength: 120 },
                          ]
                    }
                  />
                ) : r.user_id === user.id ? (
                  <p className="text-[13px] text-ink-3">Another officer must review this request.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {history.length ? (
        <Card>
          <CardHeader title="Recent decisions" />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Purchase</Th>
                  <Th>Reference</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.requester ? personName(r.requester) : "Member"}</Td>
                    <Td>{r.description}</Td>
                    <Td>{r.paid_reference ?? r.review_note ?? ""}</Td>
                    <Td align="right">
                      <Money cents={r.amount_cents} currency={chapter.currency} />
                    </Td>
                    <Td align="right">
                      <Badge tone={REIMBURSEMENT_STATUS[r.status].tone}>{REIMBURSEMENT_STATUS[r.status].label}</Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
