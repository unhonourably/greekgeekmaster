import { assertCents } from "./money";

export type PricingRule = {
  platformFeeBps: number;
  platformFeeFixedCents: number;
  minFeeCents: number | null;
  maxFeeCents: number | null;
  refundPolicy: "proportional" | "none";
};

export type PaymentMethodKind = "card" | "us_bank_account";

export type ProcessingFeeSchedule = {
  card: { bps: number; fixedCents: number; capCents: number | null };
  us_bank_account: { bps: number; fixedCents: number; capCents: number | null };
  asOf: string;
};

export const STRIPE_US_STANDARD_ESTIMATE: ProcessingFeeSchedule = {
  card: { bps: 290, fixedCents: 30, capCents: null },
  us_bank_account: { bps: 80, fixedCents: 0, capCents: 500 },
  asOf: "2026-10",
};

export const DEFAULT_PRICING_RULE: PricingRule = {
  platformFeeBps: 150,
  platformFeeFixedCents: 0,
  minFeeCents: null,
  maxFeeCents: null,
  refundPolicy: "proportional",
};

function roundHalfUpDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculatePlatformFee(amountCents: number, rule: PricingRule): number {
  assertCents(amountCents);
  if (amountCents <= 0) return 0;
  let fee = Math.floor((amountCents * rule.platformFeeBps + 5000) / 10000) + rule.platformFeeFixedCents;
  if (rule.minFeeCents !== null) fee = Math.max(fee, rule.minFeeCents);
  if (rule.maxFeeCents !== null) fee = Math.min(fee, rule.maxFeeCents);
  return Math.min(fee, amountCents);
}

export function estimateProcessingFee(
  amountCents: number,
  method: PaymentMethodKind,
  schedule: ProcessingFeeSchedule = STRIPE_US_STANDARD_ESTIMATE,
): number {
  assertCents(amountCents);
  if (amountCents <= 0) return 0;
  const { bps, fixedCents, capCents } = schedule[method];
  const fee = Math.floor((amountCents * bps + 5000) / 10000) + fixedCents;
  return capCents === null ? fee : Math.min(fee, capCents);
}

export function proportionalFeeRefund(
  applicationFeeCents: number,
  paymentAmountCents: number,
  refundAmountCents: number,
  alreadyRefundedFeeCents: number,
  rule: PricingRule,
): number {
  assertCents(applicationFeeCents);
  assertCents(paymentAmountCents);
  assertCents(refundAmountCents);
  if (rule.refundPolicy === "none" || applicationFeeCents <= 0 || paymentAmountCents <= 0) return 0;
  if (refundAmountCents <= 0 || refundAmountCents > paymentAmountCents) {
    throw new RangeError("refund must be between 1 cent and the payment amount");
  }
  const share = roundHalfUpDiv(applicationFeeCents * refundAmountCents, paymentAmountCents);
  return Math.max(0, Math.min(share, applicationFeeCents - alreadyRefundedFeeCents));
}

export type FeeBreakdown = {
  duesCents: number;
  platformFeeCents: number;
  estimatedProcessingFeeCents: number;
  memberPaysCents: number;
  estimatedChapterNetCents: number;
};

export function feeBreakdown(
  duesCents: number,
  method: PaymentMethodKind,
  rule: PricingRule = DEFAULT_PRICING_RULE,
  schedule: ProcessingFeeSchedule = STRIPE_US_STANDARD_ESTIMATE,
): FeeBreakdown {
  const platformFeeCents = calculatePlatformFee(duesCents, rule);
  const estimatedProcessingFeeCents = estimateProcessingFee(duesCents, method, schedule);
  return {
    duesCents,
    platformFeeCents,
    estimatedProcessingFeeCents,
    memberPaysCents: duesCents,
    estimatedChapterNetCents: duesCents - platformFeeCents - estimatedProcessingFeeCents,
  };
}

export type Projection = {
  payments: number;
  grossCents: number;
  platformFeeCents: number;
  estimatedProcessingFeeCents: number;
  estimatedChapterNetCents: number;
  effectiveCostBps: number;
};

export function projectCollections(
  duesCents: number,
  payments: number,
  method: PaymentMethodKind,
  rule: PricingRule = DEFAULT_PRICING_RULE,
  schedule: ProcessingFeeSchedule = STRIPE_US_STANDARD_ESTIMATE,
): Projection {
  if (!Number.isSafeInteger(payments) || payments < 0) throw new RangeError("payments must be a non-negative integer");
  const single = feeBreakdown(duesCents, method, rule, schedule);
  const grossCents = duesCents * payments;
  const platformFeeCents = single.platformFeeCents * payments;
  const estimatedProcessingFeeCents = single.estimatedProcessingFeeCents * payments;
  return {
    payments,
    grossCents,
    platformFeeCents,
    estimatedProcessingFeeCents,
    estimatedChapterNetCents: grossCents - platformFeeCents - estimatedProcessingFeeCents,
    effectiveCostBps: grossCents === 0 ? 0 : Math.round(((platformFeeCents + estimatedProcessingFeeCents) * 10000) / grossCents),
  };
}

export function formatBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(percent * 10 === Math.trunc(percent * 10) ? 1 : 2)}%`;
}
