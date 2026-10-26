import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export const STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

export async function queueNewContacts(supabase: Client, ids: string[]): Promise<number> {
  const at = new Date().toISOString();
  let added = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("outreach_contacts")
      .update({ bulk_added_at: at })
      .in("id", ids.slice(i, i + 200))
      .eq("emails_sent", 0)
      .eq("do_not_contact", false)
      .is("bulk_added_at", null)
      .select("id");
    added += data?.length ?? 0;
  }
  return added;
}

export async function stateSchoolIds(supabase: Client, state: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; from < 3000; from += 1000) {
    const { data } = await supabase.from("universities").select("id").eq("source", "ipeds").eq("state", state).order("name").range(from, from + 999);
    const rows = (data ?? []) as Array<{ id: string }>;
    ids.push(...rows.map((row) => row.id));
    if (rows.length < 1000) break;
  }
  return ids;
}

export async function newContactIds(supabase: Client, universityIds: string[]): Promise<string[]> {
  const chunks = Array.from({ length: Math.ceil(universityIds.length / 200) }, (_, index) => universityIds.slice(index * 200, index * 200 + 200));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const ids: string[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await supabase
        .from("outreach_contacts")
        .select("id")
        .in("university_id", chunk)
        .eq("emails_sent", 0)
        .eq("do_not_contact", false)
        .is("bulk_added_at", null)
        .order("id")
        .range(from, from + 999);
      const rows = (data ?? []) as Array<{ id: string }>;
      ids.push(...rows.map((row) => row.id));
      if (rows.length < 1000) break;
    }
    return ids;
  }));
  return [...new Set(results.flat())];
}
