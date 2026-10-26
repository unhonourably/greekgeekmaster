import { after, NextResponse, type NextRequest } from "next/server";
import { bulkWaiting, readAutopilot, tickAutopilot } from "@/app/(app)/admin/outreach/autopilot";
import { getStaffRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

type Client = Awaited<ReturnType<typeof createClient>>;

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

function chain(origin: string) {
  let secret: string;
  try {
    secret = serverEnv.cronSecret();
  } catch {
    return;
  }
  after(async () => {
    await fetch(`${origin}/api/outreach/autopilot`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5_000) }).catch(() => null);
  });
}

async function tick(request: NextRequest) {
  const admin = createAdminClient() as unknown as Client;
  const result = await tickAutopilot(admin);
  if (result.ran && result.row?.status === "running") chain(request.nextUrl.origin);
  return NextResponse.json({ ...result, waiting: await bulkWaiting(admin) }, NO_STORE);
}

export async function GET(request: NextRequest) {
  if (isAuthorizedCron(request.headers.get("authorization"))) return tick(request);
  if (await getStaffRole() !== "admin") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const supabase = await createClient();
  const { row, missing } = await readAutopilot(supabase);
  return NextResponse.json({ row, missing, waiting: await bulkWaiting(supabase) }, NO_STORE);
}

export async function POST(request: NextRequest) {
  if (await getStaffRole() !== "admin") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return tick(request);
}
