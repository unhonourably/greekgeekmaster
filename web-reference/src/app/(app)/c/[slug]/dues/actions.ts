"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { isStripeConfigured, serverEnv } from "@/lib/env";
import { createCheckoutSession, type PendingPaymentRow } from "@/lib/stripe/checkout";
import { splitIntoInstallments, validateSchedule } from "@/lib/installments";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

export async function payCharge(slug: string, formData: FormData): Promise<string> {
  const ctx = await requireChapter(slug);
  const base = `/c/${slug}/dues`;
  const ma = String(formData.get("member_assessment") ?? "");
  const inst = String(formData.get("installment") ?? "");
  if (!z.uuid().safeParse(ma).success) return `${base}?error=invalid`;
  if (inst && !z.uuid().safeParse(inst).success) return `${base}?error=invalid`;
  if (!isStripeConfigured()) return `${base}?error=stripe`;
  if (!rateLimit(`checkout:${ctx.user.id}`, 10, 10 * 60_000)) return `${base}?error=rate`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pending_payment", { p_member_assessment: ma, p_installment: inst || null, p_amount: null });
  if (error || !data) return `${base}?error=${encodeURIComponent(dbErrorMessage(error, "Could not start the payment.").slice(0, 160))}`;
  const payment = data as PendingPaymentRow;
  const { data: charge } = await supabase.from("member_assessment_balances").select("title").eq("id", ma).maybeSingle();
  const app = serverEnv.appUrl();
  const url = await createCheckoutSession({
    payment,
    description: charge?.title ?? "Chapter dues",
    chapterName: [ctx.chapter.organization_name, ctx.chapter.designation].filter(Boolean).join(", "),
    customerEmail: ctx.user.email,
    successUrl: `${app}${base}?checkout=success&payment=${payment.id}`,
    cancelUrl: `${app}${base}?checkout=canceled`,
  });
  return url;
}

export async function createPlan(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug);
  const ma = String(formData.get("member_assessment") ?? "");
  const count = Number(formData.get("count"));
  const outstanding = Number(formData.get("outstanding"));
  const firstDate = String(formData.get("first_date") ?? "");
  if (!z.uuid().safeParse(ma).success || !Number.isInteger(count) || count < 2 || count > 12) return { error: "Choose a number of installments." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return { error: "Choose the first payment date." };
  if (formData.get("consent") !== "on") return { fieldErrors: { consent: "Agree to the payment schedule" } };
  const supabase = await createClient();
  const { data: row } = await supabase.from("member_assessment_balances").select("outstanding_cents, title").eq("id", ma).maybeSingle();
  if (!row || Number(row.outstanding_cents) !== outstanding) return { error: "Your balance changed. Reload the page and try again." };
  let planned;
  try {
    planned = splitIntoInstallments(Number(row.outstanding_cents), count, firstDate);
  } catch (e) {
    return { error: e instanceof RangeError ? "Your balance is too small for that many installments." : "Could not build the schedule." };
  }
  const invalid = validateSchedule(planned, Number(row.outstanding_cents));
  if (invalid) return { error: invalid };
  const schedule = planned.map((s) => ({ amount_cents: s.amountCents, due_date: s.dueDate }));
  const consent = `I agree to pay ${row.title} in ${count} installments: ${schedule.map((s) => `$${(s.amount_cents / 100).toFixed(2)} by ${s.due_date}`).join(", ")}. Each installment is paid separately when I choose to pay it.`;
  const { error } = await supabase.rpc("create_installment_plan", { p_member_assessment: ma, p_schedule: schedule, p_consent_text: consent });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/dues`);
  return { ok: true, message: "Installment plan created." };
}

export async function cancelPlan(slug: string, planId: string): Promise<void> {
  await requireChapter(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_installment_plan", { p_plan: planId });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/c/${slug}/dues`);
}
