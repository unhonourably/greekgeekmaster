export type PeriodKey = "month" | "last_month" | "quarter" | "year" | "all";

export const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "Last 90 days" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export function parsePeriod(value: unknown): PeriodKey {
  return PERIODS.some((p) => p.key === value) ? (value as PeriodKey) : "month";
}

export function periodRange(key: PeriodKey, now: Date = new Date()): { from: Date; to: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (key) {
    case "month":
      return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
    case "last_month":
      return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
    case "quarter":
      return { from: new Date(now.getTime() - 90 * 86_400_000), to: new Date(now.getTime() + 60_000) };
    case "year":
      return { from: new Date(Date.UTC(y, 0, 1)), to: new Date(Date.UTC(y + 1, 0, 1)) };
    case "all":
      return { from: new Date(Date.UTC(2000, 0, 1)), to: new Date(now.getTime() + 60_000) };
  }
}
