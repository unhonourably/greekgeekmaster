import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CHAPTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/i;

export async function GET(_request: Request, ctx: RouteContext<"/api/chapter-media/[chapterId]/[file]">) {
  const { chapterId, file } = await ctx.params;
  if (!CHAPTER.test(chapterId) || !FILE.test(file)) return new Response(null, { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!rateLimit(`chapter-media-read:${user.id}`, 600, 60_000)) return new Response(null, { status: 429 });
  const supabase = await createClient();
  const { data: member } = await supabase.from("memberships").select("id").eq("chapter_id", chapterId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member) return new Response(null, { status: 404 });
  const { data, error } = await createAdminClient().storage.from("chapter-media").createSignedUrl(`${chapterId}/${file}`, 120);
  if (error || !data?.signedUrl) return new Response(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
