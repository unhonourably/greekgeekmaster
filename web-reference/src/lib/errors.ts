import type { ZodError } from "zod";
import type { ActionState } from "@/lib/action-state";

const SAFE_CODES = new Set(["22023", "42501", "23505", "P0001", "53400"]);

export function dbErrorMessage(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Try again."): string {
  if (!error) return fallback;
  if (error.code === "42501") {
    const msg = error.message ?? "";
    return msg && !/permission denied|row-level security/i.test(msg) ? capitalize(msg) : "You do not have permission to do that.";
  }
  if (error.code && SAFE_CODES.has(error.code) && error.message) return capitalize(error.message);
  if (error.code === "23514") return "One of the values is out of range.";
  return fallback;
}

function capitalize(value: string): string {
  const v = value.trim();
  const sentence = v.charAt(0).toUpperCase() + v.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function zodState(error: ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: "Check the highlighted fields.", fieldErrors };
}
