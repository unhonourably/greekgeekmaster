"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { formField, optionalText, requireModule } from "@/lib/modules";
import { zonedTimeToUtc } from "@/lib/timezone";
import type { ActionState } from "@/lib/action-state";
import { setupLockState } from "@/lib/setup-access";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ["general", "risk", "housing", "finance", "standards", "bylaws"] as const;
const INCIDENT_CATEGORIES = ["safety", "hazing", "harassment", "property", "alcohol", "housing", "other"] as const;
const MEMBER_CLASSES = ["new_member", "active", "associate", "alumni"] as const;

async function requireStandardsManager(slug: string) {
  const ctx = await requireModule(slug, "standards");
  if (!ctx.can("standards.manage") && !ctx.can("chapter.manage")) redirect(`/c/${slug}/standards`);
  return ctx;
}

const policySchema = z.object({
  title: z.string().min(2, "Give the policy a title").max(140),
  category: z.enum(CATEGORIES).catch("general"),
  requires_ack: z.boolean(),
  body: z.string().min(1, "Write the policy text").max(50000),
});

export async function createPolicy(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireStandardsManager(slug);
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = policySchema.safeParse({
    title: formField(formData, "title"),
    category: formField(formData, "category"),
    requires_ack: formData.get("requires_ack") === "on",
    body: formField(formData, "body"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("policy_documents")
    .insert({ chapter_id: chapter.id, created_by: user.id, title: parsed.data.title, category: parsed.data.category, requires_ack: parsed.data.requires_ack })
    .select("id")
    .single();
  if (error || !doc) return { error: dbErrorMessage(error) };
  const { error: publishError } = await supabase.rpc("publish_policy_version", { p_policy: doc.id, p_body: parsed.data.body, p_summary: "Initial version" });
  if (publishError) return { error: dbErrorMessage(publishError) };
  revalidatePath(`/c/${slug}/standards`);
  redirect(`/c/${slug}/standards/policies/${doc.id}`);
}

const revisionSchema = z.object({
  body: z.string().min(1, "Write the policy text").max(50000),
  summary: z.string().min(3, "Summarize what changed").max(500),
});

export async function publishRevision(slug: string, policyId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireStandardsManager(slug);
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = revisionSchema.safeParse({ body: formField(formData, "body"), summary: formField(formData, "summary") });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_policy_version", { p_policy: policyId, p_body: parsed.data.body, p_summary: parsed.data.summary });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/standards`);
  revalidatePath(`/c/${slug}/standards/policies/${policyId}`);
  return { ok: true, message: `Version ${data} published. Members must acknowledge it again.` };
}

export async function acknowledgePolicy(slug: string, policyId: string, versionId: string): Promise<void> {
  const { chapter, user } = await requireModule(slug, "standards");
  const supabase = await createClient();
  const { data: doc } = await supabase.from("policy_documents").select("current_version").eq("id", policyId).eq("chapter_id", chapter.id).maybeSingle();
  const { data: version } = await supabase.from("policy_versions").select("id, version").eq("id", versionId).eq("policy_id", policyId).maybeSingle();
  if (!doc || !version || version.version !== doc.current_version) return;
  await supabase.from("policy_acknowledgments").upsert({ policy_version_id: version.id, chapter_id: chapter.id, user_id: user.id }, { onConflict: "policy_version_id,user_id", ignoreDuplicates: true });
  revalidatePath(`/c/${slug}/standards`);
  revalidatePath(`/c/${slug}/standards/policies/${policyId}`);
}

const trainingSchema = z.object({
  title: z.string().min(2, "Name the training").max(140),
  description: z.string().max(2000).nullable(),
  due_on: z.string().regex(DATE).nullable(),
  applies_to: z.array(z.enum(MEMBER_CLASSES)).min(1, "Pick at least one member class"),
});

export async function createTraining(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user, can } = await requireModule(slug, "standards");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  if (!can("standards.manage")) return { error: "You do not have permission to do that." };
  const classes = MEMBER_CLASSES.filter((c) => formData.get(`class_${c}`) === "on");
  const parsed = trainingSchema.safeParse({ title: formField(formData, "title"), description: optionalText(formData, "description"), due_on: optionalText(formData, "due_on"), applies_to: classes });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("training_requirements").insert({ chapter_id: chapter.id, created_by: user.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/standards`);
  return { ok: true, message: "Training requirement added." };
}

export async function completeTraining(slug: string, requirementId: string): Promise<void> {
  const { chapter, user } = await requireModule(slug, "standards");
  const supabase = await createClient();
  await supabase.from("training_completions").upsert({ requirement_id: requirementId, chapter_id: chapter.id, user_id: user.id }, { onConflict: "requirement_id,user_id", ignoreDuplicates: true });
  revalidatePath(`/c/${slug}/standards`);
}

export async function verifyTraining(slug: string, requirementId: string, userId: string): Promise<void> {
  const { chapter, user, can } = await requireModule(slug, "standards");
  if (!can("standards.manage") || userId === user.id) return;
  const supabase = await createClient();
  await supabase
    .from("training_completions")
    .update({ verified_by: user.id, verified_at: new Date().toISOString() })
    .eq("requirement_id", requirementId)
    .eq("user_id", userId)
    .eq("chapter_id", chapter.id)
    .is("verified_by", null);
  revalidatePath(`/c/${slug}/standards/trainings/${requirementId}`);
}

const incidentSchema = z.object({
  category: z.enum(INCIDENT_CATEGORIES, { message: "Pick a category" }),
  description: z.string().min(10, "Describe what happened in at least 10 characters").max(8000),
  location: z.string().max(200).nullable(),
  people_involved: z.string().max(2000).nullable(),
  confidential_reporter: z.boolean(),
});

export async function fileIncident(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "standards");
  if (!rateLimit(`incident:${user.id}`, 5, 60 * 60_000)) return { error: "You have filed several reports recently. Try again later or contact your advisor directly." };
  const parsed = incidentSchema.safeParse({
    category: formField(formData, "category"),
    description: formField(formData, "description"),
    location: optionalText(formData, "location"),
    people_involved: optionalText(formData, "people_involved"),
    confidential_reporter: formData.get("confidential_reporter") === "on",
  });
  if (!parsed.success) return zodState(parsed.error);
  const date = formField(formData, "occurred_date");
  const time = formField(formData, "occurred_time") || "12:00";
  let occurredAt: string | null = null;
  if (date) {
    const at = zonedTimeToUtc(date, time, chapter.timezone);
    if (!at || at.getTime() > Date.now() + 60_000) return { fieldErrors: { occurred_date: "Pick a date that has already happened" } };
    occurredAt = at.toISOString();
  }
  const supabase = await createClient();
  const { error } = await supabase.from("incident_reports").insert({ chapter_id: chapter.id, reporter_id: user.id, occurred_at: occurredAt, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/standards`);
  return { ok: true, message: "Report submitted. Only standards officers can see it." };
}

export async function setIncidentStatus(slug: string, incidentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, can } = await requireModule(slug, "standards");
  if (!can("standards.manage")) return { error: "You do not have permission to do that." };
  const status = z.enum(["submitted", "under_review", "resolved", "closed"]).safeParse(formField(formData, "status"));
  if (!status.success) return { fieldErrors: { status: "Pick a status" } };
  const supabase = await createClient();
  const { error } = await supabase.from("incident_reports").update({ status: status.data, updated_at: new Date().toISOString() }).eq("id", incidentId).eq("chapter_id", chapter.id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/standards/incidents/${incidentId}`);
  return { ok: true, message: "Status updated." };
}

export async function addCaseNote(slug: string, incidentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user, can } = await requireModule(slug, "standards");
  if (!can("standards.manage")) return { error: "You do not have permission to do that." };
  const body = z.string().min(1, "Write a note").max(4000).safeParse(formField(formData, "body"));
  if (!body.success) return { fieldErrors: { body: body.error.issues[0]?.message ?? "Write a note" } };
  const supabase = await createClient();
  const { error } = await supabase.from("incident_case_notes").insert({ chapter_id: chapter.id, incident_id: incidentId, author_id: user.id, body: body.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/standards/incidents/${incidentId}`);
  return { ok: true, message: "Note added. Case notes cannot be edited or deleted." };
}
