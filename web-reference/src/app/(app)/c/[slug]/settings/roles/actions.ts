"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionState } from "@/lib/action-state";
import { setupLockState, setupLocked } from "@/lib/setup-access";

const schema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(60),
  description: z.string().trim().max(300).optional(),
  badge_tone: z.enum(["neutral", "accent", "gold", "slate", "green", "rose"]).catch("neutral"),
  is_officer: z.boolean(),
});

export async function saveRole(slug: string, roleId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug, "roles.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    badge_tone: formData.get("badge_tone"),
    is_officer: formData.get("is_officer") === "on",
  });
  const known = new Set<string>(PERMISSIONS);
  const permissions = formData.getAll("permissions").map(String).filter((p) => known.has(p));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_chapter_role", {
    p_chapter: chapter.id,
    p_role: roleId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_badge_tone: parsed.data.badge_tone,
    p_is_officer: parsed.data.is_officer,
    p_permissions: permissions,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  if (!roleId) redirect(`/c/${slug}/settings/roles/${data as string}?created=1`);
  return { ok: true, message: "Role saved." };
}

export async function deleteRole(slug: string, roleId: string): Promise<void> {
  const { chapter } = await requireChapter(slug, "roles.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", roleId).eq("chapter_id", chapter.id);
  if (error) redirect(`/c/${slug}/settings/roles/${roleId}?error=${encodeURIComponent(dbErrorMessage(error))}`);
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/settings/roles`);
}
