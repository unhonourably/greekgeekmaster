import "server-only";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIPTION_PLAN_CODE } from "@/lib/stripe/webhook-processor";

export const ADMIN_SUBSCRIPTION_CENTS = 50;
const ADMIN_SUBSCRIPTION_PRICE_ID = "price_1UUbBO2f6OMJILR4A5xBmG2X";

async function latestStripeCustomerId(chapterId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("chapter_subscriptions")
    .select("stripe_customer_id")
    .eq("chapter_id", chapterId)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

export async function createSubscriptionCheckout(input: {
  chapterId: string;
  chapterName: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data: plan, error } = await admin
    .from("saas_plans")
    .select("name, price_cents, billing_interval, stripe_price_id")
    .eq("code", SUBSCRIPTION_PLAN_CODE)
    .eq("active", true)
    .single();
  if (error || !plan) throw new Error("The subscription plan is not configured.");
  const customerId = await latestStripeCustomerId(input.chapterId);

  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      client_reference_id: input.chapterId,
      ...(customerId ? { customer: customerId } : { customer_email: input.email }),
      line_items: [
        plan.stripe_price_id
          ? { price: plan.stripe_price_id, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: Number(plan.price_cents),
                recurring: { interval: plan.billing_interval as "month" | "year" },
                product_data: { name: `${plan.name}: ${input.chapterName}`.slice(0, 250) },
              },
            },
      ],
      subscription_data: { metadata: { chapter_id: input.chapterId } },
      metadata: { chapter_id: input.chapterId, purpose: "chapter_subscription" },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    { idempotencyKey: `subscription-checkout:${input.chapterId}:${Math.floor(Date.now() / 600_000)}` },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createAdminSubscriptionCheckout(input: {
  chapterId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const customerId = await latestStripeCustomerId(input.chapterId);
  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      client_reference_id: input.chapterId,
      ...(customerId ? { customer: customerId } : { customer_email: input.email }),
      line_items: [{ price: ADMIN_SUBSCRIPTION_PRICE_ID, quantity: 1 }],
      subscription_data: { metadata: { chapter_id: input.chapterId, purpose: "admin_subscription" } },
      metadata: { chapter_id: input.chapterId, purpose: "admin_subscription" },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    { idempotencyKey: `admin-subscription-checkout:${input.chapterId}:${Math.floor(Date.now() / 600_000)}` },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortal(chapterId: string, returnUrl: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("chapter_subscriptions")
    .select("stripe_customer_id")
    .eq("chapter_id", chapterId)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.stripe_customer_id) return null;
  const portal = await stripe().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: returnUrl });
  return portal.url;
}
