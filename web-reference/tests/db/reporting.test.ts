import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import {
  accountTotal,
  addMember,
  createAssessment,
  createVerifiedChapter,
  enablePayments,
  startPayment,
  succeedPayment,
  type ChapterFixture,
} from "../support/fixtures";
import { splitIntoInstallments } from "@/lib/installments";

describe("chapter reporting", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let treasurer: { userId: string; membershipId: string };
  let member: { userId: string; membershipId: string };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    await enablePayments(db, chapter);
    treasurer = await addMember(db, chapter, "Taylor Treasurer", ["treasurer"]);
    member = await addMember(db, chapter, "Morgan Member");
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 45_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    await succeedPayment(db, payment, { processing: 1_335 });
    await db.rpc("service_role", null, "service_record_saas_invoice", {
      p_subscription: `sub_${chapter.chapterId.replace(/-/g, "").slice(0, 20)}`,
      p_invoice: "in_reporting_1",
      p_amount_paid: 3_000,
      p_status: "paid",
      p_paid_at: new Date().toISOString(),
    });
  });

  it("returns account balances that match the ledger and net to zero", async () => {
    const rows = await db.as("authenticated", treasurer.userId, (tx) =>
      tx.query<{ account: string; balance_cents: string }>("select account::text, balance_cents::text from public.chapter_account_balances($1)", [chapter.chapterId]),
    );
    const balances = Object.fromEntries(rows.rows.map((r) => [r.account, Number(r.balance_cents)]));
    expect(balances.platform_fees).toBe(675);
    expect(balances.processing_fees).toBe(1_335);
    expect(balances.stripe_balance).toBe(await accountTotal(db, chapter.chapterId, "stripe_balance"));
    expect(Object.values(balances).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it("summarizes this month's collections and fees", async () => {
    const rows = await db.as("authenticated", treasurer.userId, (tx) =>
      tx.query<{ online_cents: string; platform_fee_cents: string; processing_fee_cents: string; payments_count: string }>(
        "select online_cents::text, platform_fee_cents::text, processing_fee_cents::text, payments_count::text from public.chapter_monthly_collections($1, 3) order by month desc limit 1",
        [chapter.chapterId],
      ),
    );
    expect(rows.rows[0]).toEqual({ online_cents: "45000", platform_fee_cents: "675", processing_fee_cents: "1335", payments_count: "1" });
    const months = await db.as("authenticated", treasurer.userId, (tx) => tx.query("select * from public.chapter_monthly_collections($1, 3)", [chapter.chapterId]));
    expect(months.rows).toHaveLength(3);
  });

  it("hides reports from members without finance access", async () => {
    await expectDenied(db.rpc("authenticated", member.userId, "chapter_account_balances", { p_chapter: chapter.chapterId }), /not authorized/);
    await expectDenied(db.rpc("authenticated", member.userId, "chapter_monthly_collections", { p_chapter: chapter.chapterId, p_months: 12 }), /not authorized/);
  });

  it("lets the treasurer see the $30 subscription and its invoices, but not regular members", async () => {
    const asTreasurer = await db.as("authenticated", treasurer.userId, async (tx) => ({
      subs: (await tx.query<{ status: string; unit_amount_cents: string }>("select status, unit_amount_cents::text from public.chapter_subscriptions where chapter_id = $1", [chapter.chapterId])).rows,
      invoices: (await tx.query<{ amount_paid_cents: string }>("select amount_paid_cents::text from public.saas_invoices where chapter_id = $1", [chapter.chapterId])).rows,
    }));
    expect(asTreasurer.subs).toEqual([{ status: "active", unit_amount_cents: "3000" }]);
    expect(asTreasurer.invoices).toEqual([{ amount_paid_cents: "3000" }]);
    const asMember = await db.as("authenticated", member.userId, async (tx) => ({
      subs: (await tx.query("select 1 from public.chapter_subscriptions where chapter_id = $1", [chapter.chapterId])).rows.length,
      invoices: (await tx.query("select 1 from public.saas_invoices where chapter_id = $1", [chapter.chapterId])).rows.length,
    }));
    expect(asMember).toEqual({ subs: 0, invoices: 0 });
  });

  it("accepts an installment schedule built by the app's splitter", async () => {
    const other = await addMember(db, chapter, "Casey Installments");
    const { memberAssessmentIds } = await createAssessment(db, chapter, [other.membershipId], 45_001, "Installment dues");
    const ma = memberAssessmentIds[other.membershipId];
    const schedule = splitIntoInstallments(45_001, 3, "2026-11-30").map((s) => ({ amount_cents: s.amountCents, due_date: s.dueDate }));
    expect(schedule.map((s) => s.due_date)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
    const plan = await db.rpc<string>("authenticated", other.userId, "create_installment_plan", {
      p_member_assessment: ma,
      p_schedule: JSON.stringify(schedule),
      p_consent_text: "I agree to pay in 3 installments.",
    });
    const rows = await db.pg.query<{ amount_cents: string }>("select amount_cents::text from public.installments where plan_id = $1 order by sequence", [plan]);
    expect(rows.rows.map((r) => Number(r.amount_cents))).toEqual([15_000, 15_000, 15_001]);
    const first = await db.as("authenticated", other.userId, (tx) =>
      tx.query<{ amount_cents: number; platform_fee_cents: number }>(
        "select amount_cents::int, platform_fee_cents::int from public.create_pending_payment($1, (select id from public.installments where plan_id = $2 and sequence = 1), null)",
        [ma, plan],
      ),
    );
    expect(first.rows[0]).toEqual({ amount_cents: 15_000, platform_fee_cents: 225 });
  });
});
