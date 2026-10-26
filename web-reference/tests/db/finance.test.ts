import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import {
  accountTotal,
  addMember,
  createAssessment,
  createVerifiedChapter,
  enablePayments,
  memberBalance,
  startPayment,
  succeedPayment,
  unbalancedTransactions,
  type ChapterFixture,
} from "../support/fixtures";
import { splitIntoInstallments } from "@/lib/installments";

type Member = { userId: string; membershipId: string; email: string };

const chapterToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

async function paidMember(db: Db, chapter: ChapterFixture, amount = 45_000) {
  const member = await addMember(db, chapter);
  const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], amount);
  const ma = memberAssessmentIds[member.membershipId];
  const payment = await startPayment(db, member.userId, ma);
  await succeedPayment(db, payment);
  const charge = `ch_${payment.id.replace(/-/g, "").slice(0, 16)}`;
  return { member, ma, payment, charge };
}

describe("finance lifecycle", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let account: string;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    account = await enablePayments(db, chapter);
  });

  it("claims each Stripe event once and allows retry after failure", async () => {
    const claim = () => db.rpc<boolean>("service_role", null, "service_claim_stripe_event", {
      p_id: "evt_claim_1", p_type: "checkout.session.completed", p_account: account, p_livemode: false, p_api_version: "2026-09-30.endive", p_created: new Date().toISOString(),
    });
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    await db.rpc("service_role", null, "service_complete_stripe_event", { p_id: "evt_claim_1", p_status: "failed", p_error: "transient" });
    expect(await claim()).toBe(true);
    await db.rpc("service_role", null, "service_complete_stripe_event", { p_id: "evt_claim_1", p_status: "processed", p_error: null });
    expect(await claim()).toBe(false);
  });

  it("handles out-of-order failure and success events without double posting", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 20_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    await db.rpc("service_role", null, "service_mark_payment_processing", { p_payment: payment.id, p_payment_intent: "pi_ooo", p_method: "us_bank_account" });
    const processing = await db.asUser(member.userId, (tx) => tx.query<{ b: { processing_cents: number } }>("select public.member_balance($1) as b", [member.membershipId]));
    expect(processing.rows[0].b.processing_cents).toBe(20_000);
    await db.rpc("service_role", null, "service_record_payment_failed", { p_payment: payment.id, p_payment_intent: "pi_ooo", p_code: "insufficient_funds", p_message: "Insufficient funds" });
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(20_000);
    await succeedPayment(db, payment, { processing: 160 });
    await db.rpc("service_role", null, "service_record_payment_failed", { p_payment: payment.id, p_payment_intent: "pi_ooo", p_code: "late", p_message: "late failure" });
    const p = await db.pg.query<{ status: string; reconciliation_note: string }>("select status::text, reconciliation_note from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("succeeded");
    expect(p.rows[0].reconciliation_note).toContain("after being marked failed");
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(0);
    const n = await db.pg.query<{ n: number }>("select count(*)::int as n from public.ledger_transactions where payment_id = $1 and kind = 'payment'", [payment.id]);
    expect(n.rows[0].n).toBe(1);
  });

  it("records the processing fee once when the balance transaction arrives later", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 10_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    await succeedPayment(db, payment, { processing: null });
    await db.rpc("service_role", null, "service_record_processing_fee", { p_payment: payment.id, p_processing_fee: 320, p_balance_transaction: "txn_late" });
    await db.rpc("service_role", null, "service_record_processing_fee", { p_payment: payment.id, p_processing_fee: 320, p_balance_transaction: "txn_late" });
    const r = await db.pg.query<{ processing_fee_cents: string; net_cents: string }>("select processing_fee_cents::text, net_cents::text from public.payments where id = $1", [payment.id]);
    expect(r.rows[0]).toEqual({ processing_fee_cents: "320", net_cents: String(10_000 - 150 - 320) });
    const fees = await db.pg.query<{ n: number }>("select count(*)::int as n from public.ledger_transactions where payment_id = $1 and kind = 'processing_fee'", [payment.id]);
    expect(fees.rows[0].n).toBe(1);
  });

  it("refunds through the platform, returns the proportional fee once, and reopens the balance", async () => {
    const { member, payment, charge } = await paidMember(db, chapter);
    const officer = await addMember(db, chapter, "Finance Officer", ["treasurer"]);
    await expectDenied(db.rpc("authenticated", member.userId, "request_refund", { p_payment: payment.id, p_amount: 1_000, p_reason: "Self" }), /not authorized/);
    await expectDenied(db.rpc("authenticated", officer.userId, "request_refund", { p_payment: payment.id, p_amount: 45_001, p_reason: "Too much" }), /exceeds/);
    const refund = await db.asUser(officer.userId, async (tx) =>
      (await tx.query<{ id: string; expected_fee_refund_cents: string }>("select id, expected_fee_refund_cents::text from public.request_refund($1, 15000, 'Overpaid for formal')", [payment.id])).rows[0],
    );
    expect(refund.expected_fee_refund_cents).toBe("225");
    const sync = () => db.rpc("service_role", null, "service_sync_refund", {
      p_refund: refund.id, p_stripe_refund: "re_partial_1", p_charge: charge, p_amount: 15_000, p_status: "succeeded", p_failure_reason: null, p_event: "evt_refund_1",
    });
    await sync();
    await sync();
    const feeRefund = () => db.rpc("service_role", null, "service_record_application_fee_refund", { p_fee_refund: "fr_1", p_charge: charge, p_amount: 225 });
    await feeRefund();
    await feeRefund();
    const p = await db.pg.query<{ status: string; refunded_cents: string; application_fee_refunded_cents: string }>(
      "select status::text, refunded_cents::text, application_fee_refunded_cents::text from public.payments where id = $1",
      [payment.id],
    );
    expect(p.rows[0]).toEqual({ status: "partially_refunded", refunded_cents: "15000", application_fee_refunded_cents: "225" });
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(15_000);
    const refundTxns = await db.pg.query<{ n: number }>("select count(*)::int as n from public.ledger_transactions where refund_id = $1", [refund.id]);
    expect(refundTxns.rows[0].n).toBe(1);
    expect(await unbalancedTransactions(db)).toBe(0);
  });

  it("imports refunds issued in the Stripe Dashboard", async () => {
    const { member, payment, charge } = await paidMember(db, chapter, 30_000);
    await db.rpc("service_role", null, "service_sync_refund", {
      p_refund: null, p_stripe_refund: "re_dash_1", p_charge: charge, p_amount: 30_000, p_status: "succeeded", p_failure_reason: null, p_event: "evt_dash_1",
    });
    const r = await db.pg.query<{ origin: string; status: string }>("select origin, status from public.refunds where stripe_refund_id = 're_dash_1'");
    expect(r.rows[0]).toEqual({ origin: "stripe_dashboard", status: "succeeded" });
    const p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("refunded");
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(30_000);
  });

  it("tracks a lost dispute with fee and restores the member's balance", async () => {
    const { member, payment, charge } = await paidMember(db, chapter);
    const sync = (status: string, bts: unknown[]) => db.rpc("service_role", null, "service_sync_dispute", {
      p_dispute: "dp_lost_1", p_charge: charge, p_amount: 45_000, p_status: status, p_reason: "fraudulent", p_evidence_due: "2026-11-15T00:00:00Z", p_balance_transactions: bts,
    });
    const withdrawal = [{ id: "txn_dp_1", amount: -45_000, fee: 1_500 }];
    await sync("needs_response", withdrawal);
    await sync("needs_response", withdrawal);
    let p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("disputed");
    expect(await accountTotal(db, chapter.chapterId, "disputed_funds")).toBe(45_000);
    await sync("lost", withdrawal);
    await sync("lost", withdrawal);
    p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("dispute_lost");
    expect(await accountTotal(db, chapter.chapterId, "disputed_funds")).toBe(0);
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(45_000);
    const d = await db.pg.query<{ fee_cents: string; outcome: string }>("select fee_cents::text, outcome from public.disputes where stripe_dispute_id = 'dp_lost_1'");
    expect(d.rows[0]).toEqual({ fee_cents: "1500", outcome: "lost" });
    expect(await unbalancedTransactions(db)).toBe(0);
  });

  it("reinstates funds when a dispute is won", async () => {
    const { member, payment, charge } = await paidMember(db, chapter, 25_000);
    const sync = (status: string, bts: unknown[]) => db.rpc("service_role", null, "service_sync_dispute", {
      p_dispute: "dp_won_1", p_charge: charge, p_amount: 25_000, p_status: status, p_reason: "product_not_received", p_evidence_due: null, p_balance_transactions: bts,
    });
    await sync("needs_response", [{ id: "txn_dw_1", amount: -25_000, fee: 1_500 }]);
    await sync("won", [{ id: "txn_dw_1", amount: -25_000, fee: 1_500 }, { id: "txn_dw_2", amount: 25_000, fee: -1_500 }]);
    const p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("succeeded");
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(0);
    expect(await unbalancedTransactions(db)).toBe(0);
  });

  it("records offline payments without a platform fee and dedupes by request key", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 45_000);
    const ma = memberAssessmentIds[member.membershipId];
    const record = () => db.rpc<string>("authenticated", chapter.ownerId, "record_offline_payment", {
      p_member_assessment: ma, p_amount: 20_000, p_method: "check", p_reference: "Check 1042", p_received_on: chapterToday(), p_memo: null, p_request_key: "offline-req-1",
    });
    const first = await record();
    const second = await record();
    expect(second).toBe(first);
    const p = await db.pg.query<{ platform_fee_cents: string; kind: string }>("select platform_fee_cents::text, kind from public.payments where id = $1", [first]);
    expect(p.rows[0]).toEqual({ platform_fee_cents: "0", kind: "offline" });
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(25_000);
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "record_offline_payment", {
      p_member_assessment: ma, p_amount: 30_000, p_method: "cash", p_reference: null, p_received_on: chapterToday(), p_memo: null, p_request_key: "offline-req-2",
    }), /outstanding/);
  });

  it("issues credits, voids remaining balances, and blocks self-credit", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId, chapter.ownerMembershipId], 10_000);
    await db.rpc("authenticated", chapter.ownerId, "issue_member_credit", { p_member_assessment: memberAssessmentIds[member.membershipId], p_amount: 4_000, p_reason: "Scholarship", p_request_key: "cr-1" });
    await db.rpc("authenticated", chapter.ownerId, "issue_member_credit", { p_member_assessment: memberAssessmentIds[member.membershipId], p_amount: 4_000, p_reason: "Scholarship", p_request_key: "cr-1" });
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(6_000);
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "issue_member_credit", { p_member_assessment: memberAssessmentIds[chapter.ownerMembershipId], p_amount: 1_000, p_reason: "Me", p_request_key: "cr-2" }), /your own/);
    await db.rpc("authenticated", chapter.ownerId, "void_member_assessment", { p_member_assessment: memberAssessmentIds[member.membershipId], p_reason: "Charged in error" });
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(0);
  });

  it("lets a member set up an installment plan that sums exactly and pay one installment", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 45_001);
    const ma = memberAssessmentIds[member.membershipId];
    const schedule = splitIntoInstallments(45_001, 3, "2026-11-01").map((i) => ({ amount_cents: i.amountCents, due_date: i.dueDate }));
    await expectDenied(db.rpc("authenticated", member.userId, "create_installment_plan", { p_member_assessment: ma, p_schedule: [...schedule.slice(0, 2), { ...schedule[2], amount_cents: 15_000 }], p_consent_text: "I agree" }), /add up/);
    const plan = await db.rpc<string>("authenticated", member.userId, "create_installment_plan", { p_member_assessment: ma, p_schedule: schedule, p_consent_text: "I agree to pay on these dates." });
    const first = await db.pg.query<{ id: string }>("select id from public.installments where plan_id = $1 and sequence = 1", [plan]);
    const payment = await db.asUser(member.userId, async (tx) =>
      (await tx.query<{ id: string; amount_cents: number; platform_fee_cents: number; stripe_account_id: string }>(
        "select id, amount_cents::int, platform_fee_cents::int, stripe_account_id from public.create_pending_payment($1, $2, null)",
        [ma, first.rows[0].id],
      )).rows[0],
    );
    expect(payment.amount_cents).toBe(15_000);
    expect(payment.platform_fee_cents).toBe(225);
    await succeedPayment(db, payment, { processing: 465 });
    const inst = await db.pg.query<{ status: string }>("select status from public.installments where plan_id = $1 order by sequence", [plan]);
    expect(inst.rows.map((r) => r.status)).toEqual(["paid", "scheduled", "scheduled"]);
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(30_001);
  });

  it("supersedes stale pending checkouts so only one can be in flight", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 9_000);
    const ma = memberAssessmentIds[member.membershipId];
    const first = await startPayment(db, member.userId, ma);
    const second = await startPayment(db, member.userId, ma);
    const rows = await db.pg.query<{ id: string; status: string }>("select id, status::text from public.payments where member_assessment_id = $1 order by created_at", [ma]);
    expect(rows.rows).toEqual([{ id: first.id, status: "canceled" }, { id: second.id, status: "pending" }]);
    await succeedPayment(db, first);
    await expectDenied(startPayment(db, member.userId, ma), /nothing is due|already processing/);
  });

  it("posts payouts once and reverses them if the payout fails", async () => {
    const sync = (status: string) => db.rpc("service_role", null, "service_sync_payout", {
      p_account: account, p_payout: "po_1", p_amount: 10_000, p_currency: "usd", p_status: status, p_arrival: "2026-11-02", p_failure_code: status === "failed" ? "account_closed" : null, p_livemode: false,
    });
    const before = await accountTotal(db, chapter.chapterId, "stripe_balance");
    await sync("paid");
    await sync("paid");
    expect(await accountTotal(db, chapter.chapterId, "bank_deposits")).toBe(10_000);
    await sync("failed");
    expect(await accountTotal(db, chapter.chapterId, "bank_deposits")).toBe(0);
    expect(await accountTotal(db, chapter.chapterId, "stripe_balance")).toBe(before);
  });

  it("keeps every ledger transaction balanced and rejects unbalanced postings", async () => {
    expect(await unbalancedTransactions(db)).toBe(0);
    await expectDenied(
      db.pg.transaction(async (tx) => {
        await tx.query("select private.post_ledger($1, 'credit', 'bad', 'bad-1', $2::jsonb, '{}'::jsonb, 'app', now())", [
          chapter.chapterId,
          JSON.stringify([{ account: "credits_issued", amount: 100 }, { account: "dues_revenue", amount: -99 }]),
        ]);
      }),
      /balance|sum/i,
    );
  });
});

describe("member-facing reads", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let member: Member;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    await enablePayments(db, chapter);
    member = await addMember(db, chapter);
    await createAssessment(db, chapter, [member.membershipId], 45_000);
  });

  it("exposes outstanding amounts through the security-invoker view", async () => {
    const rows = await db.asUser(member.userId, (tx) => tx.query<{ title: string; outstanding_cents: string }>("select title, outstanding_cents::text from public.member_assessment_balances"));
    expect(rows.rows).toEqual([{ title: "Fall 2026 dues", outstanding_cents: "45000" }]);
    const other = await addMember(db, chapter);
    const hidden = await db.asUser(other.userId, (tx) => tx.query("select 1 from public.member_assessment_balances where membership_id = $1", [member.membershipId]));
    expect(hidden.rows).toHaveLength(0);
  });

  it("lists balances for officers only", async () => {
    const list = await db.asUser(chapter.ownerId, (tx) => tx.query<{ membership_id: string }>("select * from public.chapter_member_balances($1)", [chapter.chapterId]));
    expect(list.rows.map((r) => r.membership_id)).toContain(member.membershipId);
    await expectDenied(db.asUser(member.userId, (tx) => tx.query("select * from public.chapter_member_balances($1)", [chapter.chapterId])), /not authorized/);
  });
});
