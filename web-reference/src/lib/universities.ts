import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UniversityMatch = { id: string; name: string; city: string | null; state: string | null; email_domains: string[] };

export async function searchUniversities(supabase: SupabaseClient, query: string, limit = 12): Promise<UniversityMatch[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const { data } = await supabase.rpc("search_universities", { p_query: q, p_limit: limit });
  return ((data ?? []) as UniversityMatch[]).map((u) => ({ ...u, email_domains: u.email_domains ?? [] }));
}
