"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient, createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorMessage } from "@/lib/errors";
import { hmac, randomCode, safeEqual } from "@/lib/crypto";
import { adminRpc } from "@/lib/supabase/admin";
import { codeNote, deliver } from "@/lib/product-email";
import { serverEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

const VIS = z.enum(["chapter", "officers", "private"]).catch("chapter");
const DETAIL_FIELDS = ["pronouns", "major", "hometown", "bio", "interests", "social_links", "phone"] as const;
const LINK_KEYS = ["Website", "LinkedIn", "Instagram"] as const;

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Enter the name members will see").max(80),
  full_name: z.string().trim().max(120),
  graduation_year: z.union([z.literal(""), z.coerce.number().int().min(1950).max(2100)]),
  pronouns: z.string().trim().max(40),
  major: z.string().trim().max(120),
  hometown: z.string().trim().max(120),
  bio: z.string().trim().max(1000),
  interests: z.string().max(600),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[0-9+() .-]{7,24}$/, "Use digits, spaces, and + ( ) - only")]),
});

export async function saveProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const raw = Object.fromEntries(["display_name", "full_name", "graduation_year", "pronouns", "major", "hometown", "bio", "interests", "phone"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values: raw };
  }
  const d = parsed.data;
  const links: Record<string, string> = {};
  for (const key of LINK_KEYS) {
    const v = String(formData.get(`link_${key}`) ?? "").trim();
    if (!v) continue;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      links[key] = u.toString().slice(0, 300);
    } catch {
      return { fieldErrors: { [`link_${key}`]: "Enter a valid web address" }, values: raw };
    }
  }
  const interests = Array.from(new Set(d.interests.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 40)))).slice(0, 20);
  const visibility = Object.fromEntries(DETAIL_FIELDS.map((f) => [f, VIS.parse(formData.get(`vis_${f}`))]));
  const supabase = await createClient();
  const { error: e1 } = await supabase
    .from("profiles")
    .update({ display_name: d.display_name, full_name: d.full_name, graduation_year: typeof d.graduation_year === "number" ? d.graduation_year : null })
    .eq("id", user.id);
  if (e1) return { error: dbErrorMessage(e1), values: raw };
  const { error: e2 } = await supabase
    .from("profile_details")
    .update({
      pronouns: d.pronouns || null,
      major: d.major || null,
      hometown: d.hometown || null,
      bio: d.bio || null,
      interests,
      social_links: links,
      phone: d.phone || null,
      visibility,
    })
    .eq("user_id", user.id);
  if (e2) return { error: dbErrorMessage(e2), values: raw };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

const AVATAR_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
};

export async function uploadAvatar(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  if (!rateLimit(`avatar:${user.id}`, 10, 60 * 60_000)) return { error: "Too many uploads. Try again later." };
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > 2 * 1024 * 1024) return { error: "Images must be under 2 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = Object.entries(AVATAR_TYPES).find(([, t]) => t.magic(bytes));
  if (!type) return { error: "Use a PNG, JPEG, or WebP image." };
  const path = `${user.id}/${randomUUID()}.${type[1].ext}`;
  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: type[0], upsert: false });
  if (upErr) return { error: "Upload failed. Try again." };
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (error) {
    await supabase.storage.from("avatars").remove([path]);
    return { error: dbErrorMessage(error) };
  }
  if (before?.avatar_path && before.avatar_path.startsWith(`${user.id}/`)) await supabase.storage.from("avatars").remove([before.avatar_path]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo updated." };
}

export async function removeAvatar(): Promise<void> {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (before?.avatar_path && before.avatar_path.startsWith(`${user.id}/`)) await supabase.storage.from("avatars").remove([before.avatar_path]);
  revalidatePath("/", "layout");
}

type Challenge = {
  id: string;
  purpose: string;
  email: string;
  new_email: string | null;
  code_hash: string;
  attempts: number;
  expires_at: string;
};

function passwordError(password: string, confirm: string): ActionState | null {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { fieldErrors: { password: "Use at least 10 characters with a letter and a number" } };
  }
  if (password !== confirm) return { fieldErrors: { confirm: "Passwords do not match" } };
  return null;
}

async function issueChallenge(userId: string, purpose: Challenge["purpose"], email: string, newEmail: string | null): Promise<{ code: string } | { error: string }> {
  const code = randomCode(6);
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from("account_challenges").update({ expires_at: now }).eq("user_id", userId).eq("purpose", purpose).is("verified_at", null);
  const { error } = await admin.from("account_challenges").insert({
    user_id: userId,
    purpose,
    email,
    new_email: newEmail,
    code_hash: hmac("account-code", `${userId}:${purpose}:${email}:${code}`),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) return { error: "Could not create a verification code. Try again." };
  return { code };
}

async function matchChallenge(userId: string, purpose: string, code: string): Promise<{ row: Challenge } | { error: string }> {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return { error: "Enter the 6-digit code." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_challenges")
    .select("id, purpose, email, new_email, code_hash, attempts, expires_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as Challenge | null;
  if (!row) return { error: "Request a new code." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: "That code has expired. Request a new one." };
  if (row.attempts >= 5) return { error: "Too many incorrect attempts. Request a new code." };
  await admin.from("account_challenges").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  const expected = hmac("account-code", `${userId}:${purpose}:${row.email}:${digits}`);
  if (!safeEqual(expected, row.code_hash)) return { error: "That code is not correct." };
  return { row };
}

async function consumeChallenge(id: string): Promise<void> {
  await createAdminClient().from("account_challenges").update({ verified_at: new Date().toISOString() }).eq("id", id);
}

async function sendCode(to: string, heading: string, paragraphs: string[], code: string): Promise<{ delivered: boolean }> {
  return deliver({
    to,
    subject: heading,
    heading,
    preheader: paragraphs[0] ?? heading,
    paragraphs,
    code,
    note: "If you didn't request this, you can ignore this email. The code expires in 15 minutes.",
  });
}

export async function changePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const intent = String(formData.get("intent") ?? "send");
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const invalid = passwordError(password, confirm);
  if (invalid) return invalid;
  if (!rateLimit(`pw:${user.id}`, 8, 15 * 60_000)) return { error: "Too many attempts. Try again in 15 minutes." };
  const verifier = await createClient();
  const { error: authErr } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
  if (authErr) return { fieldErrors: { current: "Current password is incorrect" } };

  if (intent !== "confirm") {
    const issued = await issueChallenge(user.id, "password_change", user.email, null);
    if ("error" in issued) return { error: issued.error };
    const sent = await sendCode(user.email, "Confirm your password change", ["Enter this code to finish changing your GreekGeek password."], issued.code);
    return { ok: true, message: codeNote(user.email, issued.code, sent.delivered), values: { step: "password_code" } };
  }

  const matched = await matchChallenge(user.id, "password_change", String(formData.get("code") ?? ""));
  if ("error" in matched) return { error: matched.error, values: { step: "password_code" } };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Could not update your password. Try again.", values: { step: "password_code" } };
  await consumeChallenge(matched.row.id);
  await deliver({
    to: user.email,
    subject: "Your password was changed",
    heading: "Your password was changed",
    preheader: "Your GreekGeek password was just updated.",
    paragraphs: ["Your GreekGeek password was just updated. If you didn't do this, reset your password from the sign-in page."],
    action: { label: "Open account", url: `${serverEnv.appUrl()}/account` },
  });
  redirect("/account?password=changed");
}

export async function changeEmail(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const intent = String(formData.get("intent") ?? "send");
  if (!rateLimit(`email-change:${user.id}`, 8, 15 * 60_000)) return { error: "Too many attempts. Try again in 15 minutes." };

  if (intent === "verify_current" || intent === "verify_new") {
    const purpose = intent === "verify_current" ? "email_current" : "email_new";
    const matched = await matchChallenge(user.id, purpose, String(formData.get("code") ?? ""));
    if ("error" in matched) {
      return { error: matched.error, values: { step: purpose === "email_current" ? "current" : "next", new_email: String(formData.get("new_email") ?? "") } };
    }
    if (intent === "verify_current") {
      const next = matched.row.new_email;
      if (!next) return { error: "Request a new code." };
      await consumeChallenge(matched.row.id);
      const issued = await issueChallenge(user.id, "email_new", next, next);
      if ("error" in issued) return { error: issued.error, values: { step: "current", new_email: next } };
      const sent = await sendCode(next, "Confirm your new email", [`Enter this code to make ${next} the sign-in address for your GreekGeek account.`], issued.code);
      return { ok: true, message: codeNote(next, issued.code, sent.delivered), values: { step: "next", new_email: next } };
    }
    const next = matched.row.email;
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, { email: next, email_confirm: true });
    if (error) return { error: "That email could not be saved. It may already belong to another account.", values: { step: "next", new_email: next } };
    await consumeChallenge(matched.row.id);
    const session = await createSessionClient();
    await session.auth.refreshSession();
    const notice = {
      subject: "Your email was changed",
      heading: "Your email was changed",
      preheader: `Your GreekGeek sign-in email is now ${next}.`,
      paragraphs: [`Your GreekGeek sign-in email is now ${next}. If you didn't do this, contact the chapter administrator and reset your password.`],
    };
    await deliver({ ...notice, to: user.email });
    await deliver({ ...notice, to: next });
    revalidatePath("/account");
    return { ok: true, message: `Your sign-in email is now ${next}.`, values: { step: "done" } };
  }

  if (intent === "resend_new") {
    const admin = createAdminClient();
    const { data } = await admin
      .from("account_challenges")
      .select("new_email, verified_at")
      .eq("user_id", user.id)
      .eq("purpose", "email_current")
      .not("verified_at", "is", null)
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (data?.new_email as string | null) ?? null;
    const verifiedAt = data?.verified_at ? new Date(data.verified_at as string).getTime() : 0;
    if (!next || Date.now() - verifiedAt > 30 * 60_000) return { error: "Confirm your current email again before sending a new code." };
    const issued = await issueChallenge(user.id, "email_new", next, next);
    if ("error" in issued) return { error: issued.error, values: { step: "next", new_email: next } };
    const sent = await sendCode(next, "Confirm your new email", [`Enter this code to make ${next} the sign-in address for your GreekGeek account.`], issued.code);
    return { ok: true, message: codeNote(next, issued.code, sent.delivered), values: { step: "next", new_email: next } };
  }

  const next = String(formData.get("new_email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(next).success) return { fieldErrors: { new_email: "Enter a valid email address" } };
  if (next === user.email.toLowerCase()) return { fieldErrors: { new_email: "That is already your email" } };
  let taken = false;
  try {
    taken = await adminRpc()<boolean>("email_is_taken", { p_email: next });
  } catch {
    return { error: "Could not check that email. Try again." };
  }
  if (taken) return { fieldErrors: { new_email: "That email already has an account" } };
  const issued = await issueChallenge(user.id, "email_current", user.email, next);
  if ("error" in issued) return { error: issued.error };
  const sent = await sendCode(user.email, "Confirm your email change", [`Enter this code to allow ${next} to replace ${user.email} on your GreekGeek account.`], issued.code);
  return { ok: true, message: codeNote(user.email, issued.code, sent.delivered), values: { step: "current", new_email: next } };
}

const ERASURE_BUCKETS = ["avatars", "chat-attachments", "verification-evidence"] as const;

export async function deleteAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  if (!rateLimit(`erase:${user.id}`, 5, 60 * 60_000)) return { error: "Too many attempts. Try again later." };
  const typed = String(formData.get("confirm_email") ?? "").trim();
  if (typed.toLowerCase() !== user.email.toLowerCase()) return { fieldErrors: { confirm_email: "Type your email address to confirm" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("erase_my_account", { p_confirmation: typed });
  if (error) return { error: dbErrorMessage(error) };
  const files = (data ?? {}) as Partial<Record<(typeof ERASURE_BUCKETS)[number], string[]>>;
  const admin = createAdminClient();
  await Promise.all(
    ERASURE_BUCKETS.map(async (bucket) => {
      const paths = (files[bucket] ?? []).filter((path) => typeof path === "string" && path.length > 0);
      if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
    }),
  );
  const session = await createSessionClient();
  await session.auth.signOut();
  redirect("/login?deleted=1");
}

export async function saveNotificationPreferences(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const { data: kinds } = await supabase.from("notification_kinds").select("kind, required");
  const rows = (kinds ?? []).map((k) => ({
    user_id: user.id,
    kind: k.kind as string,
    in_app: k.required ? true : formData.get(`in_app_${k.kind}`) === "on",
    email: formData.get(`email_${k.kind}`) === "on",
    sms: false,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,kind" });
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true, message: "Notification settings saved." };
}
