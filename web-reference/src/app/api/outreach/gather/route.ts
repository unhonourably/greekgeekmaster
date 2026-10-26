import { NextResponse, type NextRequest } from "next/server";
import { gatherSchool } from "@/app/(app)/admin/outreach/gather";
import { getStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 150;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const role = await getStaffRole();
  if (role !== "admin") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Pick a school." }, { status: 400 });
  const summary = await gatherSchool(await createClient(), id);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
