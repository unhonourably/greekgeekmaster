import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";

export function AuthHeading({ eyebrow, title, description }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow ? <p className="mb-2 text-[13px] text-ink-3">{eyebrow}</p> : null}
      <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-ink-2">{description}</p> : null}
    </header>
  );
}

export function AuthFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("mt-8 border-t border-line pt-6 text-center text-sm text-ink-3", className)}>{children}</p>;
}

export function AuthStatus({ icon: Icon, tone = "accent", title, children }: { icon: LucideIcon; tone?: "accent" | "danger"; title: string; children?: ReactNode }) {
  return (
    <div className="text-center">
      <span className={cx("mx-auto grid size-14 place-items-center rounded-full border", tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : "border-accent/30 bg-accent-soft text-accent")}>
        <Icon className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 font-serif text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
      {children ? <div className="mt-3 text-sm leading-6 text-ink-2">{children}</div> : null}
    </div>
  );
}

export const authLink = "font-medium text-accent hover:text-accent-hover hover:underline underline-offset-4";
