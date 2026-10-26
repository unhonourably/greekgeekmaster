import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import {
  accountTotal,
  addMember,
  createAssessment,
  createVerifiedChapter,
  enablePayments,
  memberBalance,
  setSubscription,
  startPayment,
  succeedPayment,
  unbalancedTransactions,
  type ChapterFixture,
} from "../support/fixtures";
import { DEFAULT_PRICING_RULE, calculatePlatformFee } from "@/lib/fees";

describe("first vertical slice: verified chapter collects dues online", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let member: { userId: string; membershipId: string };
  let memberAssessmentId: string;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    member = await addMember(db, chapter);
  });

  it("gives the approved applicant administrator and treasurer roles", async () => {
    const perms = await db.rpc<string[]>("authenticated", chapter.ownerId, "my_permissions", { p_chapter: chapter.chapterId });
    expect(perms).toEqual(expect.arrayContaining(["chapter.ownership", "finance.manage", "payments.configure"]));
    const roles = await db.pg.query<{ key: string }>(
      "select r.key from public.role_assignments ra join public.roles r on r.id = ra.role_id where ra.membership_id = $1 and ra.ends_at is null order by 1",
      [chapter.ownerMembershipId],
    );
    expect(roles.rows.map((r) => r.key)).toEqual(["chapter_admin", "treasurer"]);
  });

  it("blocks online collection until terms are accepted and Stripe capabilities are active", async () => {
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 10_000, "Early fee");
    await expectDenied(startPayment(db, member.userId, memberAssessmentIds[member.membershipId]), /not accepting online payments/);
    const readiness = await db.rpc<Record<string, unknown>>("authenticated", chapter.ownerId, "chapter_payment_readiness", { p_chapter: chapter.chapterId });
    expect(readiness).toMatchObject({ verified: true, terms_accepted: false, can_collect: false });
  });

  it("requires an active $30/month subscription before collecting online", async () => {
    await enablePayments(db, chapter, { subscribe: false });
    let readiness = await db.rpc<Record<string, unknown>>("authenticated", chapter.ownerId, "chapter_payment_readiness", { p_chapter: chapter.chapterId });
    expect(readiness).toMatchObject({ card_payments: "active", subscription: "none", can_collect: false });
    const plan = await db.pg.query<{ price_cents: string; billing_interval: string }>("select price_cents::text, billing_interval from public.saas_plans where code = 'chapter_monthly' and active");
    expect(plan.rows).toEqual([{ price_cents: "3000", billing_interval: "month" }]);
    await setSubscription(db, chapter, "canceled");
    readiness = await db.rpc<Record<string, unknown>>("authenticated", chapter.ownerId, "chapter_payment_readiness", { p_chapter: chapter.chapterId });
    expect(readiness).toMatchObject({ subscription: "canceled", can_collect: false });
  });

  it("records the accepted agreement version and pricing", async () => {
    await setSubscription(db, chapter, "active");
    const agreement = await db.pg.query<{ version: string; bps: number; signer_name: string }>(
      `select t.version, r.platform_fee_bps as bps, a.signer_name from public.chapter_agreements a
       join public.terms_documents t on t.id = a.terms_document_id join public.pricing_rules r on r.id = a.pricing_rule_id
       where a.chapter_id = $1 and a.superseded_at is null`,
      [chapter.chapterId],
    );
    expect(agreement.rows).toEqual([{ version: "2026-10-21.1", bps: 150, signer_name: "Avery Treasurer" }]);
    const readiness = await db.rpc<Record<string, unknown>>("authenticated", chapter.ownerId, "chapter_payment_readiness", { p_chapter: chapter.chapterId });
    expect(readiness).toMatchObject({ terms_accepted: true, card_payments: "active", can_collect: true });
  });

  it("treasurer issues a $450 assessment and the member sees the balance", async () => {
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 45_000);
    memberAssessmentId = memberAssessmentIds[member.membershipId];
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(55_000);
    const notes = await db.asUser(member.userId, (tx) => tx.query<{ kind: string }>("select kind from public.notifications where user_id = $1", [member.userId]));
    expect(notes.rows.filter((n) => n.kind === "dues_assessed")).toHaveLength(2);
  });

  it("computes the platform fee server-side, matching the TypeScript engine", async () => {
    const payment = await startPayment(db, member.userId, memberAssessmentId);
    expect(payment.amount_cents).toBe(45_000);
    expect(payment.platform_fee_cents).toBe(675);
    expect(payment.platform_fee_cents).toBe(calculatePlatformFee(45_000, DEFAULT_PRICING_RULE));
  });

  it("refuses payment amounts larger than the outstanding balance", async () => {
    await expectDenied(startPayment(db, member.userId, memberAssessmentId, 45_001), /outstanding balance/);
  });

  it("records a verified success once, posts balanced ledger entries, and issues a receipt", async () => {
    const payment = await startPayment(db, member.userId, memberAssessmentId);
    const first = await succeedPayment(db, payment, { event: "evt_success_1" });
    const replay = await succeedPayment(db, payment, { event: "evt_success_1" });
    expect(first).toBe(true);
    expect(replay).toBe(false);

    const txns = await db.pg.query<{ kind: string; n: number }>(
      "select kind::text, count(*)::int as n from public.ledger_transactions where payment_id = $1 group by kind order by kind",
      [payment.id],
    );
    expect(txns.rows).toEqual([
      { kind: "payment", n: 1 },
      { kind: "platform_fee", n: 1 },
      { kind: "processing_fee", n: 1 },
    ]);
    expect(await unbalancedTransactions(db)).toBe(0);
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(10_000);
    expect(await accountTotal(db, chapter.chapterId, "platform_fees")).toBe(675);
    expect(await accountTotal(db, chapter.chapterId, "stripe_balance")).toBe(45_000 - 675 - 1_335);

    const receipt = await db.asUser(member.userId, (tx) =>
      tx.query<{ receipt_number: string; amount_cents: string; platform_fee_cents: string }>(
        "select receipt_number, amount_cents::text, platform_fee_cents::text from public.receipts where payment_id = $1",
        [payment.id],
      ),
    );
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0].receipt_number).toMatch(/^R-\d{4}-\d{6}$/);
    expect(receipt.rows[0]).toMatchObject({ amount_cents: "45000", platform_fee_cents: "675" });

    const ma = await db.pg.query<{ status: string }>("select status from public.member_assessments where id = $1", [memberAssessmentId]);
    expect(ma.rows[0].status).toBe("paid");
  });

  it("lets the treasurer see the payment, fee, and reconciliation status", async () => {
    const rows = await db.asUser(chapter.ownerId, (tx) =>
      tx.query<{ status: string; application_fee_cents: string; net_cents: string; reconciliation_status: string }>(
        "select status::text, application_fee_cents::text, net_cents::text, reconciliation_status from public.payments where member_assessment_id = $1 and status = 'succeeded'",
        [memberAssessmentId],
      ),
    );
    expect(rows.rows).toEqual([{ status: "succeeded", application_fee_cents: "675", net_cents: "42990", reconciliation_status: "matched" }]);
    const summary = await db.rpc<Record<string, number>>("authenticated", chapter.ownerId, "chapter_financial_summary", {
      p_chapter: chapter.chapterId,
      p_from: "2000-01-01T00:00:00Z",
      p_to: "2100-01-01T00:00:00Z",
    });
    expect(summary).toMatchObject({
      assessed_cents: 55_000,
      collected_online_cents: 45_000,
      platform_fees_cents: 675,
      processing_fees_cents: 1_335,
      outstanding_cents: 10_000,
      members_with_balance: 1,
    });
  });

  it("flags a mismatch when Stripe reports a different fee than expected", async () => {
    const other = await addMember(db, chapter, "Riley Member");
    const { memberAssessmentIds } = await createAssessment(db, chapter, [other.membershipId], 20_000, "Social fee");
    const payment = await startPayment(db, other.userId, memberAssessmentIds[other.membershipId]);
    await succeedPayment(db, payment, { fee: 250 });
    const r = await db.pg.query<{ reconciliation_status: string; reconciliation_note: string }>(
      "select reconciliation_status, reconciliation_note from public.payments where id = $1",
      [payment.id],
    );
    expect(r.rows[0].reconciliation_status).toBe("mismatch");
    expect(r.rows[0].reconciliation_note).toContain("application fee 250 differs from expected 300");
    expect(await unbalancedTransactions(db)).toBe(0);
  });
});
