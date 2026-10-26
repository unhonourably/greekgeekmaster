import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, Money, Notice, PageHeader, Stat, StatGrid, Table, Td, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { LEDGER_KIND_LABEL } from "@/lib/ledger";
import { chargeMember, issueCredit, recordOfflinePayment, voidMemberAssessment } from "../../actions";
import { AddChargeForm, CreditForm, OfflinePaymentForm, VoidForm } from "../../finance-forms";

export const metadata: Metadata = { title: "Member account" };


export default async function MemberAccount({ params }: PageProps<"/c/[slug]/finances/members/[membershipId]">) {
  const { slug, membershipId } = await params;
  const { chapter, can, user } = await requireChapter(slug, "finance.view");
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("memberships")
    .select("id, user_id, member_class, status, joined_at, user:profiles!memberships_user_id_fkey(full_name, display_name)")
    .eq("id", membershipId)
    .eq("chapter_id", chapter.id)
    .maybeSingle();
  if (!m) notFound();
  const [{ data: balance }, { data: charges }, { data: entries }, { data: plans }, { data: sent }, { data: billed }] = await Promise.all([
    supabase.rpc("member_balance", { p_membership: m.id }),
    supabase.from("member_assessment_balances").select("id, title, amount_cents, outstanding_cents, processing_cents, status, due_date").eq("membership_id", m.id).order("due_date", { ascending: false }),
    supabase
      .from("ledger_entries")
      .select("id, amount_cents, created_at, txn:ledger_transactions(kind, description, occurred_at, payment_id)")
      .eq("membership_id", m.id)
      .eq("account", "member_receivable")
      .order("id", { ascending: true })
      .limit(500),
    supabase.from("installment_plans").select("id, status, total_cents, member_assessment_id, installments(sequence, amount_cents, due_date, status)").eq("chapter_id", chapter.id).eq("status", "active"),
    supabase.from("dues_assessments").select("id, title, default_amount_cents, due_date, status, issued_at").eq("chapter_id", chapter.id).in("status", ["issued", "closed"]).order("issued_at", { ascending: false }).limit(100),
    supabase.from("member_assessments").select("assessment_id").eq("membership_id", m.id),
  ]);
  const profile = m.user as unknown as { full_name: string; display_name: string } | null;
  const name = profile?.full_name || profile?.display_name || "Member";
  const bal = balance as { balance_cents: number; processing_cents: number; next_due_date: string | null } | null;
  const open = (charges ?? []).filter((c) => c.status !== "voided" && Number(c.outstanding_cents) > 0);
  const chargeOptions = open.map((c) => ({ id: c.id, label: c.title, outstanding: Number(c.outstanding_cents) }));
  const isSelf = m.user_id === user.id;
  const chargeIds = new Set((charges ?? []).map((c) => c.id));
  const memberPlans = (plans ?? []).filter((p) => chargeIds.has(p.member_assessment_id));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: chapter.timezone }).format(new Date());
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: chapter.timezone });
  const dueFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
  const billedIds = new Set((billed ?? []).map((b) => b.assessment_id));
  const joined = m.joined_at ? new Date(m.joined_at).getTime() : 0;
  const unbilled = (sent ?? [])
    .filter((a) => !billedIds.has(a.id))
    .map((a) => ({
      id: a.id,
      title: a.title,
      amount: Number(a.default_amount_cents),
      dueDate: a.due_date,
      status: a.status,
      sentAfterJoin: a.issued_at ? new Date(a.issued_at).getTime() >= joined : true,
    }))
    .sort((a, b) => Number(a.sentAfterJoin) - Number(b.sentAfterJoin));
  const missedBeforeJoin = unbilled.filter((a) => !a.sentAfterJoin);
  const defaultDue = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  const canCharge = can("finance.manage") && (m.status === "active" || m.status === "inactive");
  const statement = ((entries ?? []) as unknown as Array<{ id: number; amount_cents: number; created_at: string; txn: { kind: string; description: string; occurred_at: string; payment_id: string | null } | null }>).reduce<
    Array<{ id: number; amount_cents: number; created_at: string; txn: { kind: string; description: string; occurred_at: string; payment_id: string | null } | null; running: number }>
  >((acc, e) => [...acc, { ...e, running: (acc.at(-1)?.running ?? 0) + Number(e.amount_cents) }], []);

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/c/${chapter.slug}/finances/members`} className="hover:text-ink">Member balances</Link>}
        title={name}
        description={MEMBER_CLASS_LABEL[m.member_class as MemberClass]}
      />
      <StatGrid className="mb-6 lg:grid-cols-3">
        <Stat label="Balance" value={<Money cents={Number(bal?.balance_cents ?? 0)} />} tone={Number(bal?.balance_cents ?? 0) > 0 ? "warning" : undefined} />
        <Stat label="Clearing" value={<Money cents={Number(bal?.processing_cents ?? 0)} />} />
        <Stat label="Next due" value={bal?.next_due_date ? dueFmt.format(new Date(bal.next_due_date)) : "Nothing due"} />
      </StatGrid>
      {canCharge && missedBeforeJoin.length > 0 ? (
        <Notice tone="warning" title={`Joined after ${missedBeforeJoin.length === 1 ? "a charge" : `${missedBeforeJoin.length} charges`} went out`} className="mb-6">
          {missedBeforeJoin.slice(0, 3).map((a) => a.title).join(", ")}
          {missedBeforeJoin.length > 3 ? ` and ${missedBeforeJoin.length - 3} more` : ""}. Use Add a charge to bill them, prorated if you like.
        </Notice>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Charges" />
            <Table>
              <thead>
                <tr>
                  <Th>Charge</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Outstanding</Th>
                </tr>
              </thead>
              <tbody>
                {(charges ?? []).map((c) => (
                  <Tr key={c.id}>
                    <Td>{c.title}</Td>
                    <Td className="text-ink-2">{dueFmt.format(new Date(c.due_date))}</Td>
                    <Td><Badge tone={c.status === "paid" ? "positive" : c.status === "voided" ? "neutral" : c.status === "partially_paid" ? "info" : "warning"}>{c.status.replace("_", " ")}</Badge></Td>
                    <Td align="right"><Money cents={Number(c.amount_cents)} /></Td>
                    <Td align="right"><Money cents={Math.max(0, Number(c.outstanding_cents))} /></Td>
                  </Tr>
                ))}
                {(charges ?? []).length === 0 ? (
                  <tr><Td colSpan={5} className="text-center text-ink-3">No charges.</Td></tr>
                ) : null}
              </tbody>
            </Table>
          </Card>
          {memberPlans.length > 0 ? (
            <Card>
              <CardHeader title="Installment plans" />
              <CardBody className="space-y-3">
                {memberPlans.map((p) => (
                  <ul key={p.id} className="divide-y divide-line rounded-md border border-line text-sm">
                    {((p.installments ?? []) as Array<{ sequence: number; amount_cents: number; due_date: string; status: string }>)
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((i) => (
                        <li key={i.sequence} className="flex items-center justify-between px-3 py-2">
                          <span>Installment {i.sequence} · due {dueFmt.format(new Date(i.due_date))}</span>
                          <span className="flex items-center gap-2"><Badge tone={i.status === "paid" ? "positive" : "neutral"}>{i.status}</Badge><Money cents={Number(i.amount_cents)} /></span>
                        </li>
                      ))}
                  </ul>
                ))}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Statement" description="Every ledger entry affecting this member's balance." />
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Entry</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {statement.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-ink-2">{fmt.format(new Date(e.txn?.occurred_at ?? e.created_at))}</Td>
                    <Td>
                      <span className="text-ink">{LEDGER_KIND_LABEL[e.txn?.kind ?? ""] ?? e.txn?.kind}</span>
                      <span className="block text-[12px] text-ink-3">{e.txn?.description}</span>
                    </Td>
                    <Td align="right"><Money cents={Number(e.amount_cents)} signed /></Td>
                    <Td align="right"><Money cents={e.running} /></Td>
                  </Tr>
                ))}
                {statement.length === 0 ? <tr><Td colSpan={4} className="text-center text-ink-3">No entries.</Td></tr> : null}
              </tbody>
            </Table>
          </Card>
        </div>
        {can("finance.manage") ? (
          <div className="space-y-6">
            {canCharge ? (
              <Card>
                <CardHeader title="Add a charge" description="Bill this member for an assessment that already went out." />
                <CardBody>
                  <AddChargeForm action={chargeMember.bind(null, chapter.slug, m.id)} options={unbilled} today={today} defaultDue={defaultDue} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Record offline payment" description="Cash, check, or another app." />
              <CardBody>
                {isSelf ? <p className="text-sm text-ink-3">Another officer must record your own payments.</p> : <OfflinePaymentForm action={recordOfflinePayment.bind(null, chapter.slug)} charges={chargeOptions} today={today} requestKey={randomUUID()} />}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Apply credit" />
              <CardBody>
                <CreditForm action={issueCredit.bind(null, chapter.slug)} charges={chargeOptions} requestKey={randomUUID()} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Void charge" />
              <CardBody>
                <VoidForm action={voidMemberAssessment.bind(null, chapter.slug)} charges={chargeOptions} />
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
