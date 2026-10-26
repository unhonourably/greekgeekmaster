import "server-only";
import { notFound } from "next/navigation";
import { personName } from "@/components/people";
import { requireChapter, type ChapterContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Stage } from "@/lib/recruitment";

export async function requireRecruitment(slug: string): Promise<ChapterContext> {
  const ctx = await requireChapter(slug, "recruitment.view");
  if (!ctx.chapter.modules?.recruitment) notFound();
  return ctx;
}

export async function loadStages(chapterId: string): Promise<Stage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("recruitment_stages").select("id, name, position, outcome").eq("chapter_id", chapterId).order("position").order("name");
  return (data ?? []) as Stage[];
}

export async function memberNames(chapterId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("memberships").select("id, profile:profiles!memberships_user_id_fkey(display_name, full_name)").eq("chapter_id", chapterId).in("id", unique);
  return new Map(
    ((data ?? []) as unknown as Array<{ id: string; profile: { display_name: string | null; full_name: string | null } | null }>).map((m) => [m.id, m.profile ? personName(m.profile) : "Member"]),
  );
}
