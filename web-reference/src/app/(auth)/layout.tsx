import Link from "next/link";
import { CalendarCheck, CreditCard, MessagesSquare } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Notice } from "@/components/ui";
import { brand } from "@/config/brand";
import { isSupabaseConfigured } from "@/lib/env";

export const instant = false;

const POINTS = [
  { icon: CreditCard, title: "Dues, collected online", body: "Members pay by card or bank. Treasurers see every payment reconcile on its own." },
  { icon: MessagesSquare, title: "One place to talk", body: "Chapter channels, direct messages, and announcements members actually read." },
  { icon: CalendarCheck, title: "Events that run themselves", body: "RSVPs, QR check-in, and attendance records without the spreadsheet." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-full flex-1 bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_0%_0%,rgba(224,165,53,0.16),transparent_60%),radial-gradient(ellipse_60%_50%_at_100%_100%,rgba(224,165,53,0.08),transparent_65%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,#f4ece0_1px,transparent_1px),linear-gradient(to_bottom,#f4ece0_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <Wordmark />
          <div className="max-w-md">
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-accent">For Greek life</p>
            <h2 className="mt-4 font-serif text-4xl font-semibold leading-[1.15] tracking-tight text-ink xl:text-[44px]">
              Run your chapter from one place.
            </h2>
            <ul className="mt-10 space-y-6">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent-soft text-accent">
                    <p.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{p.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-ink-3">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[12px] text-ink-3">
            &copy; {brand.name} &middot;{" "}
            <Link href="/legal/terms" className="hover:text-ink-2">Terms</Link> &middot;{" "}
            <Link href="/legal/privacy" className="hover:text-ink-2">Privacy</Link>
          </p>
        </div>
      </aside>

      <main className="relative flex flex-col items-center px-6 py-10 sm:py-14 lg:justify-center lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_70%_100%_at_50%_0%,rgba(224,165,53,0.10),transparent_70%)] lg:hidden" />
        <div className="relative mb-10 lg:hidden">
          <Wordmark />
        </div>
        <div className="fade-up relative w-full max-w-[400px]">
          {!isSupabaseConfigured() ? (
            <Notice tone="warning" title="Database not connected" className="mb-6">
              Add the Supabase variables from .env.example to .env.local and restart the server to enable sign-in.
            </Notice>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
