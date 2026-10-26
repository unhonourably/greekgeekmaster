"use server";

import { revalidatePath } from "next/cache";
import { requireChapter } from "@/lib/auth";
import { isSkippableStep } from "@/lib/chapter-setup";
import { setupLocked } from "@/lib/setup-access";
import { createClient } from "@/lib/supabase/server";

async function skippedList(chapterId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("chapters").select("setup_skipped").eq("id", chapterId).single();
  return Array.isArray(data?.setup_skipped) ? (data.setup_skipped as string[]) : [];
}

export async function skipSetupStep(slug: string, step: string): Promise<void> {
  if (!isSkippableStep(step)) return;
  const { chapter } = await requireChapter(slug, "chapter.manage");
  if (await setupLocked(chapter.id)) return;
  const current = await skippedList(chapter.id);
  if (current.includes(step)) return;
  const supabase = await createClient();
  await supabase.from("chapters").update({ setup_skipped: [...current, step] }).eq("id", chapter.id);
  revalidatePath(`/c/${slug}`, "layout");
}

export async function restoreSetupStep(slug: string, step: string): Promise<void> {
  if (!isSkippableStep(step)) return;
  const { chapter } = await requireChapter(slug, "chapter.manage");
  if (await setupLocked(chapter.id)) return;
  const current = await skippedList(chapter.id);
  const supabase = await createClient();
  await supabase.from("chapters").update({ setup_skipped: current.filter((id) => id !== step) }).eq("id", chapter.id);
  revalidatePath(`/c/${slug}`, "layout");
}
