"use client";

import { useMemo, useState } from "react";
import { CreditCard, Download, Lock } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, Money, Notice, Select, Table, Td, Th, Tr, buttonClass, cx } from "@/components/ui";
import { calculatePlatformFee, estimateProcessingFee, type PricingRule } from "@/lib/fees";
import { splitIntoInstallments } from "@/lib/installments";
import { formatCents } from "@/lib/money";
import { LEDGER_ACCOUNT_LABEL, LEDGER_KIND_LABEL } from "@/lib/ledger";
import { AppFrame, MockHeader, SAMPLE_CHAPTER, SubNavMock, TryIt, addDays, mediumDate, useToday } from "./shared";

type Installment = { sequence: number; amount: number; due: string; paid: boolean };
type Charge = { id: string; title: string; total: number; outstanding: number; dueIn: number; allowInstallments: boolean; max: number; plan: Installment[] | null };
type Payment = { id: number; date: string; title: string; method: string; amount: number; receipt: string };
type Checkout = { chargeId: string; amount: number; sequence: number | null };

const START_CHARGES: Charge[] = [
  { id: "fall", title: "Fall dues", total: 45_000, outstanding: 45_000, dueIn: 21, allowInstallments: true, max: 4, plan: null },
  { id: "formal", title: "Formal ticket", total: 8_500, outstanding: 8_500, dueIn: 35, allowInstallments: false, max: 2, plan: null },
];

const START_PAYMENTS: Payment[] = [{ id: 1, date: "-48", title: "Spring dues", method: "Card", amount: 40_000, receipt: "R-2026-000118" }];

export function InstallmentDemo() {
  const today = useToday();
  return <InstallmentScreen key={today} today={today} />;
}

function InstallmentScreen({ today }: { today: string }) {
  const [charges, setCharges] = useState(START_CHARGES);
  const [payments, setPayments] = useState(START_PAYMENTS);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [notice, setNotice] = useState<"success" | "canceled" | null>(null);
  const [openPlan, setOpenPlan] = useState(false);
  const [count, setCount] = useState(2);
  const [first, setFirst] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [created, setCreated] = useState(false);

  const firstDate = first ?? today;
  const open = charges.filter((charge) => charge.outstanding > 0);
  const settled = charges.length - open.length;
  const balance = open.reduce((sum, charge) => sum + charge.outstanding, 0);
  const nextDue = open
    .map((charge) => (charge.plan ? charge.plan.find((item) => !item.paid)?.due ?? null : addDays(today, charge.dueIn)))
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const fall = charges.find((charge) => charge.id === "fall")!;
  const options = Array.from({ length: Math.max(0, fall.max - 1) }, (_, index) => index + 2).filter((n) => fall.outstanding >= 50 * n);
  const preview = useMemo(() => {
    try {
      return splitIntoInstallments(fall.outstanding, count, firstDate);
    } catch {
      return [];
    }
  }, [fall.outstanding, count, firstDate]);

  function reset() {
    setCharges(START_CHARGES);
    setPayments(START_PAYMENTS);
    setCheckout(null);
    setNotice(null);
    setOpenPlan(false);
    setCount(2);
    setFirst(null);
    setConsent(false);
    setConsentError(false);
    setCreated(false);
  }

  function createPlan() {
    if (!consent) {
      setConsentError(true);
      return;
    }
    setCharges((list) => list.map((charge) => (charge.id === "fall" ? { ...charge, plan: preview.map((item) => ({ sequence: item.sequence, amount: item.amountCents, due: item.dueDate, paid: false })) } : charge)));
    setCreated(true);
    setOpenPlan(false);
  }

  function finishCheckout() {
    if (!checkout) return;
    const charge = charges.find((item) => item.id === checkout.chargeId)!;
    setCharges((list) =>
      list.map((item) =>
        item.id === checkout.chargeId
          ? { ...item, outstanding: item.outstanding - checkout.amount, plan: item.plan ? item.plan.map((step) => (step.sequence === checkout.sequence ? { ...step, paid: true } : step)) : null }
          : item,
      ),
    );
    setPayments((list) => [{ id: list.length + 1, date: "0", title: charge.title, method: "Card", amount: checkout.amount, receipt: `R-2026-${String(118 + list.length).padStart(6, "0")}` }, ...list]);
    setCheckout(null);
    setNotice("success");
  }

  return (
    <div>
      <TryIt>Set up an installment plan for fall dues, then pay the first installment. Every button here works like the real one.</TryIt>
      <AppFrame path="/dues" active="dues" onReset={reset}>
        <div className="relative">
          <MockHeader title="My dues" description={`Your balance with ${SAMPLE_CHAPTER.name}. You pay exactly what you owe; no fees are added.`} />
          {notice === "success" ? (
            <Notice tone="positive" title="Payment submitted" className="mb-6">
              Card payments confirm within a minute. Bank payments take 3 to 5 business days to clear; your balance shows them as clearing until then.
            </Notice>
          ) : null}
          {notice === "canceled" ? <Notice tone="info" className="mb-6">Checkout canceled. You were not charged.</Notice> : null}

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Balance", formatCents(balance), true],
              ["Clearing", formatCents(0), true],
              ["Next due", nextDue ? mediumDate(nextDue) : "Nothing due", false],
            ].map(([label, value, numeric]) => (
              <Card key={String(label)}>
                <CardBody>
                  <p className="text-[13px] text-ink-3">{label}</p>
                  <p className={cx("mt-1 text-2xl font-semibold text-ink", Boolean(numeric) && "tnum")}>{value}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          <Card className="mb-6">
            <CardHeader title="Open charges" />
            {open.length === 0 ? (
              <EmptyState icon={CreditCard} title="You are all paid up">New charges from your treasurer will appear here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((charge) => {
                  const next = charge.plan?.find((item) => !item.paid);
                  return (
                    <li key={charge.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                            {charge.title}
                            {charge.plan ? <Badge tone="accent">Installment plan</Badge> : null}
                          </p>
                          <p className="text-[13px] text-ink-3">
                            Due {mediumDate(addDays(today, charge.dueIn))} · {formatCents(charge.total)} total
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Money cents={charge.outstanding} className="text-lg font-semibold" />
                          <Button size="sm" onClick={() => { setNotice(null); setCheckout({ chargeId: charge.id, amount: next ? Math.min(next.amount, charge.outstanding) : charge.outstanding, sequence: next?.sequence ?? null }); }}>
                            {next ? `Pay ${formatCents(Math.min(next.amount, charge.outstanding))}` : "Pay now"}
                          </Button>
                        </div>
                      </div>
                      {charge.plan ? (
                        <div className="mt-3 rounded-md border border-line">
                          {created ? <p className="border-b border-line px-3 py-1.5 text-[13px] text-positive">Installment plan created.</p> : null}
                          <ul className="divide-y divide-line text-[13px]">
                            {charge.plan.map((item) => (
                              <li key={item.sequence} className="flex items-center justify-between px-3 py-1.5">
                                <span className="text-ink-2">Payment {item.sequence} · by {mediumDate(item.due)}</span>
                                <span className="flex items-center gap-2">
                                  {item.paid ? <Badge tone="positive">Paid</Badge> : null}
                                  <Money cents={item.amount} />
                                </span>
                              </li>
                            ))}
                          </ul>
                          <div className="border-t border-line px-3 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (window.confirm("Cancel this installment plan? The full remaining balance will be due on the original date.")) {
                                  setCharges((list) => list.map((item) => (item.id === charge.id ? { ...item, plan: null } : item)));
                                  setCreated(false);
                                  setConsent(false);
                                }
                              }}
                            >
                              Cancel plan
                            </Button>
                          </div>
                        </div>
                      ) : charge.allowInstallments && charge.outstanding >= 100 && options.length > 0 ? (
                        <details open={openPlan} onToggle={(event) => setOpenPlan(event.currentTarget.open)} className="mt-3 rounded-md border border-line px-4 py-3">
                          <summary className="cursor-pointer text-[13px] font-medium text-accent">Pay in installments</summary>
                          <div className="mt-3 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Installments" htmlFor="demo-count">
                                <Select id="demo-count" value={count} onChange={(event) => setCount(Number(event.target.value))}>
                                  {options.map((n) => <option key={n} value={n}>{n} payments</option>)}
                                </Select>
                              </Field>
                              <Field label="First payment" htmlFor="demo-first">
                                <Input id="demo-first" type="date" min={today} value={firstDate} onChange={(event) => setFirst(event.target.value || null)} />
                              </Field>
                            </div>
                            {preview.length > 0 ? (
                              <ul className="divide-y divide-line rounded-md border border-line text-[13px]">
                                {preview.map((item) => (
                                  <li key={item.sequence} className="flex justify-between px-3 py-1.5">
                                    <span className="text-ink-2">Payment {item.sequence} · by {mediumDate(item.dueDate)}</span>
                                    <span className="text-ink tnum">{formatCents(item.amountCents)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            <div>
                              <Checkbox checked={consent} onChange={(event) => { setConsent(event.target.checked); setConsentError(false); }} label="I agree to this schedule. I pay each installment myself when it is due; nothing is charged automatically." />
                              {consentError ? <p className="mt-1 text-[13px] text-danger">Agree to the payment schedule</p> : null}
                            </div>
                            <Button variant="secondary" size="sm" onClick={createPlan}>Set up plan</Button>
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
                {payments.map((payment) => (
                  <Tr key={payment.id}>
                    <Td className="whitespace-nowrap text-ink-2">{mediumDate(addDays(today, Number(payment.date)))}</Td>
                    <Td>{payment.title}</Td>
                    <Td className="text-ink-2">{payment.method}</Td>
                    <Td><Badge tone="positive">Paid</Badge></Td>
                    <Td align="right"><Money cents={payment.amount} /></Td>
                    <Td align="right"><span className="text-accent">{payment.receipt}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {settled > 0 ? <p className="mt-4 text-[13px] text-ink-3">{settled} settled or voided charge{settled === 1 ? "" : "s"} not shown.</p> : null}

          {checkout ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16">
              <div className="dialog-in w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-xl shadow-black/60" role="dialog" aria-label="Simulated checkout">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3"><Lock className="size-3.5" aria-hidden />Stripe Checkout, simulated for this demo</p>
                <p className="mt-3 text-sm text-ink-2">{charges.find((item) => item.id === checkout.chargeId)?.title} · {SAMPLE_CHAPTER.name}</p>
                <p className="mt-1 text-2xl font-semibold text-ink tnum">{formatCents(checkout.amount)}</p>
                <p className="mt-3 text-[13px] text-ink-3">In the app this is Stripe&apos;s hosted checkout, where members enter a card or bank account. GreekGeek never sees card numbers.</p>
                <div className="mt-5 flex gap-2">
                  <Button className="flex-1" onClick={finishCheckout}>Pay {formatCents(checkout.amount)}</Button>
                  <Button variant="secondary" onClick={() => { setCheckout(null); setNotice("canceled"); }}>Cancel</Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </AppFrame>
    </div>
  );
}

type Line = { account: keyof typeof LEDGER_ACCOUNT_LABEL; cents: number };
type Txn = { id: number; kind: keyof typeof LEDGER_KIND_LABEL; description: string; daysAgo: number; fresh?: boolean; lines: Line[] };

const MEMBER = "Sam Patel";

const START_TXNS: Txn[] = [
  { id: 1, kind: "assessment", description: `Fall dues · ${MEMBER}`, daysAgo: 9, lines: [{ account: "member_receivable", cents: 45_000 }, { account: "dues_revenue", cents: -45_000 }] },
];

export function LedgerDemo({ rule }: { rule: PricingRule }) {
  const today = useToday();
  return <LedgerScreen key={today} today={today} rule={rule} />;
}

function LedgerScreen({ today, rule }: { today: string; rule: PricingRule }) {
  const [txns, setTxns] = useState<Txn[]>(START_TXNS);
  const owed = txns.flatMap((txn) => txn.lines).filter((line) => line.account === "member_receivable").reduce((sum, line) => sum + line.cents, 0);
  const balances = new Map<string, number>();
  for (const line of txns.flatMap((txn) => txn.lines)) balances.set(line.account, (balances.get(line.account) ?? 0) + line.cents);
  const sum = [...balances.values()].reduce((total, value) => total + value, 0);

  function post(...entries: Array<Omit<Txn, "id" | "daysAgo">>) {
    setTxns((list) => {
      let next = list.length;
      return [...entries.map((entry) => ({ ...entry, id: (next += 1), daysAgo: 0, fresh: true })).reverse(), ...list.map((txn) => ({ ...txn, fresh: false }))];
    });
  }

  function payOnline(amount: number) {
    const platform = calculatePlatformFee(amount, rule);
    const processing = estimateProcessingFee(amount, "card");
    post(
      { kind: "payment", description: `Fall dues · ${MEMBER}`, lines: [{ account: "stripe_balance", cents: amount }, { account: "member_receivable", cents: -amount }] },
      ...(platform > 0 ? [{ kind: "platform_fee" as const, description: `Fall dues · ${MEMBER}`, lines: [{ account: "platform_fees" as const, cents: platform }, { account: "stripe_balance" as const, cents: -platform }] }] : []),
      { kind: "processing_fee", description: `Fall dues · ${MEMBER}`, lines: [{ account: "processing_fees", cents: processing }, { account: "stripe_balance", cents: -processing }] },
    );
  }

  const actions: Array<{ label: string; run: () => void; disabled?: boolean }> = [
    { label: `${MEMBER.split(" ")[0]} pays $200 by card`, run: () => payOnline(20_000), disabled: owed < 20_000 },
    { label: "Treasurer records $150 cash", run: () => post({ kind: "offline_payment", description: `Paid at chapter meeting · ${MEMBER}`, lines: [{ account: "cash_on_hand", cents: 15_000 }, { account: "member_receivable", cents: -15_000 }] }), disabled: owed < 15_000 },
    { label: "Treasurer applies a $25 credit", run: () => post({ kind: "credit", description: `Rush week volunteer · ${MEMBER}`, lines: [{ account: "member_receivable", cents: -2_500 }, { account: "credits_issued", cents: 2_500 }] }), disabled: owed < 2_500 },
    { label: "Dues go past due ($35 late fee)", run: () => post({ kind: "late_fee", description: `Late fee: Fall dues · ${MEMBER}`, lines: [{ account: "member_receivable", cents: 3_500 }, { account: "dues_revenue", cents: -3_500 }] }) },
  ];

  return (
    <div>
      <TryIt>
        Each button does what happens elsewhere in the app: a member paying, or a treasurer recording cash or a credit. Watch the journal write the entries. {MEMBER} owes <span className="font-medium text-ink tnum">{formatCents(owed)}</span>.
      </TryIt>
      <div className="mb-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.label} variant="secondary" size="sm" onClick={action.run} disabled={action.disabled}>{action.label}</Button>
        ))}
      </div>
      <AppFrame path="/finances/ledger" active="finances" onReset={() => setTxns(START_TXNS)}>
        <MockHeader title="Finances" description="Dues, payments, and the chapter ledger. Every number here comes from the double-entry ledger." />
        <SubNavMock items={["Overview", "Assessments", "Member balances", "Payments", "Reimbursements", "Budget", "Ledger", "Reports"]} active="Ledger" />
        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          <Card className="min-w-0">
            <CardHeader
              title="Journal"
              description="Append-only. Corrections are new entries, never edits."
              actions={<span className={buttonClass("secondary", "sm")}><Download className="size-3.5" aria-hidden />Export CSV</span>}
            />
            <div className="max-h-[26rem] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Transaction</Th>
                    <Th>Account</Th>
                    <Th align="right">Debit</Th>
                    <Th align="right">Credit</Th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((txn) =>
                    txn.lines.map((line, index) => (
                      <Tr key={`${txn.id}-${index}`} className={cx(index === 0 && "[&>td]:border-t [&>td]:border-line-strong/40", txn.fresh && "fade-up")}>
                        <Td className="whitespace-nowrap text-ink-2">{index === 0 ? mediumDate(addDays(today, -txn.daysAgo)) : ""}</Td>
                        <Td>
                          {index === 0 ? (
                            <>
                              <span className="font-medium">{LEDGER_KIND_LABEL[txn.kind]}</span>
                              <span className="block text-[12px] text-ink-3">{txn.description}</span>
                            </>
                          ) : null}
                        </Td>
                        <Td className="text-ink-2">{LEDGER_ACCOUNT_LABEL[line.account]}</Td>
                        <Td align="right">{line.cents > 0 ? <Money cents={line.cents} /> : ""}</Td>
                        <Td align="right">{line.cents < 0 ? <Money cents={-line.cents} /> : ""}</Td>
                      </Tr>
                    )),
                  )}
                </tbody>
              </Table>
            </div>
          </Card>
          <Card className="self-start">
            <CardHeader title="Account balances" description={sum === 0 ? "Debits equal credits." : "Ledger is out of balance. Contact support."} />
            <ul className="divide-y divide-line text-sm">
              {Object.keys(LEDGER_ACCOUNT_LABEL).map((key) => (
                <li key={key} className="flex justify-between px-5 py-2">
                  <span className="text-ink-2">{LEDGER_ACCOUNT_LABEL[key]}</span>
                  <Money cents={balances.get(key) ?? 0} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </AppFrame>
    </div>
  );
}
