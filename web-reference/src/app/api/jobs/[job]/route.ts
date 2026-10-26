import { NextResponse, type NextRequest } from "next/server";
import { JOBS, isAuthorizedCron, isJobName } from "@/lib/jobs";

async function run(request: NextRequest, ctx: RouteContext<"/api/jobs/[job]">) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!isJobName(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const started = Date.now();
  try {
    const result = await JOBS[job]();
    return NextResponse.json({ job, ok: true, ...result, ms: Date.now() - started });
  } catch (e) {
    console.error(`[job:${job}]`, e instanceof Error ? e.message : e);
    return NextResponse.json({ job, ok: false, error: "job failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
