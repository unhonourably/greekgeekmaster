import { NextResponse, type NextRequest } from "next/server";
import { getChapterContext } from "@/lib/auth";
import { stripeRedirectOrigin } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOnboardingLink } from "@/lib/stripe/connect";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("chapter") ?? "";
  const ctx = /^[a-z0-9-]{3,80}$/.test(slug) ? await getChapterContext(slug) : null;
  const fallback = request.nextUrl.clone();
  fallback.search = "";
  if (!ctx || !ctx.can("payments.configure")) {
    fallback.pathname = "/home";
    return NextResponse.redirect(fallback);
  }
  const { data } = await createAdminClient().from("connected_accounts").select("stripe_account_id").eq("chapter_id", ctx.chapter.id).maybeSingle();
  if (!data?.stripe_account_id) {
    fallback.pathname = `/c/${slug}/settings/billing`;
    return NextResponse.redirect(fallback);
  }
  const app = stripeRedirectOrigin(request.nextUrl.origin);
  const url = await createOnboardingLink(
    data.stripe_account_id,
    `${app}/api/connect/refresh?chapter=${encodeURIComponent(slug)}`,
    `${app}/api/connect/return?chapter=${encodeURIComponent(slug)}`,
  );
  return NextResponse.redirect(url);
}
