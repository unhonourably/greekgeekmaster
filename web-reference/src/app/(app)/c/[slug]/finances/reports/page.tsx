import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Card, CardBody, CardHeader, Money, Table, Td, Th, Tr, buttonClass } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

type MonthRow = { month: string; online_cents: number; offline_cents: number; platform_fee_cents: number; processing_fee_cents: number; refunds_cents: number; payments_count: number };

export default async function ReportsPage({ params }: PageProps<"/c/[slug]/finances/reports">) {
  const { slug } = await params;
  const { chapter } = await requireChapter(slug, "finance.view");
  const supabase = await createClient();
  const [{ data: months }, { data: invoices }] = await Promise.all([
    supabase.rpc("chapter_monthly_collections", { p_chapter: chapter.id, p_months: 12 }),
    supabase.from("saas_invoices").select("amount_paid_cents, paid_at").eq("chapter_id", chapter.id).eq("status", "paid"),
  ]);
  const subByMonth = new Map<string, number>();
  for (const i of invoices ?? []) {
    if (!i.paid_at) continue;
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: chapter.timezone, year: "numeric", month: "2-digit" }).format(new Date(i.paid_at));
    subByMonth.set(key, (subByMonth.get(key) ?? 0) + Number(i.amount_paid_cents));
  }
  const rows = ((months ?? []) as MonthRow[]).slice().reverse();
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const exports = [
    { type: "payments", title: "Payments", body: "Every payment with fees, refunds, net amount, and receipt number." },
    { type: "ledger", title: "Ledger", body: "Every journal entry with debit and credit columns, for your accountant." },
    { type: "balances", title: "Member balances", body: "Current balance, clearing, and overdue amounts for each member." },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Monthly collections" description="Last 12 months, in the chapter's time zone." />
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Payments</Th>
              <Th align="right">Online</Th>
              <Th align="right">Offline</Th>
              <Th align="right">Refunds</Th>
              <Th align="right">Platform fees</Th>
              <Th align="right">Stripe fees</Th>
              <Th align="right">Subscription</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = r.month.slice(0, 7);
              return (
                <Tr key={r.month}>
                  <Td>{monthFmt.format(new Date(`${r.month}T00:00:00Z`))}</Td>
                  <Td align="right">{r.payments_count}</Td>
                  <Td align="right"><Money cents={Number(r.online_cents)} /></Td>
                  <Td align="right"><Money cents={Number(r.offline_cents)} /></Td>
                  <Td align="right"><Money cents={Number(r.refunds_cents)} /></Td>
                  <Td align="right"><Money cents={Number(r.platform_fee_cents)} /></Td>
                  <Td align="right"><Money cents={Number(r.processing_fee_cents)} /></Td>
                  <Td align="right"><Money cents={subByMonth.get(key) ?? 0} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {exports.map((e) => (
          <Card key={e.type}>
            <CardBody className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">{e.title}</h3>
              <p className="text-[13px] text-ink-2">{e.body}</p>
              <a href={`/c/${chapter.slug}/finances/export?type=${e.type}`} className={buttonClass("secondary", "sm", "mt-2")}>
                <Download className="size-3.5" aria-hidden />
                Download CSV
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
