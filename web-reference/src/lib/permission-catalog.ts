import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PermissionSet } from "@/lib/permissions";

export async function permissionOptions(mine: PermissionSet) {
  const supabase = await createClient();
  const { data } = await supabase.from("permissions").select("key, category, description, sensitive").order("category").order("key");
  return (data ?? []).map((p) => ({
    key: p.key as string,
    category: p.category as string,
    description: p.description as string,
    sensitive: Boolean(p.sensitive),
    held: mine.has(p.key as never),
  }));
}
