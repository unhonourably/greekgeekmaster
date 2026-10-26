import { describe, expect, it } from "vitest";
import { formatCents, parseDollarsToCents, sumCents } from "@/lib/money";
import { addMonthsClamped, splitIntoInstallments, validateSchedule } from "@/lib/installments";
import { canTransition, isCollected } from "@/lib/payment-state";
import { canGrantRole, toPermissionSet } from "@/lib/permissions";
import { domainMatches, normalizeChapterName, slugify } from "@/lib/names";

describe("money", () => {
  it("formats cents", () => {
    expect(formatCents(45_000)).toBe("$450.00");
    expect(formatCents(-675)).toBe("−$6.75");
    expect(formatCents(5, "usd", { signed: true })).toBe("+$0.05");
  });

  it("parses dollar input strictly", () => {
    expect(parseDollarsToCents("450")).toBe(45_000);
    expect(parseDollarsToCents("$1,234.5")).toBe(123_450);
    expect(parseDollarsToCents("0.07")).toBe(7);
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
  });

  it("sums only integer cents", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(() => sumCents([1.5])).toThrow(RangeError);
  });
});

describe("installments", () => {
  it("puts the rounding remainder on the final installment", () => {
    const plan = splitIntoInstallments(45_001, 3, "2026-09-01");
    expect(plan.map((i) => i.amountCents)).toEqual([15_000, 15_000, 15_001]);
    expect(plan.map((i) => i.dueDate)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(validateSchedule(plan, 45_001)).toBeNull();
  });

  it("clamps month-end dates", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("rejects schedules that do not sum to the balance or go backwards", () => {
    expect(validateSchedule([{ sequence: 1, amountCents: 100, dueDate: "2026-01-01" }, { sequence: 2, amountCents: 100, dueDate: "2026-02-01" }], 201)).toMatch(/add up/);
    expect(validateSchedule([{ sequence: 1, amountCents: 100, dueDate: "2026-02-01" }, { sequence: 2, amountCents: 100, dueDate: "2026-01-01" }], 200)).toMatch(/order/);
  });

  it("rejects too many or too small installments", () => {
    expect(() => splitIntoInstallments(100, 3, "2026-01-01")).toThrow(RangeError);
    expect(() => splitIntoInstallments(100_000, 13, "2026-01-01")).toThrow(RangeError);
  });
});

describe("payment state machine", () => {
  it("allows forward transitions and rejects regressions", () => {
    expect(canTransition("pending", "succeeded")).toBe(true);
    expect(canTransition("succeeded", "pending")).toBe(false);
    expect(canTransition("refunded", "succeeded")).toBe(false);
    expect(canTransition("disputed", "succeeded")).toBe(true);
    expect(canTransition("failed", "succeeded")).toBe(true);
  });

  it("counts only collected states as collected", () => {
    expect(isCollected("succeeded")).toBe(true);
    expect(isCollected("pending")).toBe(false);
    expect(isCollected("refunded")).toBe(false);
  });
});

describe("permissions", () => {
  it("only grants roles whose permissions the granter holds", () => {
    const treasurer = toPermissionSet(["roles.manage", "finance.view", "finance.manage"]);
    expect(canGrantRole(treasurer, ["finance.view"], false)).toBe(true);
    expect(canGrantRole(treasurer, ["finance.refund"], false)).toBe(false);
    expect(canGrantRole(treasurer, [], true)).toBe(false);
    expect(canGrantRole(toPermissionSet(["finance.view"]), ["finance.view"], false)).toBe(false);
  });

  it("drops unknown permission strings", () => {
    expect([...toPermissionSet(["finance.view", "root.everything"])]).toEqual(["finance.view"]);
  });
});

describe("names", () => {
  it("normalizes Greek letters, punctuation, and filler words", () => {
    expect(normalizeChapterName("The Alpha Beta Chapter of ΣΧ Fraternity")).toBe("alpha beta sigma chi");
    expect(normalizeChapterName("Sigma Chi — Alpha Beta")).toBe("sigma chi alpha beta");
  });

  it("slugifies", () => {
    expect(slugify("Sigma Chi — Alpha Beta @ State")).toBe("sigma-chi-alpha-beta-state");
  });

  it("matches institutional email domains including subdomains", () => {
    expect(domainMatches("a@student.state.edu", ["state.edu"])).toBe(true);
    expect(domainMatches("a@evilstate.edu", ["state.edu"])).toBe(false);
    expect(domainMatches("a@gmail.com", ["state.edu"])).toBe(false);
  });
});
