import "server-only";
import { stripe } from "@/lib/stripe/client";
import { retrieveAccountSnapshot } from "@/lib/stripe/connect";
import { createAdminClient, adminRpc } from "@/lib/supabase/admin";
import type {
  ApplicationFeeLike,
  ChargeLike,
  CheckoutSessionLike,
  InvoiceLike,
  SubscriptionLike,
  DisputeLike,
  PaymentIntentLike,
  PaymentRecord,
  PayoutLike,
  RefundLike,
  StripeGateway,
  WebhookDeps,
} from "@/lib/stripe/webhook-processor";

export function liveGateway(): StripeGateway {
  const s = stripe();
  return {
    retrievePaymentIntent: async (id, account) => (await s.paymentIntents.retrieve(id, {}, { stripeAccount: account })) as unknown as PaymentIntentLike,
    retrieveCharge: async (id, account) =>
      (await s.charges.retrieve(id, { expand: ["balance_transaction", "refunds"] }, { stripeAccount: account })) as unknown as ChargeLike,
    retrieveRefund: async (id, account) => (await s.refunds.retrieve(id, {}, { stripeAccount: account })) as unknown as RefundLike,
    retrieveDispute: async (id, account) => (await s.disputes.retrieve(id, {}, { stripeAccount: account })) as unknown as DisputeLike,
    retrievePayout: async (id, account) => (await s.payouts.retrieve(id, {}, { stripeAccount: account })) as unknown as PayoutLike,
    retrieveCheckoutSession: async (id, account) => (await s.checkout.sessions.retrieve(id, {}, { stripeAccount: account })) as unknown as CheckoutSessionLike,
    retrieveApplicationFee: async (id) => (await s.applicationFees.retrieve(id, { expand: ["refunds"] })) as unknown as ApplicationFeeLike,
    retrieveAccount: (id) => retrieveAccountSnapshot(id),
    retrieveSubscription: async (id) => (await s.subscriptions.retrieve(id)) as unknown as SubscriptionLike,
    retrieveInvoice: async (id) => (await s.invoices.retrieve(id)) as unknown as InvoiceLike,
  };
}

async function selectPayment(column: "id" | "stripe_payment_intent_id", value: string): Promise<PaymentRecord | null> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select("id, stripe_account_id, status, amount_cents, currency")
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...data, amount_cents: Number(data.amount_cents) } : null;
}

export function liveWebhookDeps(): WebhookDeps {
  return {
    rpc: adminRpc(),
    stripe: liveGateway(),
    findPayment: (id) => selectPayment("id", id),
    findPaymentByIntent: (id) => selectPayment("stripe_payment_intent_id", id),
  };
}
