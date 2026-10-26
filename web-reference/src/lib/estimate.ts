import type { PaymentMethodKind } from "@/lib/fees";

export type EstimateInput = { dues: string; members: string; method: PaymentMethodKind; parts: string; months: string };

export const ESTIMATE_DEFAULTS: EstimateInput = { dues: "450", members: "60", method: "card", parts: "1", months: "4" };

const PARTS = ["1", "2", "3", "4"];
const MONTHS = ["1", "4", "5", "9", "12"];

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.slice(0, 20) : undefined;
}

export function readEstimateParams(sp: Record<string, string | string[] | undefined>): EstimateInput {
  const method = one(sp.method);
  const parts = one(sp.parts);
  const months = one(sp.months);
  return {
    dues: one(sp.dues) ?? ESTIMATE_DEFAULTS.dues,
    members: one(sp.members) ?? ESTIMATE_DEFAULTS.members,
    method: method === "us_bank_account" ? "us_bank_account" : "card",
    parts: parts && PARTS.includes(parts) ? parts : ESTIMATE_DEFAULTS.parts,
    months: months && MONTHS.includes(months) ? months : ESTIMATE_DEFAULTS.months,
  };
}
