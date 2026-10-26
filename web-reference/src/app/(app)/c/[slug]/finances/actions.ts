"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminRpc } from "@/lib/supabase/admin";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { parseDollarsToCents } from "@/lib/money";
import { createStripeRefund } from "@/lib/stripe/checkout";
import { isStripeConfigured } from "@/lib/env";
import type { ActionState } from "@/lib/action-state";

const dollars = (label: string, min = 50) =>
  z.string().transform((v, ctx) => {
    const cents = parseDollarsToCents(v);
    if (cents === null || cents < min) {
      ctx.addIssue({ code: "custom", message: `Enter ${label} of at least $${(min / 100).toFixed(2)}` });
      return z.NEVER;
    }
    return cents;
  });

const assessmentSchema = z.object({
  title: z.string().trim().min(2, "Enter a title").max(120),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  category: z.enum(["dues", "new_member_fee", "fine", "housing", "event", "other"]),
  amount: dollars("an amount"),
  due_date: z.iso.date("Choose a due date"),
  late_fee: z.string().optional().transform((v) => (v ? parseDollarsToCents(v) ?? -1 : 0)).refine((v) => v >= 0 && v <= 100000, "Late fee must be between $0 and $1,000"),
  late_fee_grace_days: z.coerce.number().int().min(0).max(90),
  allow_installments: z.boolean(),
  max_installments: z.coerce.number().int().min(1).max(12),
});

function parseAssessment(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = assessmentSchema.safeParse({
    ...raw,
    late_fee_grace_days: raw.late_fee_grace_days || "0",
    allow_installments: raw.allow_installments === "on",
    max_installments: raw.allow_installments === "on" ? raw.max_installments || "4" : "1",
  });
  if (!parsed.success) return { raw, state: { ...zodState(parsed.error), values: raw } as ActionState };
  if (parsed.data.allow_installments && parsed.data.max_installments < 2) return { raw, state: { fieldErrors: { max_installments: "Allow at least 2 installments" }, values: raw } as ActionState };
  return { raw, value: parsed.data };
}

export async function updateAssessment(slug: string, assessmentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug, "finance.manage");
  const { raw, state, value: v } = parseAssessment(formData);
  if (!v) return state;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dues_assessments")
    .update({
      title: v.title,
      description: v.description,
      category: v.category,
      default_amount_cents: v.amount,
      due_date: v.due_date,
      late_fee_cents: v.late_fee,
      late_fee_grace_days: v.late_fee_grace_days,
      allow_installments: v.allow_installments,
      max_installments: v.max_installments,
    })
    .eq("id", assessmentId)
    .eq("chapter_id", chapter.id)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: dbErrorMessage(error), values: raw };
  if (!data?.length) return { error: "Only drafts can be edited. This charge has already been sent.", values: raw };
  revalidatePath(`/c/${slug}/finances`, "layout");
  return { ok: true, message: "Draft saved.", values: raw };
}

export async function createAssessment(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "finance.manage");
  const { raw, state, value: v } = parseAssessment(formData);
  if (!v) return state;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dues_assessments")
    .insert({
      chapter_id: chapter.id,
      title: v.title,
      description: v.description,
      category: v.category,
      default_amount_cents: v.amount,
      due_date: v.due_date,
      late_fee_cents: v.late_fee,
      late_fee_grace_days: v.late_fee_grace_days,
      allow_installments: v.allow_installments,
      max_installments: v.max_installments,
      created_by: user.id,
      currency: chapter.currency,
    })
    .select("id")
    .single();
  if (error || !data) return { error: dbErrorMessage(error), values: raw };
  redirect(`/c/${slug}/finances/assessments/${data.id}`);
}

export async function issueAssessment(slug: string, assessmentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.manage");
  const exempt = [...new Set(formData.getAll("exempt").map(String))].filter((id) => z.uuid().safeParse(id).success);
  const ids = formData.getAll("membership").map(String).filter((id) => z.uuid().safeParse(id).success && !exempt.includes(id));
  if (ids.length === 0) return { error: "Select at least one member." };
  const overrides: Record<string, number> = {};
  for (const id of ids) {
    const raw = String(formData.get(`amount_${id}`) ?? "").trim();
    if (raw) {
      const cents = parseDollarsToCents(raw);
      if (cents === null || cents < 50) return { error: "Custom amounts must be at least $0.50." };
      overrides[id] = cents;
    }
  }
  const supabase = await createClient();
  if (formData.has("exemptions_set")) {
    const { error: exemptError } = await supabase.rpc("set_assessment_exemptions", { p_assessment: assessmentId, p_memberships: exempt });
    if (exemptError) return { error: dbErrorMessage(exemptError) };
  }
  const { data, error } = await supabase.rpc("issue_dues_assessment", { p_assessment: assessmentId, p_memberships: ids, p_amount_overrides: overrides });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/finances`, "layout");
  return { ok: true, message: `Sent to ${data} member${data === 1 ? "" : "s"}${exempt.length ? `, ${exempt.length} exempt` : ""}. They have been notified.` };
}

export async function setAssessmentStatus(slug: string, assessmentId: string, status: "closed" | "cancelled"): Promise<void> {
  const { chapter } = await requireChapter(slug, "finance.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("dues_assessments").update({ status }).eq("id", assessmentId).eq("chapter_id", chapter.id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/c/${slug}/finances`, "layout");
}

const offlineSchema = z.object({
  member_assessment: z.uuid(),
  amount: dollars("an amount"),
  method: z.enum(["cash", "check", "external_app", "other"]),
  reference: z.string().trim().max(120).optional(),
  received_on: z.iso.date("Choose the date received"),
  memo: z.string().trim().max(500).optional(),
  request_key: z.uuid(),
});

export async function recordOfflinePayment(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.manage");
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = offlineSchema.safeParse(raw);
  if (!parsed.success) return { ...zodState(parsed.error), values: raw };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_offline_payment", {
    p_member_assessment: v.member_assessment,
    p_amount: v.amount,
    p_method: v.method,
    p_reference: v.reference ?? null,
    p_received_on: v.received_on,
    p_memo: v.memo ?? null,
    p_request_key: v.request_key,
  });
  if (error) return { error: dbErrorMessage(error), values: raw };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Payment recorded and receipt issued.", values: { request_key: randomUUID() } };
}

const creditSchema = z.object({
  member_assessment: z.uuid(),
  amount: dollars("a credit"),
  reason: z.string().trim().min(3, "Explain the credit").max(500),
  request_key: z.uuid(),
});

const memberChargeSchema = z.object({
  assessment: z.uuid("Pick an assessment"),
  amount: dollars("an amount"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date"),
});

export async function chargeMember(slug: string, membershipId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.manage");
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = memberChargeSchema.safeParse(raw);
  if (!parsed.success) return { ...zodState(parsed.error), values: raw };
  const supabase = await createClient();
  const { error } = await supabase.rpc("charge_member_assessment", {
    p_assessment: parsed.data.assessment,
    p_membership: membershipId,
    p_amount_cents: parsed.data.amount,
    p_due_date: parsed.data.due_date,
  });
  if (error) return { error: dbErrorMessage(error), values: raw };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Charge added. The member was notified." };
}

export async function issueCredit(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.manage");
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = creditSchema.safeParse(raw);
  if (!parsed.success) return { ...zodState(parsed.error), values: raw };
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_member_credit", {
    p_member_assessment: parsed.data.member_assessment,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
    p_request_key: parsed.data.request_key,
  });
  if (error) return { error: dbErrorMessage(error), values: raw };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Credit applied.", values: { request_key: randomUUID() } };
}

export async function voidMemberAssessment(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.manage");
  const id = String(formData.get("member_assessment") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!z.uuid().safeParse(id).success) return { error: "Choose an assessment." };
  if (reason.length < 3) return { fieldErrors: { reason: "Explain why this charge is voided" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_member_assessment", { p_member_assessment: id, p_reason: reason.slice(0, 500) });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Charge voided." };
}

export async function requestRefund(slug: string, paymentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireChapter(slug, "finance.refund");
  if (!isStripeConfigured()) return { error: "Stripe is not configured on this server." };
  const amount = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (amount === null || amount <= 0) return { fieldErrors: { amount: "Enter a refund amount" } };
  if (reason.length < 3) return { fieldErrors: { reason: "Explain the refund" } };
  const supabase = await createClient();
  const { data: refund, error } = await supabase.rpc("request_refund", { p_payment: paymentId, p_amount: amount, p_reason: reason.slice(0, 500) });
  if (error || !refund) return { error: dbErrorMessage(error) };
  const { data: payment } = await supabase.from("payments").select("stripe_charge_id, stripe_payment_intent_id, stripe_account_id").eq("id", paymentId).single();
  if (!payment?.stripe_account_id) return { error: "This payment has no Stripe account." };
  const r = refund as { id: string; expected_fee_refund_cents: number };
  try {
    const created = await createStripeRefund({
      refundId: r.id,
      chargeId: payment.stripe_charge_id,
      paymentIntentId: payment.stripe_payment_intent_id,
      amountCents: amount,
      stripeAccount: payment.stripe_account_id,
      refundApplicationFee: Number(r.expected_fee_refund_cents) > 0,
    });
    if (created.charge) {
      await adminRpc()("service_sync_refund", {
        p_refund: r.id,
        p_stripe_refund: created.id,
        p_charge: created.charge,
        p_amount: created.amount,
        p_status: created.status ?? "pending",
        p_failure_reason: null,
        p_event: null,
      });
    }
  } catch (e) {
    await adminRpc()("service_sync_refund", {
      p_refund: r.id,
      p_stripe_refund: null,
      p_charge: payment.stripe_charge_id,
      p_amount: amount,
      p_status: "failed",
      p_failure_reason: e instanceof Error ? e.message.slice(0, 300) : "Stripe rejected the refund",
      p_event: null,
    }).catch(() => undefined);
    return { error: "Stripe could not create the refund. Nothing was refunded." };
  }
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Refund submitted. Stripe confirms it shortly; the ledger updates automatically." };
}
