import "server-only";
import { notFound } from "next/navigation";
import { personName } from "@/components/people";
import { requireChapter, type ChapterContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { viewerIsPledge } from "@/lib/pledge";
import type { ChapterModule, Permission } from "@/lib/permissions";

export async function requireModule(slug: string, module: ChapterModule, permission?: Permission): Promise<ChapterContext> {
  const ctx = await requireChapter(slug, permission);
  if (!ctx.chapter.modules?.[module]) notFound();
  if (module === "housing" && (await viewerIsPledge(ctx.chapter.id))) notFound();
  return ctx;
}

export type MemberOption = { id: string; userId: string; name: string };

export async function activeMembers(chapterId: string): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, user_id, profile:profiles!memberships_user_id_fkey(display_name, full_name)")
    .eq("chapter_id", chapterId)
    .eq("status", "active")
    .limit(1000);
  return ((data ?? []) as unknown as Array<{ id: string; user_id: string; profile: { display_name: string | null; full_name: string | null } | null }>)
    .map((m) => ({ id: m.id, userId: m.user_id, name: m.profile ? personName(m.profile) : "Member" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function todayIn(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

export function formField(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function optionalText(formData: FormData, name: string): string | null {
  const v = formField(formData, name);
  return v ? v : null;
}
