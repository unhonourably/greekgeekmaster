"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { invitationHash } from "@/lib/invitations";
import type { ActionState } from "@/lib/action-state";

function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/home";
}

async function clientKey(prefix: string, email: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${prefix}:${ip}:${email.toLowerCase()}`;
}

async function invitedEmailMatches(next: string, email: string): Promise<boolean> {
  const match = /^\/invite\/([A-Za-z0-9_-]{20,100})$/.exec(next);
  if (!match) return false;
  const { data } = await createAdminClient()
    .from("chapter_invitations")
    .select("email, status, expires_at")
    .eq("token_hash", invitationHash(match[1]))
    .maybeSingle();
  if (!data || data.status !== "pending" || new Date(data.expires_at as string).getTime() < Date.now()) return false;
  return (data.email as string).toLowerCase() === email.toLowerCase();
}

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { ...zodState(parsed.error), values };
  if (!rateLimit(await clientKey("signin", parsed.data.email), 8, 10 * 60_000)) {
    return { error: "Too many attempts. Wait a few minutes and try again.", values };
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/confirm/i.test(error.message)) {
      const { data: confirmed } = await createAdminClient().rpc("service_confirm_admin_email", { p_email: parsed.data.email });
      if (confirmed) {
        const { error: retry } = await supabase.auth.signInWithPassword(parsed.data);
        if (!retry) redirect(safeNext(formData.get("next")));
      }
      return { error: "Confirm your email first. Check your inbox for the link.", values };
    }
    return { error: "That email and password do not match.", values };
  }
  redirect(safeNext(formData.get("next")));
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(72, "Use at most 72 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Include at least one letter and one number"),
  terms: z.literal("on", { error: "Accept the terms to continue" }),
});

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    terms: formData.get("terms"),
  };
  const values = { fullName: String(raw.fullName ?? ""), email: String(raw.email ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { ...zodState(parsed.error), values };
  if (!rateLimit(await clientKey("signup", parsed.data.email), 5, 60 * 60_000)) {
    return { error: "Too many sign-up attempts. Try again later.", values };
  }
  const next = safeNext(formData.get("next"));
  const supabase = await createSessionClient();
  if (serverEnv.skipEmailConfirmation() || (await invitedEmailMatches(next, parsed.data.email))) {
    const { error: createError } = await createAdminClient().auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName, display_name: parsed.data.fullName.split(" ")[0] },
    });
    if (createError) {
      if (/already/i.test(createError.message)) return { error: "An account with this email already exists. Sign in instead.", values };
      if (/password/i.test(createError.message)) return { error: createError.message, values };
      return { error: "We could not create your account. Try again.", values };
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (signInError) return { error: "Account created. Sign in to continue.", values };
    redirect(next);
  }
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, display_name: parsed.data.fullName.split(" ")[0] },
      emailRedirectTo: `${serverEnv.appUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (/already/i.test(error.message)) return { error: "An account with this email already exists. Sign in instead.", values };
    if (/password/i.test(error.message)) return { error: error.message, values };
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { error: "We could not send the confirmation email right now because the email limit was reached. Try again in an hour, or ask a chapter officer for an invitation link.", values };
    }
    return { error: "We could not create your account. Try again.", values };
  }
  if (data.session) redirect(next);
  return { ok: true, message: `We sent a confirmation link to ${parsed.data.email}. Open it to finish creating your account.`, values };
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const parsed = z.email().safeParse(email);
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address" }, values: { email } };
  if (rateLimit(await clientKey("reset", email), 3, 60 * 60_000)) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${serverEnv.appUrl()}/auth/confirm?next=/reset-password` });
  }
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const check = signUpSchema.shape.password.safeParse(password);
  if (!check.success) return { fieldErrors: { password: check.error.issues[0].message } };
  if (password !== confirm) return { fieldErrors: { confirm: "Passwords do not match" } };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Your reset link has expired. Request a new one." };
  redirect("/home");
}

export async function signOut(formData?: FormData): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  const next = formData?.get("next") ?? null;
  redirect(next ? `/login?next=${encodeURIComponent(safeNext(next))}` : "/login");
}
