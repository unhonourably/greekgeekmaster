"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { hmac, randomCode, safeEqual } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { renderEmailHtml } from "@/lib/email-template";
import { deliver, emailPlatformAdmins } from "@/lib/product-email";
import { serverEnv } from "@/lib/env";
import { domainMatches } from "@/lib/names";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";
import type { ApplicationStatus } from "@/lib/applications";

const KINDS = ["new_chapter", "claim_existing", "recovery"] as const;
const ROLES = ["president", "vice_president", "treasurer", "secretary", "recruitment_chair", "risk_management_chair", "advisor", "other_officer"] as const;
const METHODS = ["institutional_email", "national_organization", "university_fsl", "officer_documentation", "manual_review"] as const;

type OwnedApplication = {
  id: string;
  status: ApplicationStatus;
  current_step: number;
  kind: (typeof KINDS)[number];
  university_id: string | null;
  institutional_email: string | null;
  institutional_email_verified_at: string | null;
};

async function loadOwned(id: string): Promise<OwnedApplication | null> {
  const user = await requireUser("/onboarding");
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("chapter_applications")
    .select("id, status, current_step, kind, university_id, institutional_email, institutional_email_verified_at, applicant_id")
    .eq("id", id)
    .eq("applicant_id", user.id)
    .maybeSingle();
  return (data as OwnedApplication | null) ?? null;
}

function editable(app: OwnedApplication | null): app is OwnedApplication {
  return Boolean(app && (app.status === "draft" || app.status === "info_requested"));
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export async function startApplication(formData: FormData): Promise<void> {
  const user = await requireUser("/onboarding");
  const kind = z.enum(KINDS).catch("new_chapter").parse(formData.get("kind"));
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const { data, error } = await supabase
    .from("chapter_applications")
    .insert({ applicant_id: user.id, kind, applicant_full_name: profile?.full_name || null })
    .select("id")
    .single();
  if (error || !data) throw new Error(dbErrorMessage(error, "Could not start the application."));
  redirect(`/onboarding/${data.id}?step=1`);
}

const applicantSchema = z.object({
  applicant_full_name: z.string().trim().min(2, "Enter your full name").max(120),
  intended_role: z.enum(ROLES, { error: "Choose your role" }),
});

export async function saveApplicant(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!editable(app)) return { error: "This application can no longer be edited." };
  const parsed = applicantSchema.safeParse({ applicant_full_name: formData.get("applicant_full_name"), intended_role: formData.get("intended_role") });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("chapter_applications")
    .update({ ...parsed.data, current_step: Math.max(app.current_step, 2) })
    .eq("id", app.id);
  if (error) return { error: dbErrorMessage(error) };
  redirect(`/onboarding/${app.id}?step=2`);
}

const chapterSchema = z
  .object({
    university_id: z.uuid().nullable(),
    proposed_university_name: optional(200),
    existing_chapter_id: z.uuid().nullable(),
    organization_id: z.uuid().nullable(),
    organization_name: optional(120),
    designation: optional(120),
    greek_letters: optional(24),
  })
  .refine((v) => v.university_id || v.proposed_university_name, { path: ["university_id"], message: "Choose your university or enter its name" });

export async function saveChapter(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!editable(app)) return { error: "This application can no longer be edited." };
  const uni = String(formData.get("university_id") ?? "");
  const raw = {
    university_id: uni && uni !== "other" ? uni : null,
    proposed_university_name: uni === "other" ? formData.get("proposed_university_name") : "",
    existing_chapter_id: String(formData.get("existing_chapter_id") ?? "") || null,
    organization_id: String(formData.get("organization_id") ?? "") || null,
    organization_name: formData.get("organization_name") ?? "",
    designation: formData.get("designation") ?? "",
    greek_letters: formData.get("greek_letters") ?? "",
  };
  const parsed = chapterSchema.safeParse(raw);
  if (!parsed.success) return zodState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();

  if (app.kind === "new_chapter") {
    if (!v.organization_name && !v.organization_id) return { fieldErrors: { organization_name: "Enter your organization" }, error: "Check the highlighted fields." };
    v.existing_chapter_id = null;
    if (!v.organization_id && v.organization_name) {
      const { data: org } = await supabase
        .from("national_organizations")
        .select("id, name, greek_letters")
        .ilike("name", v.organization_name.replace(/[\\%_]/g, (c) => `\\${c}`))
        .maybeSingle();
      if (org) {
        v.organization_id = org.id;
        v.organization_name = org.name;
        v.greek_letters = v.greek_letters ?? org.greek_letters;
      }
    }
  } else {
    if (!v.existing_chapter_id) return { fieldErrors: { existing_chapter_id: "Choose the chapter" }, error: "Check the highlighted fields." };
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, university_id, organization_name, designation, greek_letters, organization_id")
      .eq("id", v.existing_chapter_id)
      .maybeSingle();
    if (!chapter || chapter.university_id !== v.university_id) return { fieldErrors: { existing_chapter_id: "Choose a chapter at this university" } };
    v.organization_name = chapter.organization_name;
    v.designation = chapter.designation;
    v.greek_letters = chapter.greek_letters;
    v.organization_id = chapter.organization_id;
  }

  if (v.organization_id && !v.organization_name) {
    const { data: org } = await supabase.from("national_organizations").select("name").eq("id", v.organization_id).maybeSingle();
    v.organization_name = org?.name ?? null;
  }

  const { error } = await supabase
    .from("chapter_applications")
    .update({ ...v, current_step: Math.max(app.current_step, 3) })
    .eq("id", app.id);
  if (error) return { error: dbErrorMessage(error) };
  redirect(`/onboarding/${app.id}?step=3`);
}

const verificationSchema = z.object({
  verification_method: z.enum(METHODS, { error: "Choose how we should verify your chapter" }),
  national_contact_name: optional(120),
  national_contact_email: z.union([z.literal(""), z.email("Enter a valid email")]).transform((v) => v || null),
  fsl_contact_name: optional(120),
  fsl_contact_email: z.union([z.literal(""), z.email("Enter a valid email")]).transform((v) => v || null),
  officer_statement: optional(2000),
});

export async function saveVerification(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!editable(app)) return { error: "This application can no longer be edited." };
  const parsed = verificationSchema.safeParse({
    verification_method: formData.get("verification_method"),
    national_contact_name: formData.get("national_contact_name") ?? "",
    national_contact_email: String(formData.get("national_contact_email") ?? "").trim(),
    fsl_contact_name: formData.get("fsl_contact_name") ?? "",
    fsl_contact_email: String(formData.get("fsl_contact_email") ?? "").trim(),
    officer_statement: formData.get("officer_statement") ?? "",
  });
  if (!parsed.success) return zodState(parsed.error);
  const v = parsed.data;
  if (v.verification_method === "national_organization" && !v.national_contact_email) {
    return { fieldErrors: { national_contact_email: "Enter a contact at your national organization" }, error: "Check the highlighted fields." };
  }
  if (v.verification_method === "university_fsl" && !v.fsl_contact_email) {
    return { fieldErrors: { fsl_contact_email: "Enter a contact at your FSL office" }, error: "Check the highlighted fields." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("chapter_applications")
    .update({ ...v, current_step: Math.max(app.current_step, 4) })
    .eq("id", app.id);
  if (error) return { error: dbErrorMessage(error) };
  const intent = formData.get("intent");
  if (intent === "stay") {
    revalidatePath(`/onboarding/${app.id}`);
    return { ok: true, message: "Saved." };
  }
  redirect(`/onboarding/${app.id}?step=4`);
}

export async function sendEmailCode(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!editable(app)) return { error: "This application can no longer be edited." };
  const email = String(formData.get("institutional_email") ?? "").trim().toLowerCase();
  const values = { institutional_email: email };
  if (!z.email().safeParse(email).success) return { fieldErrors: { institutional_email: "Enter a valid email address" }, values };

  const supabase = await createClient();
  const platformAdmin = (await getStaffRole()) === "admin";
  let domains: string[] = [];
  if (app.university_id) {
    const { data: uni } = await supabase.from("universities").select("email_domains").eq("id", app.university_id).maybeSingle();
    domains = (uni?.email_domains as string[] | undefined) ?? [];
  }
  const allowed = platformAdmin || (domains.length > 0 ? domainMatches(email, domains) : /\.edu$/.test(email.split("@")[1] ?? ""));
  if (!allowed) {
    return {
      fieldErrors: {
        institutional_email: domains.length > 0 ? `Use an address ending in ${domains.map((d) => `@${d}`).join(" or ")}` : "Use your school address ending in .edu, or choose another verification method",
      },
      values,
    };
  }
  if (!rateLimit(`email-code:${app.id}`, 3, 15 * 60_000)) return { error: "You have requested several codes. Wait 15 minutes and try again.", values };

  const { error: updateError } = await supabase
    .from("chapter_applications")
    .update({ institutional_email: email, verification_method: "institutional_email" })
    .eq("id", app.id);
  if (updateError) return { error: dbErrorMessage(updateError), values };
  if (platformAdmin) {
    const { error: markError } = await createAdminClient().rpc("service_mark_institutional_email_verified", { p_application: app.id });
    if (markError) return { error: "Could not confirm your email. Try again.", values };
    revalidatePath(`/onboarding/${app.id}`);
    return { ok: true, message: `${email} is confirmed.`, values };
  }

  const code = randomCode(6);
  const admin = createAdminClient();
  const { error } = await admin.from("institutional_email_challenges").insert({
    application_id: app.id,
    email,
    code_hash: hmac("email-code", `${app.id}:${email}:${code}`),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) return { error: "Could not create a verification code. Try again.", values };

  const result = await sendEmail({
    to: email,
    subject: "Your chapter verification code",
    text: `Your verification code is ${code}.\n\nIt expires in 15 minutes. If you did not request it, you can ignore this email.`,
    html: renderEmailHtml({
      appUrl: serverEnv.appUrl(),
      preheader: "Your chapter verification code expires in 15 minutes.",
      heading: "Your verification code",
      paragraphs: ["Enter this code to confirm your school email. It expires in 15 minutes."],
      code,
      note: "If you didn't request this, you can ignore this email.",
    }),
  });
  revalidatePath(`/onboarding/${app.id}`);
  const devNote = !result.delivered && !serverEnv.isProduction() ? ` Email delivery is not configured, so the code is ${code}.` : "";
  return { ok: true, message: `We sent a 6-digit code to ${email}.${devNote}`, values };
}

export async function verifyEmailCode(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!editable(app) || !app.institutional_email) return { error: "Request a code first." };
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { fieldErrors: { code: "Enter the 6-digit code" } };
  const admin = createAdminClient();
  const { data: challenge } = await admin
    .from("institutional_email_challenges")
    .select("id, email, code_hash, attempts, expires_at, verified_at")
    .eq("application_id", app.id)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!challenge || challenge.email !== app.institutional_email) return { error: "Request a new code." };
  if (new Date(challenge.expires_at).getTime() < Date.now()) return { error: "That code has expired. Request a new one." };
  if (challenge.attempts >= 5) return { error: "Too many incorrect attempts. Request a new code." };
  await admin.from("institutional_email_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
  const expected = hmac("email-code", `${app.id}:${challenge.email}:${code}`);
  if (!safeEqual(expected, challenge.code_hash)) return { fieldErrors: { code: "That code is not correct" } };
  await admin.from("institutional_email_challenges").update({ verified_at: new Date().toISOString() }).eq("id", challenge.id);
  const { error } = await admin.rpc("service_mark_institutional_email_verified", { p_application: app.id });
  if (error) return { error: "Could not confirm your email. Try again." };
  revalidatePath(`/onboarding/${app.id}`);
  return { ok: true, message: "School email confirmed." };
}

const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

function sniff(buffer: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (sig.bytes.every((b, i) => buffer[offset + i] === b)) return sig.mime;
  }
  return null;
}

const EVIDENCE_KINDS = ["officer_roster", "national_letter", "fsl_letter", "election_minutes", "other"] as const;

export async function uploadEvidence(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!app || !["draft", "info_requested", "pending_verification"].includes(app.status)) return { error: "Documents can no longer be added." };
  const file = formData.get("file");
  const kind = z.enum(EVIDENCE_KINDS).catch("other").parse(formData.get("kind"));
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: "Choose a file" } };
  if (file.size > 10 * 1024 * 1024) return { fieldErrors: { file: "Files must be 10 MB or smaller" } };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return { fieldErrors: { file: "Upload a PDF, PNG, JPEG, or WebP file" } };
  const user = await requireUser();
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "document";
  const path = `${app.id}/${randomUUID()}-${safeName}`;
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage.from("verification-evidence").upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) return { error: "Upload failed. Try again." };
  const { error } = await supabase.from("verification_evidence").insert({
    application_id: app.id,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: mime,
    size_bytes: file.size,
    kind,
    uploaded_by: user.id,
  });
  if (error) {
    await supabase.storage.from("verification-evidence").remove([path]);
    return { error: dbErrorMessage(error, "Could not save the document.") };
  }
  revalidatePath(`/onboarding/${app.id}`);
  return { ok: true, message: `${file.name} uploaded.` };
}

export async function submitApplication(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!editable(app)) return { error: "This application has already been submitted." };
  if (formData.get("attest") !== "on") return { fieldErrors: { attest: "Confirm that the information is accurate" } };
  const supabase = await createClient();
  const response = String(formData.get("response") ?? "").trim();
  if (app.status === "info_requested" && response) {
    const { error } = await supabase.rpc("respond_to_application", { p_application: app.id, p_message: response.slice(0, 4000) });
    if (error) return { error: dbErrorMessage(error) };
  }
  const { data, error } = await supabase.rpc("submit_chapter_application", { p_application: app.id });
  if (error) return { error: dbErrorMessage(error) };
  const user = await requireUser("/onboarding");
  const { data: submitted } = await supabase.from("chapter_applications").select("organization_name, designation, created_chapter_id").eq("id", app.id).maybeSingle();
  const label = [submitted?.organization_name, submitted?.designation].filter(Boolean).join(" ") || "Your chapter";
  if (data === "verified") {
    let href = serverEnv.appUrl();
    if (submitted?.created_chapter_id) {
      const { data: chapter } = await supabase.from("chapters").select("slug").eq("id", submitted.created_chapter_id).maybeSingle();
      if (chapter?.slug) href = `${serverEnv.appUrl()}/c/${chapter.slug}`;
    }
    await deliver({
      to: user.email,
      subject: `${label} is verified`,
      heading: "Your chapter is verified",
      preheader: `${label} is ready.`,
      paragraphs: [`${label} is verified. You are its administrator, and you can invite members, publish announcements, and set up dues.`],
      action: { label: "Open chapter", url: href },
    });
  } else {
    await deliver({
      to: user.email,
      subject: `We received ${label}`,
      heading: "We received your application",
      preheader: `${label} is waiting for review.`,
      paragraphs: [`We received the application for ${label}. A GreekGeek reviewer will look at it, and we'll email you when there's a decision.`],
      action: { label: "View application", url: `${serverEnv.appUrl()}/onboarding/${app.id}` },
    });
    await emailPlatformAdmins({
      subject: `Chapter application for ${label}`,
      heading: "A chapter application is waiting",
      preheader: `${label} was submitted for review.`,
      paragraphs: [`${label} was submitted and is waiting for review.`],
      action: { label: "Open the queue", url: `${serverEnv.appUrl()}/admin/verification` },
    });
  }
  if (data === "verified") {
    const { data: row } = await supabase.from("chapter_applications").select("created_chapter_id").eq("id", app.id).maybeSingle();
    if (row?.created_chapter_id) {
      const { data: chapter } = await supabase.from("chapters").select("slug").eq("id", row.created_chapter_id).maybeSingle();
      if (chapter?.slug) redirect(`/c/${chapter.slug}`);
    }
  }
  redirect(`/onboarding/${app.id}`);
}

export async function respondToApplication(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const app = await loadOwned(id);
  if (!app) return { error: "Application not found." };
  const message = String(formData.get("message") ?? "").trim();
  if (message.length < 2) return { fieldErrors: { message: "Write a message" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_application", { p_application: app.id, p_message: message.slice(0, 4000) });
  if (error) return { error: dbErrorMessage(error) };
  const { data: submitted } = await supabase.from("chapter_applications").select("organization_name, designation").eq("id", app.id).maybeSingle();
  const label = [submitted?.organization_name, submitted?.designation].filter(Boolean).join(" ") || "A chapter";
  await emailPlatformAdmins({
    subject: `Reply on ${label}`,
    heading: "An applicant replied",
    preheader: `${label} sent a reply.`,
    paragraphs: [`${label} sent a reply.`, message.slice(0, 2000)],
    action: { label: "Open the queue", url: `${serverEnv.appUrl()}/admin/verification` },
  });
  revalidatePath(`/onboarding/${app.id}`);
  return { ok: true, message: app.status === "rejected" ? "Appeal submitted. A reviewer will look at it again." : "Message sent to the reviewer." };
}

export async function withdrawApplication(id: string): Promise<void> {
  const app = await loadOwned(id);
  if (!app) redirect("/home");
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_chapter_application", { p_application: app.id });
  if (error) throw new Error(dbErrorMessage(error));
  redirect("/home");
}
