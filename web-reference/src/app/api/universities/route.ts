import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { searchUniversities } from "@/lib/universities";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });
  if (!rateLimit(`university-search:${user.id}`, 240, 60_000)) return NextResponse.json({ results: [] }, { status: 429 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const supabase = await createClient();
  const results = await searchUniversities(supabase, q, 10);
  return NextResponse.json(
    { results: results.map(({ id, name, city, state, email_domains }) => ({ id, name, city, state, domains: email_domains })) },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
