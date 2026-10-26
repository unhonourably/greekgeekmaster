import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { ingestResendEvent, verifyResendSignature, type ResendEvent } from "@/lib/outreach-mail";

export async function POST(request: NextRequest) {
  const secret = serverEnv.resendWebhookSecret();
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  const payload = await request.text();
  if (!verifyResendSignature(payload, request.headers, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  try {
    await ingestResendEvent(event);
  } catch (error) {
    console.error("resend webhook failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
