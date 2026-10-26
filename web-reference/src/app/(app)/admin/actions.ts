"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { parseDollarsToCents } from "@/lib/money";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailManagers, emailUser } from "@/lib/product-email";
import type { ActionState } from "@/lib/action-state";

export async function reviewApplication(applicationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff(["reviewer"]);
  const decision = z.enum(["verified", "info_requested", "rejected", "suspended"]).safeParse(formData.get("decision"));
  if (!decision.success) return { fieldErrors: { decision: "Choose a decision" } };
  const message = String(formData.get("message") ?? "").trim().slice(0, 4000);
  const note = String(formData.get("internal_note") ?? "").trim().slice(0, 4000);
  if ((decision.data === "rejected" || decision.data === "info_requested" || decision.data === "suspended") && !message) {
    return { fieldErrors: { message: "Explain the decision to the applicant" } };
  }
  if (decision.data === "verified" && formData.get("confirm") !== "on") return { fieldErrors: { confirm: "Confirm that the evidence supports verification" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_chapter_application", {
    p_application: applicationId,
    p_decision: decision.data,
    p_message: message || null,
    p_internal_note: note || null,
  });
  if (error) return { error: dbErrorMessage(error) };
  const { data: app } = await supabase
    .from("chapter_applications")
    .select("applicant_id, organization_name, designation, created_chapter_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (app?.applicant_id) {
    const label = [app.organization_name, app.designation].filter(Boolean).join(" ") || "Your chapter";
    let href = `${serverEnv.appUrl()}/onboarding/${applicationId}`;
    if (decision.data === "verified" && app.created_chapter_id) {
      const { data: chapter } = await supabase.from("chapters").select("slug").eq("id", app.created_chapter_id).maybeSingle();
      if (chapter?.slug) href = `${serverEnv.appUrl()}/c/${chapter.slug}`;
    }
    const copy = {
      verified: [`${label} is verified`, `${label} is verified. You are its administrator, and members can be invited.`],
      info_requested: [`More information needed for ${label}`, message || "A reviewer needs more information before this chapter can be verified."],
      rejected: [`${label} was not verified`, message || "This application was not verified."],
      suspended: [`${label} was suspended`, message || "This chapter was suspended."],
    } as const;
    const [heading, paragraph] = copy[decision.data];
    const delivered = await emailUser(app.applicant_id as string, {
      subject: heading,
      heading,
      preheader: paragraph,
      paragraphs: [paragraph],
      action: { label: decision.data === "verified" ? "Open chapter" : "View application", url: href },
    });
    if (delivered) {
      await createAdminClient()
        .from("notifications")
        .update({ email_status: "sent" })
        .eq("user_id", app.applicant_id)
        .eq("kind", "verification_update")
        .eq("email_status", "pending");
    }
  }
  revalidatePath("/admin", "layout");
  const done = { verified: "Chapter verified. The applicant is now its administrator.", info_requested: "Request sent to the applicant.", rejected: "Application rejected.", suspended: "Chapter suspended." };
  return { ok: true, message: done[decision.data] };
}

export async function addInternalNote(applicationId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff(["reviewer"]);
  const message = String(formData.get("note") ?? "").trim().slice(0, 4000);
  if (!message) return { fieldErrors: { note: "Write a note" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_application_note", { p_application: applicationId, p_note: message });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/admin/verification/${applicationId}`);
  return { ok: true, message: "Note added." };
}

export async function setChapterStatus(chapterId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff([]);
  const status = z.enum(["verified", "suspended", "closed"]).safeParse(formData.get("status"));
  if (!status.success) return { fieldErrors: { status: "Choose a status" } };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (!reason) return { fieldErrors: { reason: "A reason is required and is recorded in the audit log" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_chapter_status", { p_chapter: chapterId, p_status: status.data, p_reason: reason });
  if (error) return { error: dbErrorMessage(error) };
  const { data: chapter } = await supabase.from("chapters").select("organization_name, designation, slug").eq("id", chapterId).maybeSingle();
  const label = [chapter?.organization_name, chapter?.designation].filter(Boolean).join(" ") || "The chapter";
  const copy = {
    verified: `${label} is verified. Members can use the chapter again.`,
    suspended: `${label} was suspended. ${reason}`,
    closed: `${label} was closed. ${reason}`,
  } as const;
  await emailManagers(chapterId, {
    subject: `${label} is ${status.data}`,
    heading: `${label} is ${status.data}`,
    preheader: copy[status.data],
    paragraphs: [copy[status.data]],
    action: chapter?.slug && status.data !== "closed" ? { label: "Open chapter", url: `${serverEnv.appUrl()}/c/${chapter.slug}` } : null,
  });
  revalidatePath("/admin/chapters", "layout");
  return { ok: true, message: "Status updated." };
}

export async function reviewClosure(requestId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff([]);
  const decision = z.enum(["accepted", "declined"]).safeParse(formData.get("decision"));
  if (!decision.success) return { error: "Choose a decision." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (decision.data === "declined" && note.length < 3) return { fieldErrors: { note: "Tell the chapter why this was declined" } };
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("chapter_closure_requests")
    .select("requested_by, chapter_id, chapter:chapters(organization_name, designation, slug)")
    .eq("id", requestId)
    .maybeSingle();
  const { error } = await supabase.rpc("review_chapter_closure", { p_request: requestId, p_decision: decision.data, p_note: note || null });
  if (error) return { error: dbErrorMessage(error) };
  const rawChapter = request?.chapter as { organization_name?: string; designation?: string | null; slug?: string } | Array<{ organization_name?: string; designation?: string | null; slug?: string }> | null;
  const chapter = Array.isArray(rawChapter) ? rawChapter[0] : rawChapter;
  const label = [chapter?.organization_name, chapter?.designation].filter(Boolean).join(" ") || "Your chapter";
  if (request?.chapter_id) {
    const accepted = decision.data === "accepted";
    await emailManagers(request.chapter_id as string, {
      subject: accepted ? `${label} is closed` : `Closure request declined for ${label}`,
      heading: accepted ? "The chapter is closed" : "Closure request declined",
      preheader: accepted ? `${label} is now closed.` : `${label} stays open.`,
      paragraphs: [
        accepted
          ? `${label} is closed. Members no longer have access. Financial records stay on file.`
          : `${label} stays open.${note ? ` Note from GreekGeek: ${note}` : ""}`,
      ],
      action: !accepted && chapter?.slug ? { label: "Open chapter", url: `${serverEnv.appUrl()}/c/${chapter.slug}` } : null,
    });
  }
  revalidatePath("/admin/closures");
  return { ok: true, message: decision.data === "accepted" ? "Chapter closed." : "Request declined." };
}

const pricingSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_-]{3,40}$/, "Use 3 to 40 lowercase letters, numbers, dashes, or underscores"),
  name: z.string().trim().min(3, "Name the rule").max(120),
  percent: z.coerce.number().min(0, "0% or more").max(10, "At most 10%"),
  fixed: z.string().trim().optional(),
  min: z.string().trim().optional(),
  max: z.string().trim().optional(),
  refund_policy: z.enum(["proportional", "none"]).catch("proportional"),
  terms_version: z.string().trim().min(1, "Version the agreement").max(40),
  terms_title: z.string().trim().min(3, "Title the agreement").max(160),
  terms_summary: z.string().trim().min(10, "Summarize what changed").max(1000),
  terms_body: z.string().trim().min(50, "Include the full agreement text").max(50000),
});

export async function publishPricing(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff([]);
  const parsed = pricingSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  const cents = (v: string | undefined, field: string): number | null | { error: string } => {
    if (!v) return null;
    const c = parseDollarsToCents(v);
    return c === null ? { error: field } : c;
  };
  const fixed = cents(d.fixed, "fixed");
  const min = cents(d.min, "min");
  const max = cents(d.max, "max");
  for (const [k, v] of Object.entries({ fixed, min, max })) {
    if (v && typeof v === "object") return { fieldErrors: { [k]: "Enter a dollar amount" } };
  }
  if (typeof fixed === "number" && fixed > 500) return { fieldErrors: { fixed: "At most $5.00" } };
  if (typeof min === "number" && typeof max === "number" && max < min) return { fieldErrors: { max: "Must be at least the minimum" } };
  if (formData.get("confirm") !== "on") return { fieldErrors: { confirm: "Confirm that chapters must accept the new agreement before it applies" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_publish_pricing_rule", {
    p_code: d.code,
    p_name: d.name,
    p_bps: Math.round(d.percent * 100),
    p_fixed: (fixed as number | null) ?? 0,
    p_min: min as number | null,
    p_max: max as number | null,
    p_refund_policy: d.refund_policy,
    p_make_default: formData.get("make_default") === "on",
    p_terms_version: d.terms_version,
    p_terms_title: d.terms_title,
    p_terms_summary: d.terms_summary,
    p_terms_body: d.terms_body,
  });
  if (error) return { error: error.code === "23505" ? "That agreement version already exists." : dbErrorMessage(error) };
  revalidatePath("/admin/pricing");
  revalidatePath("/pricing");
  redirect("/admin/pricing?published=1");
}
