import { brand } from "@/config/brand";
import { renderEmailHtml, type EmailContent } from "@/lib/email-template";

export const AUTH_EMAIL_SITE = "https://greekgeek.org";

const PLACEHOLDER = `${AUTH_EMAIL_SITE}/__supabase_action__`;

function confirmLink(type: string): string {
  return `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`;
}

type AuthTemplate = { key: string; file: string; subject: string; type: string | null; content: Omit<EmailContent, "appUrl" | "action"> & { actionLabel?: string } };

const TEMPLATES: AuthTemplate[] = [
  {
    key: "confirmation",
    file: "confirmation.html",
    subject: `Confirm your ${brand.name} account`,
    type: "signup",
    content: {
      preheader: `Confirm your email to finish setting up ${brand.name}.`,
      heading: "Confirm your email",
      paragraphs: [`Welcome to ${brand.name}. Confirm that {{ .Email }} is your address to finish creating your account.`],
      actionLabel: "Confirm email",
      note: `If you didn't sign up for ${brand.name}, you can ignore this email.`,
    },
  },
  {
    key: "magic_link",
    file: "magic_link.html",
    subject: `Your ${brand.name} sign-in link`,
    type: "magiclink",
    content: {
      preheader: "Your one-time sign-in link. It expires in one hour.",
      heading: `Sign in to ${brand.name}`,
      paragraphs: ["Use the button below to sign in as {{ .Email }}. The link works once and expires in one hour."],
      actionLabel: "Sign in",
      note: "If you didn't request this, you can ignore this email. Nobody can sign in without the link.",
    },
  },
  {
    key: "recovery",
    file: "recovery.html",
    subject: `Reset your ${brand.name} password`,
    type: "recovery",
    content: {
      preheader: "Choose a new password. The link expires in one hour.",
      heading: "Reset your password",
      paragraphs: ["We got a request to reset the password for {{ .Email }}. Choose a new one with the button below."],
      actionLabel: "Choose a new password",
      note: "If you didn't ask for this, you can ignore this email. Your password won't change.",
    },
  },
  {
    key: "email_change",
    file: "email_change.html",
    subject: `Confirm your new ${brand.name} email`,
    type: "email_change",
    content: {
      preheader: "Confirm the change to your account email.",
      heading: "Confirm your new email",
      paragraphs: ["You asked to change your account email from {{ .Email }} to {{ .NewEmail }}. Confirm the change with the button below."],
      actionLabel: "Confirm change",
      note: "If you didn't request this change, ignore this email and consider changing your password.",
    },
  },
  {
    key: "invite",
    file: "invite.html",
    subject: `You're invited to ${brand.name}`,
    type: "invite",
    content: {
      preheader: `You've been invited to ${brand.name}.`,
      heading: `You're invited to ${brand.name}`,
      paragraphs: [`You've been invited to create a ${brand.name} account for {{ .Email }}. Accept below to set it up.`],
      actionLabel: "Accept invitation",
      note: "If you weren't expecting this, you can ignore this email.",
    },
  },
  {
    key: "reauthentication",
    file: "reauthentication.html",
    subject: `Your ${brand.name} verification code`,
    type: null,
    content: {
      preheader: "Your verification code is {{ .Token }}.",
      heading: "Confirm it's you",
      paragraphs: ["Enter this code to continue."],
      code: "{{ .Token }}",
      note: "The code expires shortly. If you didn't request it, change your password.",
    },
  },
];

export function authEmailTemplates(): { key: string; file: string; subject: string; html: string }[] {
  return TEMPLATES.map((t) => {
    const { actionLabel, ...content } = t.content;
    const html = renderEmailHtml({
      ...content,
      appUrl: AUTH_EMAIL_SITE,
      action: t.type && actionLabel ? { label: actionLabel, url: PLACEHOLDER } : null,
    });
    const filled = t.type ? html.split(PLACEHOLDER).join(confirmLink(t.type)) : html;
    return { key: t.key, file: t.file, subject: t.subject, html: filled };
  });
}
