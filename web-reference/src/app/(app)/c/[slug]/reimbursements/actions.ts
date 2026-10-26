"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { parseDollarsToCents } from "@/lib/money";
import { formField, optionalText, todayIn } from "@/lib/modules";
import type { ActionState } from "@/lib/action-state";

const requestSchema = z.object({
  description: z.string().min(3, "Describe the purchase").max(500),
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the purchase date"),
});

function refresh(slug: string) {
  revalidatePath(`/c/${slug}/reimbursements`);
  revalidatePath(`/c/${slug}/finances/reimbursements`);
}

export async function requestReimbursement(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug);
  if (!rateLimit(`reimburse:${user.id}`, 10, 60 * 60_000)) return { error: "Too many requests. Try again later." };
  const parsed = requestSchema.safeParse({ description: formField(formData, "description"), spent_on: formField(formData, "spent_on") });
  if (!parsed.success) return zodState(parsed.error);
  const amount = parseDollarsToCents(formField(formData, "amount"));
  if (amount === null || amount <= 0) return { fieldErrors: { amount: "Enter the amount you spent" } };
  if (amount > 5_000_000) return { fieldErrors: { amount: "Requests over $50,000 must be handled directly with your treasurer" } };
  if (parsed.data.spent_on > todayIn(chapter.timezone, Date.now())) return { fieldErrors: { spent_on: "Purchase date cannot be in the future" } };
  const supabase = await createClient();
  const { error } = await supabase.from("reimbursement_requests").insert({ chapter_id: chapter.id, user_id: user.id, amount_cents: amount, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Request submitted to the treasurer." };
}

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "paid"]),
  note: z.string().max(500).nullable(),
  paid_reference: z.string().max(120).nullable(),
});

export async function reviewReimbursement(slug: string, id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.manage");
  const parsed = reviewSchema.safeParse({ decision: formField(formData, "decision"), note: optionalText(formData, "note"), paid_reference: optionalText(formData, "paid_reference") });
  if (!parsed.success) return { error: "Pick a decision." };
  if (parsed.data.decision === "rejected" && !parsed.data.note) return { fieldErrors: { note: "Tell the member why it was not approved" } };
  if (parsed.data.decision === "paid" && !parsed.data.paid_reference) return { fieldErrors: { paid_reference: "Record how it was paid, such as a check number or transfer ID" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_reimbursement", { p_request: id, p_status: parsed.data.decision, p_note: parsed.data.note ?? "", p_paid_reference: parsed.data.paid_reference ?? "" });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: parsed.data.decision === "paid" ? "Marked as paid." : parsed.data.decision === "approved" ? "Approved." : "Rejected." };
}
