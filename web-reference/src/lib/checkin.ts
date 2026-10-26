import "server-only";
import { signPayload, verifyPayload } from "@/lib/crypto";

export const CHECKIN_WINDOW_MS = 30_000;
const TOLERANCE = 4;

export function checkInToken(eventId: string, at: number = Date.now()): string {
  return signPayload("event-checkin", { e: eventId, w: Math.floor(at / CHECKIN_WINDOW_MS) });
}

export function verifyCheckInToken(token: string, eventId: string, at: number = Date.now()): boolean {
  if (token.length > 400) return false;
  const payload = verifyPayload<{ e: string; w: number }>("event-checkin", token);
  if (!payload || payload.e !== eventId || typeof payload.w !== "number") return false;
  const current = Math.floor(at / CHECKIN_WINDOW_MS);
  return payload.w <= current && current - payload.w <= TOLERANCE;
}
