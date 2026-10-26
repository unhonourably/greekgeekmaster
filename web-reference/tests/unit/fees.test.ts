import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_RULE,
  calculatePlatformFee,
  estimateProcessingFee,
  feeBreakdown,
  formatBps,
  projectCollections,
  proportionalFeeRefund,
  type PricingRule,
} from "@/lib/fees";

describe("calculatePlatformFee", () => {
  it("charges 1.5% of a $450 payment as $6.75", () => {
    expect(calculatePlatformFee(45_000, DEFAULT_PRICING_RULE)).toBe(675);
  });

  it("rounds half a cent up", () => {
    expect(calculatePlatformFee(100, DEFAULT_PRICING_RULE)).toBe(2);
    expect(calculatePlatformFee(33, DEFAULT_PRICING_RULE)).toBe(0);
    expect(calculatePlatformFee(34, DEFAULT_PRICING_RULE)).toBe(1);
    expect(calculatePlatformFee(12_345, DEFAULT_PRICING_RULE)).toBe(185);
  });

  it("charges nothing for zero or negative amounts", () => {
    expect(calculatePlatformFee(0, DEFAULT_PRICING_RULE)).toBe(0);
    expect(calculatePlatformFee(-500, DEFAULT_PRICING_RULE)).toBe(0);
  });

  it("applies fixed, minimum, and maximum fees and never exceeds the amount", () => {
    const rule: PricingRule = { platformFeeBps: 100, platformFeeFixedCents: 25, minFeeCents: 50, maxFeeCents: 1_000, refundPolicy: "proportional" };
    expect(calculatePlatformFee(1_000, rule)).toBe(50);
    expect(calculatePlatformFee(10_000, rule)).toBe(125);
    expect(calculatePlatformFee(1_000_000, rule)).toBe(1_000);
    expect(calculatePlatformFee(30, rule)).toBe(30);
  });

  it("rejects fractional cents", () => {
    expect(() => calculatePlatformFee(10.5, DEFAULT_PRICING_RULE)).toThrow(RangeError);
  });

  it("charges each installment separately with total within rounding of a single payment", () => {
    const single = calculatePlatformFee(45_000, DEFAULT_PRICING_RULE);
    const split = [15_000, 15_000, 15_000].map((a) => calculatePlatformFee(a, DEFAULT_PRICING_RULE));
    expect(split.reduce((a, b) => a + b, 0)).toBe(single);
    const uneven = [33_333, 11_667].map((a) => calculatePlatformFee(a, DEFAULT_PRICING_RULE));
    expect(Math.abs(uneven.reduce((a, b) => a + b, 0) - single)).toBeLessThanOrEqual(1);
  });
});

describe("estimateProcessingFee", () => {
  it("estimates card processing at 2.9% + 30 cents", () => {
    expect(estimateProcessingFee(45_000, "card")).toBe(1_335);
  });

  it("caps ACH processing at $5", () => {
    expect(estimateProcessingFee(45_000, "us_bank_account")).toBe(360);
    expect(estimateProcessingFee(100_000, "us_bank_account")).toBe(500);
  });
});

describe("feeBreakdown and projections", () => {
  it("shows the member pays the dues amount and the chapter absorbs fees", () => {
    const b = feeBreakdown(45_000, "card");
    expect(b.memberPaysCents).toBe(45_000);
    expect(b.platformFeeCents).toBe(675);
    expect(b.estimatedChapterNetCents).toBe(45_000 - 675 - 1_335);
  });

  it("projects a semester of collections", () => {
    const p = projectCollections(45_000, 80, "card");
    expect(p.grossCents).toBe(3_600_000);
    expect(p.platformFeeCents).toBe(54_000);
    expect(p.estimatedChapterNetCents).toBe(3_600_000 - 54_000 - 106_800);
  });
});

describe("proportionalFeeRefund", () => {
  it("returns the full fee on a full refund", () => {
    expect(proportionalFeeRefund(675, 45_000, 45_000, 0, DEFAULT_PRICING_RULE)).toBe(675);
  });

  it("returns a rounded share on a partial refund and never more than remains", () => {
    expect(proportionalFeeRefund(675, 45_000, 15_000, 0, DEFAULT_PRICING_RULE)).toBe(225);
    expect(proportionalFeeRefund(675, 45_000, 45_000, 600, DEFAULT_PRICING_RULE)).toBe(75);
  });

  it("returns nothing when the policy is none", () => {
    expect(proportionalFeeRefund(675, 45_000, 45_000, 0, { ...DEFAULT_PRICING_RULE, refundPolicy: "none" })).toBe(0);
  });

  it("rejects refunds larger than the payment", () => {
    expect(() => proportionalFeeRefund(675, 45_000, 45_001, 0, DEFAULT_PRICING_RULE)).toThrow(RangeError);
  });
});

describe("formatBps", () => {
  it("formats basis points as a percentage", () => {
    expect(formatBps(150)).toBe("1.5%");
    expect(formatBps(200)).toBe("2%");
    expect(formatBps(125)).toBe("1.25%");
  });
});
