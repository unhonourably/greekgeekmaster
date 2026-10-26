import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/modules";
import { dbErrorMessage } from "@/lib/errors";

export type Incident = {
  id: string;
  category: string;
  occurred_at: string | null;
  location: string | null;
  description: string;
  people_involved: string | null;
  status: "submitted" | "under_review" | "resolved" | "closed";
  reporter_name: string | null;
  assigned_to: string | null;
  created_at: string;
  note_count: number;
};

export async function loadIncidents(slug: string) {
  const ctx = await requireModule(slug, "standards");
  if (!ctx.can("standards.manage")) redirect(`/c/${slug}/standards`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_incident_reports", { p_chapter: ctx.chapter.id });
  return { ctx, incidents: (data ?? []) as Incident[], error: error ? dbErrorMessage(error) : null };
}
