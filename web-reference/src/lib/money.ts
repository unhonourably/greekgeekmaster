export const MAX_AMOUNT_CENTS = 10_000_000;

export function assertCents(value: number, label = "amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents`);
  }
}

export function formatCents(cents: number, currency = "usd", options: { signed?: boolean } = {}): string {
  assertCents(cents);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${formatted}`;
  if (options.signed && cents > 0) return `+${formatted}`;
  return formatted;
}

export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToInputValue(cents: number): string {
  assertCents(cents);
  return (cents / 100).toFixed(2);
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => {
    assertCents(value);
    return total + value;
  }, 0);
}
