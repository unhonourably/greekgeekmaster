import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`export:${user.id}`, 10, 60 * 60_000)) return NextResponse.json({ error: "Too many downloads. Try again later." }, { status: 429 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_my_data");
  if (error || !data) return NextResponse.json({ error: "Could not prepare your data." }, { status: 500 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="greekgeek-data.json"',
      "Cache-Control": "no-store",
    },
  });
}