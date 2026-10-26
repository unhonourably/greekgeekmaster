"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Compass, LockKeyhole } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";

type Section = { match: RegExp; area: string; who: string };

const SECTIONS: Section[] = [
  { match: /^settings\/members/, area: "Members and invitations", who: "officers who manage the roster, usually the president, vice president or secretary" },
  { match: /^settings\/roles/, area: "Roles and officer positions", who: "officers who can manage roles, usually the president" },
  { match: /^settings\/billing/, area: "Stripe and billing", who: "the president, treasurer or anyone with finance access" },
  { match: /^settings\/audit/, area: "The audit log", who: "the president, vice president and treasurer" },
  { match: /^settings/, area: "Chapter settings", who: "chapter officers with settings access" },
  { match: /^finances/, area: "Chapter finances", who: "the treasurer and officers with finance access" },
  { match: /^reimbursements/, area: "Reimbursements", who: "members of this chapter with reimbursement access" },
  { match: /^recruitment/, area: "Recruitment", who: "the recruitment chair and officers with recruitment access" },
  { match: /^analytics/, area: "Chapter analytics", who: "the president, vice president and chairs with analytics access" },
  { match: /^chat\/reports/, area: "Chat moderation", who: "chat moderators" },
  { match: /^chat/, area: "This conversation", who: "members who were added to it" },
  { match: /^housing\/(manage|rooms)/, area: "Housing management", who: "the house manager and officers with housing access" },
  { match: /^standards\/incidents/, area: "Standards cases", who: "the standards board" },
  { match: /^standards/, area: "Standards", who: "the standards board" },
  { match: /^events\/[^/]+\/(attendance|check-in|scan)/, area: "Event attendance", who: "officers who run check-in and attendance" },
  { match: /^events/, area: "Event management", who: "officers who manage events" },
  { match: /^announcements/, area: "Announcements", who: "officers who can publish announcements" },
  { match: /^philanthropy/, area: "Philanthropy management", who: "the philanthropy chair" },
  { match: /^academics/, area: "Academic records", who: "the scholarship chair" },
];

export function AccessView() {
  const params = useParams<{ slug?: string }>();
  const pathname = usePathname() ?? "";
  const slug = params?.slug;
  const base = slug ? `/c/${slug}` : null;
  const rest = base && pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const section = SECTIONS.find((s) => s.match.test(rest));

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center" role="alert">
      <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <LockKeyhole className="size-5" aria-hidden />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Officer access required</p>
      <h2 className="mt-2 text-lg font-semibold text-ink">{section ? `${section.area} is limited` : "You don't have access to this page"}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-2">
        {section
          ? `Only ${section.who} can open this page. Your current role doesn't include that permission.`
          : "Your current role in this chapter doesn't include the permission this page needs."}
      </p>
      <div className="mt-6 w-full rounded-lg border border-line bg-surface p-4 text-left">
        <p className="text-sm font-medium text-ink">Need access?</p>
        <p className="mt-1 text-sm text-ink-2">
          Ask your chapter president to add the permission to your role, or to give you an officer position that includes it. Changes take effect the next time you load the page.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => window.history.back()}>Go back</Button>
        <Link href={base ?? "/home"} className={buttonClass("primary", "md")}>{base ? "Chapter overview" : "Home"}</Link>
        {base ? (
          <Link href={`${base}/directory`} className={buttonClass("ghost", "md")}>See who&apos;s an officer</Link>
        ) : null}
      </div>
    </div>
  );
}

export function MissingView() {
  const params = useParams<{ slug?: string }>();
  const base = params?.slug ? `/c/${params.slug}` : null;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-subtle text-ink-2">
        <Compass className="size-5" aria-hidden />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Not found</p>
      <h2 className="mt-2 text-lg font-semibold text-ink">This page isn&apos;t here</h2>
      <p className="mt-2 text-sm leading-6 text-ink-2">
        {base
          ? "It may have been removed, the link may be out of date, or this feature might not be turned on for your chapter."
          : "The link may be out of date, or the page may have moved."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => window.history.back()}>Go back</Button>
        <Link href={base ?? "/"} className={buttonClass("primary", "md")}>{base ? "Chapter overview" : "Home"}</Link>
      </div>
    </div>
  );
}
