"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { parseDollarsToCents } from "@/lib/money";
import { formField, optionalText, todayIn } from "@/lib/modules";
import type { ActionState } from "@/lib/action-state";

export async function addBudgetLine(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "finance.manage");
  const parsed = z
    .object({ category: z.string().min(2, "Name the category").max(60), term_id: z.string().uuid().nullable().catch(null) })
    .safeParse({ category: formField(formData, "category"), term_id: optionalText(formData, "term_id") });
  if (!parsed.success) return zodState(parsed.error);
  const planned = parseDollarsToCents(formField(formData, "planned"));
  if (planned === null || planned < 0) return { fieldErrors: { planned: "Enter the planned amount" } };
  const supabase = await createClient();
  const { error } = await supabase.from("budget_lines").insert({ chapter_id: chapter.id, created_by: user.id, planned_cents: planned, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/finances/budget`);
  return { ok: true, message: "Budget line added." };
}

export async function recordExpense(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "finance.manage");
  const parsed = z
    .object({
      description: z.string().min(2, "Describe the expense").max(200),
      vendor: z.string().max(120).nullable(),
      spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
      budget_line_id: z.string().uuid().nullable().catch(null),
    })
    .safeParse({
      description: formField(formData, "description"),
      vendor: optionalText(formData, "vendor"),
      spent_on: formField(formData, "spent_on"),
      budget_line_id: optionalText(formData, "budget_line_id"),
    });
  if (!parsed.success) return zodState(parsed.error);
  const amount = parseDollarsToCents(formField(formData, "amount"));
  if (amount === null || amount <= 0) return { fieldErrors: { amount: "Enter the amount" } };
  if (parsed.data.spent_on > todayIn(chapter.timezone, Date.now())) return { fieldErrors: { spent_on: "Date cannot be in the future" } };
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({ chapter_id: chapter.id, recorded_by: user.id, amount_cents: amount, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/finances/budget`);
  return { ok: true, message: "Expense recorded." };
}
