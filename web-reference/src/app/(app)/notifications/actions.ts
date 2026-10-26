"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead(): Promise<void> {
  await requireUser("/notifications");
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/", "layout");
}

export async function openNotification(id: string): Promise<void> {
  const user = await requireUser("/notifications");
  if (!z.uuid().safeParse(id).success) redirect("/notifications");
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("link").eq("id", id).eq("user_id", user.id).maybeSingle();
  await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  revalidatePath("/", "layout");
  const link = (data?.link as string | null) ?? "/notifications";
  redirect(link.startsWith("/") && !link.startsWith("//") ? link : "/notifications");
}
