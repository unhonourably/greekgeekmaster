import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export function verifyResendSignature(payload: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(Date.now() / 1000 - sent) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return signature.split(" ").some((part) => {
    const value = part.startsWith("v1,") ? part.slice(3) : "";
    return value.length === expected.length && safeEqual(value, expected);
  });
}

export type ResendEvent = { type?: string; created_at?: string; data?: Record<string, unknown> };

type EmailRow = { id: string; status: string; delivered_at: string | null; opened_at: string | null; open_count: number; clicked_at: string | null; click_count: number };

export async function ingestResendEvent(event: ResendEvent): Promise<void> {
  const admin = createAdminClient();
  const data = event.data ?? {};
  const at = event.created_at ?? new Date().toISOString();
  if (event.type === "email.received") {
    await recordInboundReply(data, at);
    return;
  }
  const providerId = text(data.email_id);
  if (!providerId) return;
  const { data: row } = await admin
    .from("outreach_emails")
    .select("id, status, delivered_at, opened_at, open_count, clicked_at, click_count")
    .eq("provider_id", providerId)
    .eq("direction", "sent")
    .maybeSingle();
  const email = row as EmailRow | null;
  if (!email) return;
  const patch: Record<string, unknown> = {};
  if (event.type === "email.delivered") {
    patch.delivered_at = email.delivered_at ?? at;
    if (email.status === "sent") patch.status = "delivered";
  } else if (event.type === "email.opened") {
    patch.opened_at = email.opened_at ?? at;
    patch.open_count = email.open_count + 1;
  } else if (event.type === "email.clicked") {
    patch.clicked_at = email.clicked_at ?? at;
    patch.click_count = email.click_count + 1;
  } else if (event.type === "email.bounced") {
    patch.status = "bounced";
    patch.bounced_at = at;
    patch.error = "The receiving server rejected this email.";
  } else if (event.type === "email.complained") {
    const { data: owner } = await admin.from("outreach_emails").select("contact_id").eq("id", email.id).single();
    if (owner) await admin.from("outreach_contacts").update({ do_not_contact: true }).eq("id", owner.contact_id);
    return;
  } else {
    return;
  }
  const { error } = await admin.from("outreach_emails").update(patch).eq("id", email.id);
  if (error) throw new Error(error.message);
}

async function recordInboundReply(data: Record<string, unknown>, at: string): Promise<void> {
  const admin = createAdminClient();
  const providerId = text(data.email_id);
  const from = parseAddress(text(data.from));
  if (!providerId || !from.email) return;
  const { data: contact } = await admin.from("outreach_contacts").select("id").eq("email_normalized", from.email.toLowerCase()).maybeSingle();
  if (!contact) return;
  let body = text(data.text);
  if (!body && serverEnv.resendApiKey()) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${providerId}`, {
      headers: { Authorization: `Bearer ${serverEnv.resendApiKey()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) body = ((await response.json()) as { text?: string }).text?.trim() ?? "";
  }
  const { error } = await admin.from("outreach_emails").upsert(
    {
      contact_id: contact.id,
      direction: "reply",
      status: "received",
      subject: text(data.subject).slice(0, 300),
      body: (body || "The email provider did not include the message text.").slice(0, 50000),
      provider_id: providerId,
      from_email: from.email,
      to_email: Array.isArray(data.to) ? data.to.map(String).join(", ").slice(0, 300) : null,
      occurred_at: at,
    },
    { onConflict: "provider_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAddress(value: string): { email: string; name: string } {
  const matched = value.match(/^(.*)<([^>]+)>$/);
  if (!matched) return { email: value, name: "" };
  return { name: matched[1].replace(/"/g, "").trim(), email: matched[2].trim() };
}
