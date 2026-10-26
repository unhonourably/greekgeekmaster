import "server-only";
import { stripe } from "@/lib/stripe/client";
import { adminRpc } from "@/lib/supabase/admin";

export type PendingPaymentRow = {
  id: string;
  chapter_id: string;
  membership_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  currency: string;
  stripe_account_id: string;
  idempotency_key: string;
};

export async function createCheckoutSession(input: {
  payment: PendingPaymentRow;
  description: string;
  chapterName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const { payment } = input;
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: payment.id,
      customer_email: input.customerEmail || undefined,
      allowed_payment_method_types: ["card", "us_bank_account"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: payment.currency,
            unit_amount: Number(payment.amount_cents),
            product_data: { name: input.description.slice(0, 250), description: input.chapterName.slice(0, 250) },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: Number(payment.platform_fee_cents),
        description: `${input.chapterName}: ${input.description}`.slice(0, 1000),
        metadata: { payment_id: payment.id, chapter_id: payment.chapter_id, membership_id: payment.membership_id },
      },
      metadata: { payment_id: payment.id },
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    { stripeAccount: payment.stripe_account_id, idempotencyKey: payment.idempotency_key },
  );
  await adminRpc()("service_attach_checkout_session", { p_payment: payment.id, p_session: session.id });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createStripeRefund(input: {
  refundId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  amountCents: number;
  stripeAccount: string;
  refundApplicationFee: boolean;
}): Promise<{ id: string; status: string | null; amount: number; charge: string | null }> {
  const refund = await stripe().refunds.create(
    {
      ...(input.chargeId ? { charge: input.chargeId } : { payment_intent: input.paymentIntentId ?? undefined }),
      amount: input.amountCents,
      refund_application_fee: input.refundApplicationFee,
      metadata: { refund_id: input.refundId },
    },
    { stripeAccount: input.stripeAccount, idempotencyKey: `refund:${input.refundId}` },
  );
  return {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
    charge: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null,
  };
}
