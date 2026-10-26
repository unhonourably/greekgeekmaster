import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

export function hmac(purpose: string, value: string): string {
  return createHmac("sha256", serverEnv.signingSecret()).update(`${purpose}:${value}`).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signPayload(purpose: string, payload: Record<string, string | number>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(purpose, body)}`;
}

export function verifyPayload<T extends Record<string, string | number>>(purpose: string, token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(signature, hmac(purpose, body))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
