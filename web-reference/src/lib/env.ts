import "server-only";

export class ConfigurationError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing required environment variable ${variable}`);
    this.name = "ConfigurationError";
  }
}

function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function required(...names: string[]): string {
  const value = read(...names);
  if (!value) throw new ConfigurationError(names[0]);
  return value;
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () => (read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3001").replace(/\/+$/, ""),
  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  stripeConnectWebhookSecret: () => read("STRIPE_CONNECT_WEBHOOK_SECRET"),
  signingSecret: () => {
    const value = required("APP_SIGNING_SECRET");
    if (value.length < 32) throw new ConfigurationError("APP_SIGNING_SECRET (must be at least 32 characters)");
    return value;
  },
  cronSecret: () => required("CRON_SECRET"),
  resendApiKey: () => read("RESEND_API_KEY"),
  resendWebhookSecret: () => read("RESEND_WEBHOOK_SECRET"),
  outreachFrom: () => read("OUTREACH_FROM"),
  outreachSiteUrl: () => (read("OUTREACH_SITE_URL") ?? "https://greekgeek.org").replace(/\/+$/, ""),
  outreachReplyTo: () => read("OUTREACH_REPLY_TO") ?? "amare@greekgeek.org",
  emailFrom: () => read("EMAIL_FROM") ?? "Chapter <no-reply@localhost>",
  buildId: () => read("VERCEL_GIT_COMMIT_SHA")?.slice(0, 12) ?? null,
  isProduction: () => process.env.NODE_ENV === "production",
  skipEmailConfirmation: () => process.env.NODE_ENV !== "production" && read("DEV_SKIP_EMAIL_CONFIRMATION") === "true",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(read("NEXT_PUBLIC_SUPABASE_URL") && read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}

export function isStripeConfigured(): boolean {
  return Boolean(read("STRIPE_SECRET_KEY"));
}

export function isStripeLiveMode(): boolean {
  return (read("STRIPE_SECRET_KEY") ?? "").startsWith("sk_live_");
}

export function stripeRedirectOrigin(requestOrigin?: string | null): string {
  const candidates = [requestOrigin, serverEnv.appUrl(), serverEnv.outreachSiteUrl()];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      const allowed = isStripeLiveMode() ? url.protocol === "https:" && !local : url.protocol === "https:" || url.protocol === "http:";
      if (allowed) return url.origin;
    } catch {
      continue;
    }
  }
  return serverEnv.outreachSiteUrl();
}
