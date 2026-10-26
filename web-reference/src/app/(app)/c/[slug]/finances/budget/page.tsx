import { PiggyBank } from "lucide-react";
import { SimpleForm } from "@/components/simple-form";
import { Card, CardBody, CardHeader, EmptyState, Money, Notice, Stat, StatGrid, Table, Td, Th, Tr, cx } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { todayIn } from "@/lib/modules";
import { addBudgetLine, recordExpense } from "./actions";

type Line = { id: string; category: string; planned_cents: number; term_id: string | null };
type Expense = { id: string; description: string; vendor: string | null; amount_cents: number; spent_on: string; budget_line_id: string | null };

export default async function BudgetPage({ params }: PageProps<"/c/[slug]/finances/budget">) {
  const { slug } = await params;
  const { chapter, can } = await requireChapter(slug, "finance.view");
  const manage = can("finance.manage");
  const supabase = await createClient();
  const today = todayIn(chapter.timezone, requestTime());
  const [linesRes, expensesRes, termsRes] = await Promise.all([
    supabase.from("budget_lines").select("id, category, planned_cents, term_id").eq("chapter_id", chapter.id).order("category"),
    supabase.from("expenses").select("id, description, vendor, amount_cents, spent_on, budget_line_id").eq("chapter_id", chapter.id).order("spent_on", { ascending: false }).limit(2000),
    supabase.from("academic_terms").select("id, name, starts_on").eq("chapter_id", chapter.id).order("starts_on", { ascending: false }),
  ]);
  const lines = (linesRes.data ?? []) as Line[];
  const expenses = (expensesRes.data ?? []) as Expense[];
  const terms = termsRes.data ?? [];
  const termName = new Map(terms.map((t) => [t.id, t.name]));
  const spentBy = new Map<string, number>();
  let unbudgeted = 0;
  for (const e of expenses) {
    if (e.budget_line_id) spentBy.set(e.budget_line_id, (spentBy.get(e.budget_line_id) ?? 0) + e.amount_cents);
    else unbudgeted += e.amount_cents;
  }
  const planned = lines.reduce((t, l) => t + l.planned_cents, 0);
  const spent = expenses.reduce((t, e) => t + e.amount_cents, 0);
  const lineName = new Map(lines.map((l) => [l.id, l.category]));

  return (
    <div className="space-y-8">
      <Notice tone="info">The budget tracks chapter spending you record by hand. It is separate from the dues ledger and does not affect member balances.</Notice>
      <StatGrid>
        <Stat label="Planned" value={<Money cents={planned} currency={chapter.currency} />} />
        <Stat label="Spent" value={<Money cents={spent} currency={chapter.currency} />} />
        <Stat label="Remaining" value={<Money cents={planned - spent} currency={chapter.currency} />} tone={planned - spent < 0 ? "danger" : undefined} />
        <Stat label="Unbudgeted spending" value={<Money cents={unbudgeted} currency={chapter.currency} />} tone={unbudgeted ? "warning" : undefined} />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Card>
            <CardHeader title="Budget lines" />
            {lines.length === 0 ? (
              <EmptyState icon={PiggyBank} title="No budget yet">{manage ? "Add budget categories with the form on this page." : "The treasurer has not set up a budget."}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {lines.map((l) => {
                  const used = spentBy.get(l.id) ?? 0;
                  const pct = l.planned_cents ? Math.min(100, Math.round((used / l.planned_cents) * 100)) : used ? 100 : 0;
                  const over = used > l.planned_cents;
                  return (
                    <li key={l.id} className="space-y-2 px-5 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-ink">
                          {l.category}
                          {l.term_id ? <span className="font-normal text-ink-3"> · {termName.get(l.term_id) ?? "Term"}</span> : null}
                        </p>
                        <p className={cx("text-[13px] tnum", over ? "text-danger" : "text-ink-2")}>
                          <Money cents={used} currency={chapter.currency} /> of <Money cents={l.planned_cents} currency={chapter.currency} />
                        </p>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.category} spent`}>
                        <div className={cx("h-full rounded-full", over ? "bg-danger" : "bg-accent")} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Expenses" />
            {expenses.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">No expenses recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Category</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.slice(0, 100).map((e) => (
                      <Tr key={e.id}>
                        <Td>{formatDate(e.spent_on, "UTC")}</Td>
                        <Td>
                          <span className="text-ink">{e.description}</span>
                          {e.vendor ? <span className="text-ink-3"> · {e.vendor}</span> : null}
                        </Td>
                        <Td>{e.budget_line_id ? (lineName.get(e.budget_line_id) ?? "") : <span className="text-ink-3">Unbudgeted</span>}</Td>
                        <Td align="right">
                          <Money cents={e.amount_cents} currency={chapter.currency} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </div>
        {manage ? (
          <div className="space-y-8">
            <Card>
              <CardHeader title="Record an expense" description="Expenses cannot be edited once recorded." />
              <CardBody>
                <SimpleForm
                  action={recordExpense.bind(null, slug)}
                  submitLabel="Record expense"
                  fields={[
                    { name: "description", label: "Description", maxLength: 200 },
                    { name: "amount", label: "Amount", type: "money", span: "half" },
                    { name: "spent_on", label: "Date", type: "date", max: today, defaultValue: today, span: "half" },
                    { name: "vendor", label: "Vendor", maxLength: 120 },
                    { name: "budget_line_id", label: "Category", type: "select", options: [{ value: "", label: "Unbudgeted" }, ...lines.map((l) => ({ value: l.id, label: l.term_id ? `${l.category} · ${termName.get(l.term_id) ?? ""}` : l.category }))] },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Add a budget line" />
              <CardBody>
                <SimpleForm
                  action={addBudgetLine.bind(null, slug)}
                  submitLabel="Add line"
                  fields={[
                    { name: "category", label: "Category", placeholder: "Social events", maxLength: 60 },
                    { name: "planned", label: "Planned amount", type: "money", span: "half" },
                    { name: "term_id", label: "Term", type: "select", options: [{ value: "", label: "Any term" }, ...terms.map((t) => ({ value: t.id, label: t.name }))], span: "half" },
                  ]}
                />
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
