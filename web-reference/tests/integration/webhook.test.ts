import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { createDb, type Db } from "../support/db";
import {
  accountTotal,
  addMember,
  createAssessment,
  createVerifiedChapter,
  enablePayments,
  memberBalance,
  startPayment,
  unbalancedTransactions,
  type ChapterFixture,
  type PendingPayment,
} from "../support/fixtures";
import {
  processStripeEvent,
  WebhookRejection,
  type ChargeLike,
  type CheckoutSessionLike,
  type InvoiceLike,
  type PaymentIntentLike,
  type SubscriptionLike,
  type StripeEventLike,
  type StripeGateway,
  type WebhookDeps,
} from "@/lib/stripe/webhook-processor";
import type { AccountSnapshot } from "@/lib/stripe/account-status";

const SECRET = "whsec_test_secret_for_signature_checks";
const stripeSdk = new Stripe("sk_test_unused_in_tests");

type FakeStripe = {
  sessions: Map<string, CheckoutSessionLike>;
  intents: Map<string, PaymentIntentLike>;
  charges: Map<string, ChargeLike>;
  accounts: Map<string, AccountSnapshot>;
  fees: Map<string, { id: string; charge: string; refunds: { data: Array<{ id: string; amount: number }> } }>;
  owner: Map<string, string>;
  subscriptions: Map<string, SubscriptionLike>;
  invoices: Map<string, InvoiceLike>;
};

function fakeGateway(f: FakeStripe): StripeGateway {
  const scoped = <T>(map: Map<string, T>, id: string, account: string): T => {
    const value = map.get(id);
    if (!value || f.owner.get(id) !== account) throw new Error(`No such object: ${id}`);
    return value;
  };
  return {
    retrievePaymentIntent: async (id, account) => scoped(f.intents, id, account),
    retrieveCharge: async (id, account) => scoped(f.charges, id, account),
    retrieveCheckoutSession: async (id, account) => scoped(f.sessions, id, account),
    retrieveRefund: async () => { throw new Error("not used"); },
    retrieveDispute: async () => { throw new Error("not used"); },
    retrievePayout: async () => { throw new Error("not used"); },
    retrieveApplicationFee: async (id) => {
      const fee = f.fees.get(id);
      if (!fee) throw new Error(`No such fee: ${id}`);
      return fee;
    },
    retrieveSubscription: async (id) => {
      const s = f.subscriptions.get(id);
      if (!s) throw new Error(`No such subscription: ${id}`);
      return s;
    },
    retrieveInvoice: async (id) => {
      const i = f.invoices.get(id);
      if (!i) throw new Error(`No such invoice: ${id}`);
      return i;
    },
    retrieveAccount: async (id) => {
      const a = f.accounts.get(id);
      if (!a) throw new Error(`No such account: ${id}`);
      return a;
    },
  };
}

function deps(db: Db, f: FakeStripe): WebhookDeps {
  const find = async (column: string, value: string) => {
    const r = await db.pg.query<{ id: string; stripe_account_id: string | null; status: string; amount_cents: string; currency: string }>(
      `select id, stripe_account_id, status::text, amount_cents::text, currency from public.payments where ${column} = $1`,
      [value],
    );
    const row = r.rows[0];
    return row ? { ...row, amount_cents: Number(row.amount_cents) } : null;
  };
  return {
    rpc: (fn, args) => db.rpc("service_role", null, fn, args),
    stripe: fakeGateway(f),
    findPayment: (id) => find("id", id),
    findPaymentByIntent: (id) => find("stripe_payment_intent_id", id),
  };
}

function signedEvent(event: StripeEventLike): StripeEventLike {
  const payload = JSON.stringify(event);
  const header = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return stripeSdk.webhooks.constructEvent(payload, header, SECRET) as unknown as StripeEventLike;
}

let seq = 0;
function stageCheckout(f: FakeStripe, payment: PendingPayment, account: string, opts: { paid: boolean; amount?: number; fee?: number; method?: string } = { paid: true }) {
  seq += 1;
  const ids = { session: `cs_test_${seq}`, intent: `pi_test_${seq}`, charge: `ch_test_${seq}`, fee: `fee_test_${seq}`, bt: `txn_test_${seq}` };
  const amount = opts.amount ?? payment.amount_cents;
  const appFee = opts.fee ?? payment.platform_fee_cents;
  const stripeFee = Math.floor((amount * 290 + 5000) / 10000) + 30;
  f.charges.set(ids.charge, {
    id: ids.charge,
    amount,
    currency: "usd",
    application_fee: ids.fee,
    application_fee_amount: appFee,
    balance_transaction: { id: ids.bt, amount, fee: stripeFee + appFee, fee_details: [{ type: "stripe_fee", amount: stripeFee }, { type: "application_fee", amount: appFee }] },
    payment_method_details: { type: opts.method ?? "card" },
  });
  f.intents.set(ids.intent, {
    id: ids.intent,
    status: opts.paid ? "succeeded" : "processing",
    amount,
    amount_received: opts.paid ? amount : 0,
    currency: "usd",
    metadata: { payment_id: payment.id },
    latest_charge: opts.paid ? ids.charge : null,
    payment_method_types: [opts.method ?? "card"],
  });
  f.sessions.set(ids.session, { id: ids.session, payment_status: opts.paid ? "paid" : "unpaid", client_reference_id: payment.id, metadata: { payment_id: payment.id }, payment_intent: ids.intent });
  for (const id of [ids.session, ids.intent, ids.charge]) f.owner.set(id, account);
  return { ids, stripeFee };
}

function event(id: string, type: string, account: string | null, objectId: string): StripeEventLike {
  return { id, type, account, livemode: false, api_version: "2026-09-30.endive", created: Math.floor(Date.now() / 1000), data: { object: { id: objectId } } };
}

describe("Stripe webhook processing", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let other: ChapterFixture;
  let account: string;
  let otherAccount: string;
  const f: FakeStripe = { sessions: new Map(), intents: new Map(), charges: new Map(), accounts: new Map(), fees: new Map(), owner: new Map(), subscriptions: new Map(), invoices: new Map() };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    other = await createVerifiedChapter(db);
    account = await enablePayments(db, chapter);
    otherAccount = await enablePayments(db, other);
  });

  it("rejects payloads whose signature does not match", () => {
    const payload = JSON.stringify(event("evt_sig", "checkout.session.completed", account, "cs_x"));
    const header = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(() => stripeSdk.webhooks.constructEvent(payload.replace("cs_x", "cs_y"), header, SECRET)).toThrow();
    expect(() => stripeSdk.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
  });

  it("completes a card checkout once even when the event is delivered twice", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 45_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    const { ids, stripeFee } = stageCheckout(f, payment, account, { paid: true });
    const evt = signedEvent(event("evt_cs_1", "checkout.session.completed", account, ids.session));
    expect(await processStripeEvent(evt, deps(db, f))).toBe("processed");
    expect(await processStripeEvent(evt, deps(db, f))).toBe("duplicate");
    expect(await processStripeEvent(signedEvent(event("evt_pi_1", "payment_intent.succeeded", account, ids.intent)), deps(db, f))).toBe("processed");

    const p = await db.pg.query<{ status: string; application_fee_cents: string; processing_fee_cents: string; stripe_charge_id: string; reconciliation_status: string }>(
      "select status::text, application_fee_cents::text, processing_fee_cents::text, stripe_charge_id, reconciliation_status from public.payments where id = $1",
      [payment.id],
    );
    expect(p.rows[0]).toEqual({ status: "succeeded", application_fee_cents: "675", processing_fee_cents: String(stripeFee), stripe_charge_id: ids.charge, reconciliation_status: "matched" });
    const txns = await db.pg.query<{ n: number }>("select count(*)::int as n from public.ledger_transactions where payment_id = $1", [payment.id]);
    expect(txns.rows[0].n).toBe(3);
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(0);
    expect(await unbalancedTransactions(db)).toBe(0);
  });

  it("rejects an event from a different connected account that references this chapter's payment", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 30_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    const { ids } = stageCheckout(f, payment, otherAccount, { paid: true });
    const evt = signedEvent(event("evt_spoof_1", "checkout.session.completed", otherAccount, ids.session));
    await expect(processStripeEvent(evt, deps(db, f))).rejects.toBeInstanceOf(WebhookRejection);
    const p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("pending");
    const e = await db.pg.query<{ status: string }>("select status from public.stripe_events where id = 'evt_spoof_1'");
    expect(e.rows[0].status).toBe("failed");
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(30_000);
  });

  it("moves a bank payment through processing to succeeded", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 60_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    const { ids } = stageCheckout(f, payment, account, { paid: false, method: "us_bank_account" });
    await processStripeEvent(signedEvent(event("evt_ach_1", "checkout.session.completed", account, ids.session)), deps(db, f));
    let p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("processing");
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(60_000);

    f.intents.set(ids.intent, { ...f.intents.get(ids.intent)!, status: "succeeded", amount_received: 60_000, latest_charge: ids.charge });
    f.sessions.set(ids.session, { ...f.sessions.get(ids.session)!, payment_status: "paid" });
    await processStripeEvent(signedEvent(event("evt_ach_2", "checkout.session.async_payment_succeeded", account, ids.session)), deps(db, f));
    p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("succeeded");
    expect(await memberBalance(db, member.userId, member.membershipId)).toBe(0);
  });

  it("ignores card declines while checkout is still open, but records bank failures", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 20_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    const { ids } = stageCheckout(f, payment, account, { paid: false });
    f.intents.set(ids.intent, { ...f.intents.get(ids.intent)!, status: "requires_payment_method", last_payment_error: { code: "card_declined", message: "Your card was declined.", payment_method: { type: "card" } } });
    expect(await processStripeEvent(signedEvent(event("evt_decl_1", "payment_intent.payment_failed", account, ids.intent)), deps(db, f))).toBe("ignored");
    let p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("pending");

    await db.rpc("service_role", null, "service_mark_payment_processing", { p_payment: payment.id, p_payment_intent: ids.intent, p_method: "us_bank_account" });
    f.intents.set(ids.intent, { ...f.intents.get(ids.intent)!, last_payment_error: { code: "insufficient_funds", message: "Insufficient funds", payment_method: { type: "us_bank_account" } } });
    expect(await processStripeEvent(signedEvent(event("evt_decl_2", "payment_intent.payment_failed", account, ids.intent)), deps(db, f))).toBe("processed");
    p = await db.pg.query<{ status: string }>("select status::text from public.payments where id = $1", [payment.id]);
    expect(p.rows[0].status).toBe("failed");
    const n = await db.pg.query<{ n: number }>("select count(*)::int as n from public.notifications where user_id = $1 and kind = 'payment_failed'", [member.userId]);
    expect(n.rows[0].n).toBe(1);
  });

  it("flags a fee mismatch reported by Stripe for reconciliation", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 10_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    const { ids } = stageCheckout(f, payment, account, { paid: true, fee: 100 });
    await processStripeEvent(signedEvent(event("evt_mm_1", "checkout.session.completed", account, ids.session)), deps(db, f));
    const queue = await db.pg.query<{ reconciliation_status: string }>("select reconciliation_status from public.payments where id = $1", [payment.id]);
    expect(queue.rows[0].reconciliation_status).toBe("mismatch");
  });

  it("posts platform fee refunds from platform-level application_fee.refunded events once", async () => {
    const member = await addMember(db, chapter);
    const { memberAssessmentIds } = await createAssessment(db, chapter, [member.membershipId], 40_000);
    const payment = await startPayment(db, member.userId, memberAssessmentIds[member.membershipId]);
    const { ids } = stageCheckout(f, payment, account, { paid: true });
    await processStripeEvent(signedEvent(event("evt_fr_0", "checkout.session.completed", account, ids.session)), deps(db, f));
    const before = await accountTotal(db, chapter.chapterId, "platform_fees");
    f.fees.set(ids.fee, { id: ids.fee, charge: ids.charge, refunds: { data: [{ id: "fr_test_1", amount: 600 }] } });
    await processStripeEvent(signedEvent(event("evt_fr_1", "application_fee.refunded", null, ids.fee)), deps(db, f));
    await processStripeEvent(signedEvent(event("evt_fr_2", "application_fee.refunded", null, ids.fee)), deps(db, f));
    expect(await accountTotal(db, chapter.chapterId, "platform_fees")).toBe(before - 600);
  });

  it("activates and pauses online collection from platform subscription events", async () => {
    const third = await createVerifiedChapter(db);
    await enablePayments(db, third, { subscribe: false });
    const readiness = () => db.rpc<Record<string, unknown>>("authenticated", third.ownerId, "chapter_payment_readiness", { p_chapter: third.chapterId });
    expect(await readiness()).toMatchObject({ subscription: "none", can_collect: false });

    const period = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const sub: SubscriptionLike = {
      id: "sub_test_1", status: "active", customer: "cus_test_1", cancel_at_period_end: false, metadata: { chapter_id: third.chapterId },
      items: { data: [{ current_period_end: period, price: { unit_amount: 3_000, recurring: { interval: "month" } } }] },
    };
    f.subscriptions.set(sub.id, sub);
    await processStripeEvent(signedEvent(event("evt_sub_1", "customer.subscription.created", null, sub.id)), deps(db, f));
    expect(await readiness()).toMatchObject({ subscription: "active", can_collect: true });

    f.invoices.set("in_test_1", { id: "in_test_1", status: "paid", amount_paid: 3_000, status_transitions: { paid_at: Math.floor(Date.now() / 1000) }, parent: { subscription_details: { subscription: sub.id } } });
    await processStripeEvent(signedEvent(event("evt_inv_1", "invoice.paid", null, "in_test_1")), deps(db, f));
    await processStripeEvent(signedEvent(event("evt_inv_1", "invoice.paid", null, "in_test_1")), deps(db, f));
    const inv = await db.pg.query<{ amount_paid_cents: string; status: string }>("select amount_paid_cents::text, status from public.saas_invoices where chapter_id = $1", [third.chapterId]);
    expect(inv.rows).toEqual([{ amount_paid_cents: "3000", status: "paid" }]);
    f.subscriptions.set(sub.id, { ...sub, status: "canceled" });
    await processStripeEvent(signedEvent(event("evt_sub_2", "customer.subscription.deleted", null, sub.id)), deps(db, f));
    expect(await readiness()).toMatchObject({ subscription: "canceled", can_collect: false });
  });

  it("syncs connected account capability changes", async () => {
    f.accounts.set(account, { id: account, livemode: false, cardPayments: "restricted", achPayments: "active", payouts: "restricted", requirementsDue: ["external_account"], requirementsPastDue: ["external_account"], disabledReason: "card_payments_restricted" });
    await processStripeEvent(signedEvent(event("evt_acct_1", "account.updated", account, account)), deps(db, f));
    const readiness = await db.rpc<Record<string, unknown>>("authenticated", chapter.ownerId, "chapter_payment_readiness", { p_chapter: chapter.chapterId });
    expect(readiness).toMatchObject({ card_payments: "restricted", can_collect: false, requirements_due: ["external_account"] });
  });
});
