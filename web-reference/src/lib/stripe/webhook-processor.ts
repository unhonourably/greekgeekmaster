import type { RpcCaller } from "@/lib/supabase/admin";
import type { AccountSnapshot } from "@/lib/stripe/account-status";

export type FeeDetail = { type: string; amount: number };
export type BalanceTxn = { id: string; amount: number; fee: number; fee_details?: FeeDetail[] };

export type ChargeLike = {
  id: string;
  amount: number;
  amount_captured?: number;
  currency: string;
  application_fee?: string | { id: string } | null;
  application_fee_amount?: number | null;
  balance_transaction?: string | BalanceTxn | null;
  payment_method_details?: { type?: string } | null;
  refunds?: { data: RefundLike[] } | null;
};

export type PaymentIntentLike = {
  id: string;
  status: string;
  amount: number;
  amount_received: number;
  currency: string;
  metadata?: Record<string, string> | null;
  latest_charge?: string | ChargeLike | null;
  last_payment_error?: { code?: string | null; message?: string | null; payment_method?: { type?: string } | null } | null;
  payment_method_types?: string[];
};

export type CheckoutSessionLike = {
  id: string;
  status?: string | null;
  payment_status: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | PaymentIntentLike | null;
};

export type RefundLike = {
  id: string;
  amount: number;
  status: string | null;
  charge?: string | { id: string } | null;
  failure_reason?: string | null;
  metadata?: Record<string, string> | null;
};

export type DisputeLike = {
  id: string;
  amount: number;
  status: string;
  reason: string;
  charge: string | { id: string };
  evidence_details?: { due_by?: number | null } | null;
  balance_transactions?: BalanceTxn[];
};

export type PayoutLike = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  failure_code?: string | null;
  livemode: boolean;
};

export type ApplicationFeeLike = {
  id: string;
  charge: string | { id: string };
  refunds?: { data: Array<{ id: string; amount: number }> } | null;
};

export type SubscriptionLike = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  metadata?: Record<string, string> | null;
  items?: { data: Array<{ current_period_end?: number | null; price?: { unit_amount?: number | null; recurring?: { interval?: string | null } | null } | null }> } | null;
};

export type InvoiceLike = {
  id: string;
  status: string | null;
  amount_paid: number;
  status_transitions?: { paid_at?: number | null } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  subscription?: string | { id: string } | null;
};

export type StripeEventLike = {
  id: string;
  type: string;
  account?: string | null;
  livemode: boolean;
  api_version?: string | null;
  created: number;
  data: { object: unknown };
};

export type StripeGateway = {
  retrievePaymentIntent(id: string, account: string): Promise<PaymentIntentLike>;
  retrieveCharge(id: string, account: string): Promise<ChargeLike>;
  retrieveRefund(id: string, account: string): Promise<RefundLike>;
  retrieveDispute(id: string, account: string): Promise<DisputeLike>;
  retrievePayout(id: string, account: string): Promise<PayoutLike>;
  retrieveCheckoutSession(id: string, account: string): Promise<CheckoutSessionLike>;
  retrieveApplicationFee(id: string): Promise<ApplicationFeeLike>;
  retrieveAccount(id: string): Promise<AccountSnapshot>;
  retrieveSubscription(id: string): Promise<SubscriptionLike>;
  retrieveInvoice(id: string): Promise<InvoiceLike>;
};

export const SUBSCRIPTION_PLAN_CODE = "chapter_monthly";

export type PaymentRecord = { id: string; stripe_account_id: string | null; status: string; amount_cents: number; currency: string };

export type WebhookDeps = {
  rpc: RpcCaller;
  stripe: StripeGateway;
  findPayment(id: string): Promise<PaymentRecord | null>;
  findPaymentByIntent(id: string): Promise<PaymentRecord | null>;
};

export type ProcessResult = "processed" | "ignored" | "duplicate";

export class WebhookRejection extends Error {}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function processingFeeFrom(bt: BalanceTxn): number {
  if (!bt.fee_details || bt.fee_details.length === 0) return bt.fee;
  return bt.fee_details.filter((d) => d.type !== "application_fee").reduce((sum, d) => sum + d.amount, 0);
}

async function resolvePayment(deps: WebhookDeps, account: string, ids: { paymentId?: string | null; intentId?: string | null }): Promise<PaymentRecord | null> {
  let payment: PaymentRecord | null = null;
  if (ids.paymentId && /^[0-9a-f-]{36}$/i.test(ids.paymentId)) payment = await deps.findPayment(ids.paymentId);
  if (!payment && ids.intentId) payment = await deps.findPaymentByIntent(ids.intentId);
  if (!payment) return null;
  if (payment.stripe_account_id !== account) {
    throw new WebhookRejection(`payment ${payment.id} does not belong to account ${account}`);
  }
  return payment;
}

async function recordIntentSucceeded(deps: WebhookDeps, account: string, payment: PaymentRecord, intentId: string, eventId: string): Promise<void> {
  const intent = await deps.stripe.retrievePaymentIntent(intentId, account);
  if (intent.status !== "succeeded") {
    if (intent.status === "processing") {
      await deps.rpc("service_mark_payment_processing", { p_payment: payment.id, p_payment_intent: intent.id, p_method: intent.payment_method_types?.[0] ?? null });
    }
    return;
  }
  if (intent.currency.toLowerCase() !== payment.currency.toLowerCase()) {
    throw new WebhookRejection(`currency mismatch on payment ${payment.id}`);
  }
  const chargeId = idOf(intent.latest_charge as string | { id: string } | null);
  const charge = chargeId ? await deps.stripe.retrieveCharge(chargeId, account) : null;
  const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  await deps.rpc("service_record_payment_succeeded", {
    p_payment: payment.id,
    p_payment_intent: intent.id,
    p_charge: charge?.id ?? null,
    p_method: charge?.payment_method_details?.type ?? intent.payment_method_types?.[0] ?? null,
    p_amount_received: intent.amount_received,
    p_application_fee_id: idOf(charge?.application_fee ?? null),
    p_application_fee_amount: charge?.application_fee_amount ?? 0,
    p_processing_fee: bt ? processingFeeFrom(bt) : null,
    p_balance_transaction: bt?.id ?? null,
    p_event: eventId,
  });
}

async function syncRefund(deps: WebhookDeps, account: string, refund: RefundLike, eventId: string): Promise<void> {
  const fresh = await deps.stripe.retrieveRefund(refund.id, account);
  const chargeId = idOf(fresh.charge ?? null);
  if (!chargeId) return;
  await deps.rpc("service_sync_refund", {
    p_refund: fresh.metadata?.refund_id && /^[0-9a-f-]{36}$/i.test(fresh.metadata.refund_id) ? fresh.metadata.refund_id : null,
    p_stripe_refund: fresh.id,
    p_charge: chargeId,
    p_amount: fresh.amount,
    p_status: fresh.status ?? "pending",
    p_failure_reason: fresh.failure_reason ?? null,
    p_event: eventId,
  });
}

async function handle(event: StripeEventLike, deps: WebhookDeps): Promise<"processed" | "ignored"> {
  const account = event.account ?? null;
  const obj = event.data.object as Record<string, unknown>;

  if (event.type === "application_fee.refunded") {
    const fee = await deps.stripe.retrieveApplicationFee(String(obj.id));
    const chargeId = idOf(fee.charge);
    if (!chargeId) return "ignored";
    for (const r of fee.refunds?.data ?? []) {
      await deps.rpc("service_record_application_fee_refund", { p_fee_refund: r.id, p_charge: chargeId, p_amount: r.amount });
    }
    return "processed";
  }

  if (event.type === "account.updated") {
    const id = account ?? String(obj.id);
    const snap = await deps.stripe.retrieveAccount(id);
    await deps.rpc("service_upsert_connected_account", {
      p_chapter: null, p_account: snap.id, p_livemode: snap.livemode, p_card_status: snap.cardPayments, p_ach_status: snap.achPayments,
      p_payouts_status: snap.payouts, p_requirements_due: snap.requirementsDue, p_requirements_past_due: snap.requirementsPastDue,
      p_disabled_reason: snap.disabledReason, p_created_by: null,
    });
    return "processed";
  }

  if (!account && event.type.startsWith("customer.subscription.")) {
    const sub = await deps.stripe.retrieveSubscription(String(obj.id));
    const chapterId = sub.metadata?.chapter_id;
    if (!chapterId || !/^[0-9a-f-]{36}$/i.test(chapterId)) return "ignored";
    const item = sub.items?.data[0];
    await deps.rpc("service_sync_subscription", {
      p_chapter: chapterId,
      p_subscription: sub.id,
      p_customer: idOf(sub.customer),
      p_status: sub.status,
      p_plan_code: SUBSCRIPTION_PLAN_CODE,
      p_unit_amount: item?.price?.unit_amount ?? null,
      p_interval: item?.price?.recurring?.interval ?? null,
      p_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
      p_cancel_at_period_end: sub.cancel_at_period_end,
    });
    return "processed";
  }

  if (!account && (event.type === "invoice.paid" || event.type === "invoice.payment_failed" || event.type === "invoice.voided")) {
    const invoice = await deps.stripe.retrieveInvoice(String(obj.id));
    const subId = idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null);
    if (!subId) return "ignored";
    await deps.rpc("service_record_saas_invoice", {
      p_subscription: subId,
      p_invoice: invoice.id,
      p_amount_paid: invoice.amount_paid,
      p_status: invoice.status ?? "open",
      p_paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
    });
    return "processed";
  }

  if (!account) return "ignored";

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = await deps.stripe.retrieveCheckoutSession(String(obj.id), account);
      const intentId = idOf(session.payment_intent as string | { id: string } | null);
      const payment = await resolvePayment(deps, account, { paymentId: session.metadata?.payment_id ?? session.client_reference_id, intentId });
      if (!payment) return "ignored";
      await deps.rpc("service_attach_checkout_session", { p_payment: payment.id, p_session: session.id });
      if (event.type === "checkout.session.expired") {
        await deps.rpc("service_record_payment_canceled", { p_payment: payment.id });
        return "processed";
      }
      if (event.type === "checkout.session.async_payment_failed") {
        const intent = intentId ? await deps.stripe.retrievePaymentIntent(intentId, account) : null;
        await deps.rpc("service_record_payment_failed", {
          p_payment: payment.id, p_payment_intent: intentId, p_code: intent?.last_payment_error?.code ?? "async_payment_failed", p_message: intent?.last_payment_error?.message ?? "The bank payment could not be completed.",
        });
        return "processed";
      }
      if (!intentId) return "ignored";
      if (session.payment_status === "paid") {
        await recordIntentSucceeded(deps, account, payment, intentId, event.id);
      } else {
        await deps.rpc("service_mark_payment_processing", { p_payment: payment.id, p_payment_intent: intentId, p_method: null });
      }
      return "processed";
    }

    case "payment_intent.succeeded":
    case "payment_intent.processing":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const intent = await deps.stripe.retrievePaymentIntent(String(obj.id), account);
      const payment = await resolvePayment(deps, account, { paymentId: intent.metadata?.payment_id, intentId: intent.id });
      if (!payment) return "ignored";
      if (intent.status === "succeeded") {
        await recordIntentSucceeded(deps, account, payment, intent.id, event.id);
      } else if (intent.status === "processing") {
        await deps.rpc("service_mark_payment_processing", { p_payment: payment.id, p_payment_intent: intent.id, p_method: intent.payment_method_types?.[0] ?? null });
      } else if (event.type === "payment_intent.payment_failed" && (payment.status === "processing" || intent.last_payment_error?.payment_method?.type === "us_bank_account")) {
        await deps.rpc("service_record_payment_failed", {
          p_payment: payment.id, p_payment_intent: intent.id, p_code: intent.last_payment_error?.code ?? "payment_failed", p_message: intent.last_payment_error?.message ?? "The payment failed.",
        });
      } else if (intent.status === "canceled") {
        await deps.rpc("service_record_payment_canceled", { p_payment: payment.id });
      } else {
        return "ignored";
      }
      return "processed";
    }

    case "charge.updated":
    case "charge.succeeded": {
      const charge = await deps.stripe.retrieveCharge(String(obj.id), account);
      const bt = typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
      const intentId = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
      const payment = intentId ? await resolvePayment(deps, account, { intentId }) : null;
      if (!payment || !bt) return "ignored";
      await deps.rpc("service_record_processing_fee", { p_payment: payment.id, p_processing_fee: processingFeeFrom(bt), p_balance_transaction: bt.id });
      return "processed";
    }

    case "charge.refunded": {
      const charge = await deps.stripe.retrieveCharge(String(obj.id), account);
      for (const refund of charge.refunds?.data ?? []) await syncRefund(deps, account, refund, event.id);
      return "processed";
    }

    case "refund.created":
    case "refund.updated":
    case "refund.failed":
    case "charge.refund.updated": {
      await syncRefund(deps, account, obj as unknown as RefundLike, event.id);
      return "processed";
    }

    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated": {
      const dispute = await deps.stripe.retrieveDispute(String(obj.id), account);
      await deps.rpc("service_sync_dispute", {
        p_dispute: dispute.id,
        p_charge: idOf(dispute.charge),
        p_amount: dispute.amount,
        p_status: dispute.status,
        p_reason: dispute.reason,
        p_evidence_due: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
        p_balance_transactions: (dispute.balance_transactions ?? []).map((b) => ({ id: b.id, amount: b.amount, fee: b.fee })),
      });
      return "processed";
    }

    case "payout.created":
    case "payout.updated":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled": {
      const payout = await deps.stripe.retrievePayout(String(obj.id), account);
      await deps.rpc("service_sync_payout", {
        p_account: account,
        p_payout: payout.id,
        p_amount: payout.amount,
        p_currency: payout.currency,
        p_status: payout.status,
        p_arrival: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10),
        p_failure_code: payout.failure_code ?? null,
        p_livemode: payout.livemode,
      });
      return "processed";
    }

    default:
      return "ignored";
  }
}

export async function processStripeEvent(event: StripeEventLike, deps: WebhookDeps): Promise<ProcessResult> {
  const claimed = await deps.rpc<boolean>("service_claim_stripe_event", {
    p_id: event.id,
    p_type: event.type,
    p_account: event.account ?? null,
    p_livemode: event.livemode,
    p_api_version: event.api_version ?? null,
    p_created: new Date(event.created * 1000).toISOString(),
  });
  if (!claimed) return "duplicate";
  try {
    const result = await handle(event, deps);
    await deps.rpc("service_complete_stripe_event", { p_id: event.id, p_status: result, p_error: null });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.rpc("service_complete_stripe_event", { p_id: event.id, p_status: "failed", p_error: message.slice(0, 500) });
    throw error;
  }
}