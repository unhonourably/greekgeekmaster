import { Receipt } from "lucide-react";
import { SimpleForm } from "@/components/simple-form";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Money, PageHeader, Table, Td, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { todayIn } from "@/lib/modules";
import { REIMBURSEMENT_STATUS, type ReimbursementStatus } from "./labels";
import { requestReimbursement } from "./actions";

export default async function ReimbursementsPage({ params }: PageProps<"/c/[slug]/reimbursements">) {
  const { slug } = await params;
  const { chapter, user, can } = await requireChapter(slug);
  const supabase = await createClient();
  const today = todayIn(chapter.timezone, requestTime());
  const { data } = await supabase
    .from("reimbursement_requests")
    .select("id, description, amount_cents, spent_on, status, review_note, paid_reference, paid_at")
    .eq("chapter_id", chapter.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Array<{ id: string; description: string; amount_cents: number; spent_on: string; status: ReimbursementStatus; review_note: string | null; paid_reference: string | null; paid_at: string | null }>;

  return (
    <>
      <PageHeader
        title="Reimbursements"
        description="Ask the treasurer to pay you back for chapter purchases. Payouts happen outside Chapter, by check or transfer."
        actions={can("finance.view") ? <ButtonLink href={`/c/${slug}/finances/reimbursements`} variant="secondary">Review requests</ButtonLink> : null}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title="My requests" />
          {rows.length === 0 ? (
            <EmptyState icon={Receipt} title="No requests yet">Submit a request with the form on this page. Keep your receipt in case the treasurer asks for it.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Purchase</Th>
                    <Th>Date</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <p className="text-ink">{r.description}</p>
                        {r.review_note ? <p className="text-[12px] text-ink-3">Treasurer: {r.review_note}</p> : null}
                        {r.status === "paid" && r.paid_reference ? <p className="text-[12px] text-ink-3">Paid {r.paid_at ? formatDate(r.paid_at, chapter.timezone) : ""} · {r.paid_reference}</p> : null}
                      </Td>
                      <Td>{formatDate(r.spent_on, "UTC")}</Td>
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
          )}
        </Card>
        <Card>
          <CardHeader title="New request" />
          <CardBody>
            <SimpleForm
              action={requestReimbursement.bind(null, slug)}
              submitLabel="Submit request"
              fields={[
                { name: "description", label: "What did you buy?", placeholder: "Supplies for philanthropy table", maxLength: 500 },
                { name: "amount", label: "Amount", type: "money", span: "half" },
                { name: "spent_on", label: "Purchase date", type: "date", max: today, defaultValue: today, span: "half" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
