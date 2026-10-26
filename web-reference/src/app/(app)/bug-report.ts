"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { getMyProfile, requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { renderEmailHtml } from "@/lib/email-template";
import { serverEnv } from "@/lib/env";
import { zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const ADMIN = "admin@greekgeek.org";

const reportSchema = z.object({
  message: z.string().trim().min(10, "Add a little more detail, at least 10 characters.").max(3000, "Keep it under 3,000 characters."),
  expected: z.string().trim().max(900, "Keep it under 900 characters."),
  impact: z.enum(["blocked", "annoying", "minor", ""]),
});

const IMPACT: Record<string, string> = { blocked: "It stops me from doing something", annoying: "I can work around it", minor: "Small or cosmetic" };

export async function reportBug(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const fields = reportSchema.safeParse({
    message: String(formData.get("message") ?? ""),
    expected: String(formData.get("expected") ?? ""),
    impact: String(formData.get("impact") ?? ""),
  });
  if (!fields.success) {
    const state = zodState(fields.error);
    const first = Object.values(state.fieldErrors ?? {})[0];
    return { ...state, error: first ?? "Check the form and try again." };
  }
  const { expected, impact } = fields.data;
  const report = [
    fields.data.message,
    expected ? `Expected: ${expected}` : "",
    impact ? `Impact: ${IMPACT[impact]}` : "",
  ].filter(Boolean).join("\n\n");
  if (!rateLimit(`bug:${user.id}`, 5, 60 * 60_000)) return { error: "You have sent several reports. Try again later." };
  const profile = await getMyProfile();
  const name = profile?.full_name || profile?.display_name || user.email || "A member";
  const rawPage = String(formData.get("page") ?? "");
  const page = rawPage.startsWith("/") && !rawPage.startsWith("//") ? rawPage.slice(0, 300) : "Unknown page";
  const rawViewport = String(formData.get("viewport") ?? "");
  const viewport = /^\d{2,5}x\d{2,5}$/.test(rawViewport) ? rawViewport : null;
  const agent = ((await headers()).get("user-agent") ?? "").slice(0, 300);
  const build = serverEnv.buildId();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_bug_report", { p_message: report, p_page: page, p_user_agent: agent || null, p_viewport: viewport, p_build: build });
  if (error && /too many reports/i.test(error.message)) return { error: "You have sent several reports. Try again later." };
  const saved = (Array.isArray(data) ? data[0] : data) as { id: string; number: number } | null;
  if (saved) revalidatePath("/admin", "layout");

  const link = saved ? `${serverEnv.appUrl()}/admin/bugs/${saved.id}` : null;
  const paragraphs = [
    `${name} (${user.email}) reported a bug${saved ? ` (#${saved.number})` : ""}.`,
    report,
    `Page: ${page}`,
    agent ? `Browser: ${agent}` : "",
    viewport ? `Screen: ${viewport}` : "",
    build ? `Build: ${build}` : "",
  ].filter(Boolean);
  try {
    const result = await sendEmail({
      to: ADMIN,
      replyTo: user.email || undefined,
      subject: saved ? `Bug #${saved.number} from ${name}` : `Bug report from ${name}`,
      text: [...paragraphs, link ? `Open it: ${link}` : ""].filter(Boolean).join("\n\n"),
      html: renderEmailHtml({
        appUrl: serverEnv.appUrl(),
        preheader: `${name} reported a bug.`,
        heading: saved ? `Bug #${saved.number}` : "Bug report",
        paragraphs,
        action: link ? { label: "Open in bug reports", url: link } : null,
        note: user.email ? `Reply to ${user.email} to follow up.` : null,
      }),
    });
    if (!result.delivered && !saved) return { ok: true, message: `Email delivery is not turned on here. Write ${ADMIN} directly.` };
  } catch {
    if (!saved) return { error: "The report could not be sent. Try again." };
  }
  return { ok: true, message: saved ? `Sent as bug #${saved.number}. We will follow up by email.` : "Sent. We will follow up by email." };
}
