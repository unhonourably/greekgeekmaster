import "server-only";
import { serverEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { renderEmailHtml, type EmailContent } from "@/lib/email-template";
import { adminRpc, createAdminClient } from "@/lib/supabase/admin";

type Mail = {
  to: string;
  subject: string;
  heading: string;
  preheader: string;
  paragraphs: string[];
  note?: string | null;
  action?: EmailContent["action"];
  code?: string | null;
  footer?: string | null;
};

export async function deliver(mail: Mail): Promise<{ delivered: boolean }> {
  const text = [mail.heading, ...mail.paragraphs, mail.code ? `Code: ${mail.code}` : "", mail.action ? `${mail.action.label}: ${mail.action.url}` : "", mail.note ?? ""]
    .filter(Boolean)
    .join("\n\n");
  const html = renderEmailHtml({
    appUrl: serverEnv.appUrl(),
    preheader: mail.preheader,
    heading: mail.heading,
    paragraphs: mail.paragraphs,
    note: mail.note,
    action: mail.action,
    code: mail.code,
    footer: mail.footer,
  });
  try {
    return await sendEmail({ to: mail.to, subject: mail.subject, text, html });
  } catch (error) {
    console.error("[email]", error instanceof Error ? error.message : "failed");
    return { delivered: false };
  }
}

export async function deliverMany(addresses: string[], mail: Omit<Mail, "to">): Promise<void> {
  const unique = [...new Set(addresses.map((address) => address.trim().toLowerCase()).filter(Boolean))];
  await Promise.all(unique.map((to) => deliver({ ...mail, to })));
}

export async function userEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function emailUser(userId: string, mail: Omit<Mail, "to">): Promise<boolean> {
  const to = await userEmail(userId);
  if (!to) return false;
  const result = await deliver({ ...mail, to });
  return result.delivered;
}

async function addresses(fn: string, args?: Record<string, unknown>): Promise<string[]> {
  try {
    const rows = await adminRpc()<string[] | null>(fn, args);
    return rows ?? [];
  } catch {
    return [];
  }
}

export async function emailManagers(chapterId: string, mail: Omit<Mail, "to">): Promise<void> {
  await deliverMany(await addresses("chapter_manager_emails", { p_chapter: chapterId }), mail);
}

export async function emailPlatformAdmins(mail: Omit<Mail, "to">): Promise<void> {
  await deliverMany(await addresses("platform_admin_emails"), mail);
}

export function codeNote(to: string, code: string, delivered: boolean): string {
  const dev = !delivered && !serverEnv.isProduction() ? ` Email delivery is not configured, so the code is ${code}.` : "";
  return `We sent a 6-digit code to ${to}.${dev}`;
}
