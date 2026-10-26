import { NextResponse, type NextRequest } from "next/server";
import { getChapterContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnectedAccount } from "@/lib/stripe/connect";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("chapter") ?? "";
  const target = request.nextUrl.clone();
  target.search = "";
  const ctx = /^[a-z0-9-]{3,80}$/.test(slug) ? await getChapterContext(slug) : null;
  if (!ctx || !ctx.can("payments.configure")) {
    target.pathname = "/home";
    return NextResponse.redirect(target);
  }
  const { data } = await createAdminClient().from("connected_accounts").select("stripe_account_id").eq("chapter_id", ctx.chapter.id).maybeSingle();
  if (data?.stripe_account_id) {
    try {
      await syncConnectedAccount(data.stripe_account_id);
    } catch {
      target.searchParams.set("connect", "sync_failed");
    }
  }
  target.pathname = `/c/${slug}/settings/billing`;
  if (!target.searchParams.has("connect")) target.searchParams.set("connect", "returned");
  return NextResponse.redirect(target);
}
