import "server-only";
import { serverEnv } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured");
    this.name = "EmailNotConfiguredError";
  }
}

export async function sendEmail(message: OutgoingEmail): Promise<{ id: string | null; delivered: boolean }> {
  const apiKey = serverEnv.resendApiKey();
  if (!apiKey) {
    if (serverEnv.isProduction()) throw new EmailNotConfiguredError();
    console.info(`[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    return { id: null, delivered: false };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
    },
    body: JSON.stringify(payload(message)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email provider responded ${response.status}`);
  const data = (await response.json()) as { id?: string };
  return { id: data.id ?? null, delivered: true };
}

export const BATCH_LIMIT = 100;

export type BatchResult =
  | { ok: true; ids: Array<string | null>; waitMs: number }
  | { ok: false; error: string; stop: boolean };

export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seconds(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function payload(message: OutgoingEmail) {
  return {
    from: message.from ?? serverEnv.emailFrom(),
    to: [message.to],
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    ...(message.headers ? { headers: message.headers } : {}),
  };
}

export async function sendEmailBatch(messages: OutgoingEmail[], idempotencyKey: string): Promise<BatchResult> {
  const apiKey = serverEnv.resendApiKey();
  if (!apiKey) return { ok: false, error: "Email delivery is not configured.", stop: true };
  if (messages.length === 0) return { ok: true, ids: [], waitMs: 0 };
  if (messages.length > BATCH_LIMIT) return { ok: false, error: `A batch can hold at most ${BATCH_LIMIT} emails.`, stop: true };
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(messages.map(payload)),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt < attempts) {
        await pause(1000 * 2 ** attempt);
        continue;
      }
      return { ok: false, error: error instanceof Error ? error.message : "Could not reach Resend.", stop: true };
    }
    if (response.ok) {
      const data = (await response.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
      const remaining = response.headers.get("ratelimit-remaining");
      const waitMs = remaining === "0" ? seconds(response.headers.get("ratelimit-reset")) * 1000 : 0;
      return { ok: true, ids: messages.map((_, index) => data?.data?.[index]?.id ?? null), waitMs };
    }
    const body = (await response.json().catch(() => null)) as { name?: string; message?: string } | null;
    if (body?.name === "daily_quota_exceeded") return { ok: false, error: "Resend's daily sending limit is used up. It resets at midnight UTC.", stop: true };
    if (body?.name === "monthly_quota_exceeded") return { ok: false, error: "Resend's monthly sending limit is used up.", stop: true };
    if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
      await pause(Math.min(seconds(response.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt, 15_000));
      continue;
    }
    const reason = body?.message ?? `Email provider responded ${response.status}`;
    return { ok: false, error: reason, stop: response.status !== 422 && response.status !== 400 };
  }
  return { ok: false, error: "Resend kept asking us to slow down. Try again in a minute.", stop: true };
}
