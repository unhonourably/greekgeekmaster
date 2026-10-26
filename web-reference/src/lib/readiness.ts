import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Readiness = {
  verified: boolean;
  terms_accepted: boolean;
  account_created: boolean;
  card_payments: string;
  payouts: string;
  requirements_due: string[];
  subscription: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused" | "none" | string;
  can_collect: boolean;
};

export const getReadiness = cache(async (chapterId: string): Promise<Readiness | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("chapter_payment_readiness", { p_chapter: chapterId });
  return (data as Readiness | null) ?? null;
});

export function subscriptionInGoodStanding(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment overdue",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Awaiting first payment",
  incomplete_expired: "Expired",
  paused: "Paused",
  none: "Not started",
};
