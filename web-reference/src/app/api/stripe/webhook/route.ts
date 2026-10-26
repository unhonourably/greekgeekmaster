import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe/client";
import { liveWebhookDeps } from "@/lib/stripe/gateway";
import { processStripeEvent, WebhookRejection, type StripeEventLike } from "@/lib/stripe/webhook-processor";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const payload = await request.text();
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, serverEnv.stripeConnectWebhookSecret()].filter((s): s is string => Boolean(s?.startsWith("whsec_")));
  if (!secrets.length) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {}
  }
  if (!event) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  try {
    const result = await processStripeEvent(event as unknown as StripeEventLike, liveWebhookDeps());
    return NextResponse.json({ received: true, result });
  } catch (error) {
    if (error instanceof WebhookRejection) {
      console.error("stripe webhook rejected", { event: event.id, type: event.type, reason: error.message });
      return NextResponse.json({ received: true, result: "rejected" });
    }
    console.error("stripe webhook failed", { event: event.id, type: event.type, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
