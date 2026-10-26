import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { syncConnectedAccount } from "@/lib/stripe/connect";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_ACCOUNT_EVENTS_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const payload = await request.text();

  let notification: { id: string; type: string; related_object?: { id: string } | null };
  try {
    notification = stripe().parseEventNotification(payload, signature, secret) as unknown as typeof notification;
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (!notification.type.startsWith("v2.core.account") || !notification.related_object?.id) {
    return NextResponse.json({ received: true, result: "ignored" });
  }
  try {
    await syncConnectedAccount(notification.related_object.id);
    return NextResponse.json({ received: true, result: "processed" });
  } catch (error) {
    console.error("account event sync failed", { event: notification.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
