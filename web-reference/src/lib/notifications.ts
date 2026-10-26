import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return count ?? 0;
});

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  chapter_id: string | null;
};

export async function listNotifications(limit = 50, before?: string): Promise<NotificationRow[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at, chapter_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  const { data } = await query;
  return (data ?? []) as NotificationRow[];
}
