import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const viewerIsPledge = cache(async (chapterId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("am_pledge", { p_chapter: chapterId });
  if (error) return false;
  return Boolean(data);
});
