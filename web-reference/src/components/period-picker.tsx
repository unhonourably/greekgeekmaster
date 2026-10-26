import Link from "next/link";
import { cx } from "@/components/ui";
import { PERIODS, type PeriodKey } from "@/lib/periods";

export function PeriodPicker({ current, href }: { current: PeriodKey; href: (key: PeriodKey) => string }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Period">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={href(p.key)}
          aria-current={p.key === current ? "true" : undefined}
          className={cx("rounded px-2.5 py-1 text-[13px]", p.key === current ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:text-ink")}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
