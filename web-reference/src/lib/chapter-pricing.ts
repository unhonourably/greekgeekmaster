import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPricing, type SubscriptionPlan } from "@/lib/pricing";
import type { PricingRule } from "@/lib/fees";

export async function getChapterPricing(chapterId: string): Promise<{ rule: PricingRule; ruleName: string; plan: SubscriptionPlan; agreed: boolean }> {
  const published = await getPublishedPricing();
  const supabase = await createClient();
  const { data: chapter } = await supabase.from("chapters").select("pricing_rule_id").eq("id", chapterId).maybeSingle();
  if (chapter?.pricing_rule_id) {
    const { data } = await supabase
      .from("pricing_rules")
      .select("name, platform_fee_bps, platform_fee_fixed_cents, min_fee_cents, max_fee_cents, refund_policy")
      .eq("id", chapter.pricing_rule_id)
      .maybeSingle();
    if (data) {
      return {
        agreed: true,
        ruleName: data.name,
        plan: published.plan,
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
  return { agreed: false, ruleName: published.name, plan: published.plan, rule: published.rule };
}
