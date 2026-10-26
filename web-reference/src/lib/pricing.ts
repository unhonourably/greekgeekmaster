import "server-only";
import { cacheLife } from "next/cache";
import { DEFAULT_PRICING_RULE, type PricingRule } from "@/lib/fees";
import { createPublicClient } from "@/lib/supabase/public";

export type SubscriptionPlan = { name: string; priceCents: number; interval: "month" | "year"; features: string[] };

export type PublishedPricing = { rule: PricingRule; name: string; plan: SubscriptionPlan; source: "database" | "built_in" };

export const BUILT_IN_PLAN: SubscriptionPlan = {
  name: "GreekGeek subscription",
  priceCents: 3_000,
  interval: "month",
  features: ["Unlimited members, officers, and alumni", "Dues, installments, and offline payment tracking", "Chat, events, recruitment, and standards tools", "Auditable ledger and exports"],
};

export async function getPublishedPricing(): Promise<PublishedPricing> {
  "use cache";
  cacheLife("hours");
  const supabase = createPublicClient();
  if (supabase) {
    const { data: planRow } = await supabase
      .from("saas_plans")
      .select("name, price_cents, billing_interval, features")
      .eq("code", "chapter_monthly")
      .eq("active", true)
      .maybeSingle();
    const plan: SubscriptionPlan = planRow
      ? { name: planRow.name, priceCents: Number(planRow.price_cents), interval: planRow.billing_interval, features: planRow.features ?? [] }
      : BUILT_IN_PLAN;
    const { data } = await supabase
      .from("pricing_rules")
      .select("name, platform_fee_bps, platform_fee_fixed_cents, min_fee_cents, max_fee_cents, refund_policy")
      .eq("is_default", true)
      .eq("status", "active")
      .maybeSingle();
    if (data) {
      return {
        name: data.name,
        plan,
        source: "database",
        rule: {
          platformFeeBps: data.platform_fee_bps,
          platformFeeFixedCents: data.platform_fee_fixed_cents,
          minFeeCents: data.min_fee_cents,
          maxFeeCents: data.max_fee_cents,
          refundPolicy: data.refund_policy,
        },
      };
    }
  }
  return { rule: DEFAULT_PRICING_RULE, name: "Standard dues pricing", plan: BUILT_IN_PLAN, source: "built_in" };
}

export type TermsDocument = { id: string; kind: string; version: string; title: string; summary: string; body: string; published_at: string };

export async function getPublishedTerms(kind: "chapter_agreement" | "terms_of_service" | "privacy_policy"): Promise<TermsDocument | null> {
  "use cache";
  cacheLife("hours");
  const supabase = createPublicClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("terms_documents")
    .select("id, kind, version, title, summary, body, published_at")
    .eq("kind", kind)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as TermsDocument | null) ?? null;
}
