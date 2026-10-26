import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { formatCents } from "@/lib/money";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft hover:border-danger/40",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button suppressHydrationWarning className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

const fieldBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-subtle disabled:text-ink-3 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input suppressHydrationWarning className={cx(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea suppressHydrationWarning className={cx(fieldBase, "py-2 min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select suppressHydrationWarning className={cx(fieldBase, "h-9 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cx("block text-[13px] font-medium text-ink", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx("flex items-start gap-3 text-sm", className)}>
      <input suppressHydrationWarning type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-accent" {...props} />
      <span>
        <span className="text-ink">{label}</span>
        {description ? <span className="block text-[13px] text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("px-5 py-4", className)} {...props} />;
}

export type Tone = "neutral" | "accent" | "positive" | "warning" | "danger" | "info" | "gold";

const toneClass: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  positive: "bg-positive-soft text-positive border-positive/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
  gold: "bg-gold-soft text-gold border-gold/25",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[12px] font-medium leading-5 whitespace-nowrap", toneClass[tone], className)}>
      {children}
    </span>
  );
}

const noticeIcon: Record<"info" | "positive" | "warning" | "danger", LucideIcon> = {
  info: Info,
  positive: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export function Notice({ tone = "info", title, children, action, className }: { tone?: "info" | "positive" | "warning" | "danger"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = noticeIcon[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-md border px-4 py-3 text-sm", toneClass[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-ink">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cx("text-ink-2", Boolean(title) && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-md border border-line bg-canvas text-ink-3">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      {children ? <div className="mt-1 max-w-sm text-[13px] text-ink-3">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[13px] text-ink-3">{eyebrow}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" | "positive" }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={cx("mt-1 text-xl font-semibold tnum", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "positive" ? "text-positive" : "text-ink")}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-[12px] text-ink-3">{hint}</dd> : null}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx("grid divide-line rounded-lg border border-line bg-surface sm:grid-cols-2 sm:divide-x lg:grid-cols-4 [&>*]:border-line max-sm:divide-y", className)}>{children}</dl>;
}

export function Money({ cents, currency = "usd", className, signed }: { cents: number; currency?: string; className?: string; signed?: boolean }) {
  return <span className={cx("tnum", className)}>{formatCents(cents, currency, { signed })}</span>;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, align, ...props }: ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cx("border-b border-line bg-canvas/60 px-4 py-2 text-[12px] font-medium text-ink-3 whitespace-nowrap", align === "right" ? "text-right" : "text-left", className)}
      {...props}
    />
  );
}

export function Td({ className, align, ...props }: ComponentProps<"td"> & { align?: "left" | "right" }) {
  return <td className={cx("border-b border-line px-4 py-2.5 align-middle text-ink", align === "right" && "text-right tnum", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cx("[&:last-child>td]:border-b-0 hover:bg-canvas/50", className)} {...props} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-canvas px-1 font-mono text-[11px] text-ink-2">{children}</kbd>;
}

export function DefinitionList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-3 gap-4 py-2.5 text-sm">
          <dt className="text-ink-3">{item.label}</dt>
          <dd className="col-span-2 text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cx("text-accent underline-offset-2 hover:underline", className)} {...props} />;
}
