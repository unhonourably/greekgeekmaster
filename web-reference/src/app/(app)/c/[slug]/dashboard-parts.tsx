import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";

export function Tile({ icon: Icon, label, value, hint, href, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; hint?: string; href?: string | null; tone?: "accent" | "warning" }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-3">{label}</span>
        <span className={cx("grid size-7 place-items-center rounded-md", tone === "accent" ? "bg-accent-soft text-accent" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-subtle text-ink-2")}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink tnum">{typeof value === "number" ? value.toLocaleString("en-US") : value}</p>
      {hint ? <p className="mt-0.5 truncate text-[12px] text-ink-3">{hint}</p> : null}
    </>
  );
  if (!href) return <div className="rounded-lg border border-line bg-surface p-4">{body}</div>;
  return (
    <Link href={href} className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-subtle/40">
      {body}
    </Link>
  );
}

export function Meter({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: number | null; detail: string }) {
  const tone = value === null ? "bg-subtle" : value >= 80 ? "bg-positive" : value >= 60 ? "bg-accent" : "bg-warning";
  return (
    <li>
      <div className="flex items-center gap-2 text-[13px]">
        <Icon className="size-4 text-ink-3" aria-hidden />
        <span className="flex-1 text-ink-2">{label}</span>
        <span className="font-semibold text-ink tnum">{value === null ? "No data" : `${Math.round(value)}%`}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
        <span className={cx("block h-full rounded-full", tone)} style={{ width: `${value ?? 0}%` }} />
      </div>
      <p className="mt-1 text-[12px] text-ink-3">{detail}</p>
    </li>
  );
}

export function Figure({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "warning" }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cx("mt-0.5 text-lg font-semibold tnum", tone === "warning" ? "text-warning" : "text-ink")}>{value}</dd>
      {hint ? <dd className="text-[11px] text-ink-3">{hint}</dd> : null}
    </div>
  );
}
