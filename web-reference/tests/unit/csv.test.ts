import { describe, expect, it } from "vitest";
import { centsToCsv, csvCell, toCsv } from "@/lib/csv";
import { parsePeriod, periodRange } from "@/lib/periods";
import { paymentMethodLabel, paymentTone } from "@/lib/payment-state";

describe("csv export", () => {
  it("quotes commas, quotes, and newlines", () => {
    expect(csvCell('Smith, "Jo"')).toBe('"Smith, ""Jo"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("formats cents without floating point error", () => {
    expect(centsToCsv(45_000)).toBe("450.00");
    expect(centsToCsv(675)).toBe("6.75");
    expect(centsToCsv(-5)).toBe("-0.05");
    expect(centsToCsv(null)).toBe("");
  });

  it("builds CRLF rows with a header", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

describe("reporting periods", () => {
  it("falls back to this month for unknown values", () => {
    expect(parsePeriod("nonsense")).toBe("month");
    expect(parsePeriod("year")).toBe("year");
  });

  it("computes half-open month ranges", () => {
    const now = new Date(Date.UTC(2026, 0, 15, 12));
    expect(periodRange("month", now)).toEqual({ from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 1, 1)) });
    expect(periodRange("last_month", now)).toEqual({ from: new Date(Date.UTC(2025, 11, 1)), to: new Date(Date.UTC(2026, 0, 1)) });
  });
});

describe("payment labels", () => {
  it("labels methods and tones", () => {
    expect(paymentMethodLabel("offline", "check")).toBe("Check");
    expect(paymentMethodLabel("stripe", "us_bank_account")).toBe("Bank (ACH)");
    expect(paymentTone("succeeded")).toBe("positive");
    expect(paymentTone("dispute_lost")).toBe("danger");
  });
});
