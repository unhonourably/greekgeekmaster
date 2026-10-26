import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  BarChart3,
  BedDouble,
  BookOpen,
  Calculator,
  CalendarCheck,
  ClipboardCheck,
  FileSpreadsheet,
  HandCoins,
  HandHeart,
  Megaphone,
  MessagesSquare,
  MousePointerClick,
  PiggyBank,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Upload,
  UserRoundSearch,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { ChatDemo } from "@/components/feature-demos/chat";
import { CheckInDemo } from "@/components/feature-demos/events";
import { InstallmentDemo, LedgerDemo } from "@/components/feature-demos/money";
import { AnnouncementDemo, HoursDemo, PolicyDemo } from "@/components/feature-demos/operations";
import { PrivacyDemo, RolesDemo } from "@/components/feature-demos/people";
import { RecruitmentDemo } from "@/components/feature-demos/recruitment";
import { DuesExample, FeeCalculator, PricingEstimate } from "@/components/fee-calculator";
import { ButtonLink, TextLink } from "@/components/ui";
import { PERMISSIONS } from "@/lib/permissions";
import { getPublishedPricing } from "@/lib/pricing";
import { JumpLink, SectionNav } from "./section-nav";

export const metadata: Metadata = {
  title: "Features",
  description: "Dues, ledger, chat, events, recruitment, roles, announcements, philanthropy, and standards. Every demo on the page is interactive.",
};

const SECTIONS = [
  { id: "dues", label: "Dues" },
  { id: "ledger", label: "Ledger" },
  { id: "calculator", label: "Dues calculator" },
  { id: "chat", label: "Chat" },
  { id: "events", label: "Events" },
  { id: "recruitment", label: "Recruitment" },
  { id: "roles", label: "Roles" },
  { id: "privacy", label: "Privacy" },
  { id: "announcements", label: "Announcements" },
  { id: "philanthropy", label: "Philanthropy" },
  { id: "standards", label: "Standards" },
  { id: "more", label: "More" },
];

const MORE: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: BedDouble, title: "Chapter housing", body: "Rooms and beds, move-ins, roommate requests, and rent billed to residents." },
  { icon: BookOpen, title: "Academics", body: "Study groups, mentorship pairs, and personal goals. Grades are never collected." },
  { icon: PiggyBank, title: "Budgets", body: "Budget lines by category, with expenses recorded against them that can't be edited later." },
  { icon: Receipt, title: "Reimbursements", body: "Members ask to be paid back for chapter purchases, and a finance officer who isn't them decides." },
  { icon: BarChart3, title: "Analytics", body: "Attendance, check-ins, service hours, messages, and where every prospect sits in the pipeline." },
  { icon: FileSpreadsheet, title: "Exports and reports", body: "CSV exports of payments, balances, and the ledger for your accountant." },
  { icon: Upload, title: "Roster import", body: "Upload a CSV to invite a whole chapter at once." },
  { icon: ScrollText, title: "Audit log", body: "Every officer action, with who did it and when." },
  { icon: BadgeCheck, title: "Verified chapters", body: "Every chapter is reviewed before it can collect money or invite members." },
];

function Feature({ id, icon: Icon, eyebrow, title, body, points, children }: { id: string; icon: LucideIcon; eyebrow: string; title: string; body: string; points: string[]; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-12 border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
              <Icon className="size-4 text-accent" aria-hidden />
              {eyebrow}
            </p>
            <h2 className="mt-3 font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
            <p className="mt-3 text-ink-2">{body}</p>
          </div>
          <ul className="grid gap-x-6 gap-y-2 text-sm text-ink-2 sm:grid-cols-2">
            {points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 min-w-0">{children}</div>
      </div>
    </section>
  );
}

export default async function FeaturesPage() {
  const { rule, plan } = await getPublishedPricing();
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <div className="max-w-3xl">
            <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">Every feature, ready to try.</h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-2">
              Each section below is a working copy of a real GreekGeek screen, loaded with a made-up sample chapter. Click, type, and submit as much as you like.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup">Register your chapter</ButtonLink>
              <JumpLink to="dues" className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-subtle">
                Start with dues
              </JumpLink>
            </div>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            {[
              { icon: MousePointerClick, title: "Everything is interactive", body: "Buttons, forms, and toggles all work. Look for the Interactive label above each demo." },
              { icon: RotateCcw, title: "Nothing is saved", body: "It all runs in your browser. Reset puts a demo back the way it started." },
              { icon: ShieldCheck, title: "Same screens, sample data", body: "Labels, rules, and layouts match the app. The people and numbers are invented." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-canvas p-5">
                <Icon className="size-4 text-accent" aria-hidden />
                <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionNav sections={SECTIONS} />

      <Feature
        id="dues"
        icon={HandCoins}
        eyebrow="Dues and payments"
        title="Members pay what they owe, on a schedule they can manage."
        body="Officers bill the chapter once. When an officer allows it, members split a charge into installments themselves, then pay by card or bank on Stripe's checkout. The money goes to your chapter's own Stripe account."
        points={["Up to 12 installments when the officer allows them", "Reminders before and after balances come due", "Cash and checks recorded next to online payments", "A receipt number for every payment"]}
      >
        <InstallmentDemo />
      </Feature>

      <Feature
        id="ledger"
        icon={ScrollText}
        eyebrow="Ledger"
        title="Books that balance on every entry."
        body="Charges, payments, credits, late fees, and Stripe's fees are each written as balanced debits and credits. Entries are never edited or deleted, so the next treasurer inherits a history they can check."
        points={["Debits always equal credits", "Platform and processing fees posted with each online payment", "Payments flagged when they don't match Stripe", "CSV export for your accountant"]}
      >
        <LedgerDemo rule={rule} />
      </Feature>

      <PricingEstimate>
        <section id="calculator" className="scroll-mt-12 border-b border-line">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
              <div>
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
                  <Calculator className="size-4 text-accent" aria-hidden />
                  Dues calculator
                </p>
                <h2 className="mt-3 font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">See what reaches your chapter.</h2>
                <p className="mt-3 text-ink-2">
                  Enter your dues and how many members pay online. The numbers use the same fee rules the ledger above posts. Details are on the <TextLink href="/pricing">pricing page</TextLink>.
                </p>
              </div>
              <DuesExample rule={rule} />
            </div>
            <div className="mt-10">
              <FeeCalculator rule={rule} subscriptionCents={plan.priceCents} />
            </div>
          </div>
        </section>
      </PricingEstimate>

      <Feature
        id="chat"
        icon={MessagesSquare}
        eyebrow="Chapter chat"
        title="The group chat, organized."
        body="Channels for the chapter and the executive board, plus direct and group messages. Channels can fill themselves from membership, officer roles, or alumni status, so access updates when the roster does."
        points={["Threads, mentions, reactions, and pins", "@ a person, a whole role, or everyone", "Attachments, edits, and unread counts", "Reports and moderation for officers"]}
      >
        <ChatDemo />
      </Feature>

      <Feature
        id="events"
        icon={CalendarCheck}
        eyebrow="Events and attendance"
        title="Members scan in at the door."
        body="An officer puts a QR code on screen that changes every 30 seconds. Members scan it with their own phones. Anyone arriving 15 minutes after the start is marked late, and every correction keeps its reason."
        points={["RSVPs with capacity limits", "Rotating QR code for check-in", "Required-attendance tracking", "Corrections logged with a reason"]}
      >
        <CheckInDemo />
      </Feature>

      <Feature
        id="recruitment"
        icon={UserRoundSearch}
        eyebrow="Recruitment"
        title="From the involvement fair to bid day."
        body="Every prospect in one pipeline, with stages you can rename, an assigned recruiter, follow-up dates, and notes. Notes marked restricted are only visible to recruitment leadership."
        points={["Stages with outcomes like Offer, Joined, and Not continuing", "Assigned recruiters and follow-up dates", "Restricted notes for leadership", "Full stage history for every prospect"]}
      >
        <RecruitmentDemo />
      </Feature>

      <Feature
        id="roles"
        icon={ShieldCheck}
        eyebrow="Roles and permissions"
        title="Every officer sees what their role allows."
        body={`Start from the standard offices or build your own role from ${PERMISSIONS.length} permissions. The database enforces them, so a page you can't see is also data you can't read.`}
        points={["Ready-made roles for each office", "Custom roles from individual permissions", "Officers can only grant permissions they hold", "Position history on every profile"]}
      >
        <RolesDemo />
      </Feature>

      <Feature
        id="privacy"
        icon={UsersRound}
        eyebrow="Member directory"
        title="Members decide who sees their details."
        body="Profiles have pronouns, major, hometown, a bio, interests, a phone number, and links. For each one, the member picks chapter members, officers only, or only themselves."
        points={["Visibility set per field", "Search by name, member class, house, and role", "Positions shown on every profile", "Message anyone from their profile"]}
      >
        <PrivacyDemo />
      </Feature>

      <Feature
        id="announcements"
        icon={Megaphone}
        eyebrow="Announcements"
        title="Say it once and see who read it."
        body="Post to the whole chapter or only officers, pin what matters, and ask members to acknowledge. Every member gets a notification when a new announcement is published."
        points={["Whole chapter or officers only", "Pinned posts stay on top", "Acknowledgment counts", "Pictures and comments"]}
      >
        <AnnouncementDemo />
      </Feature>

      <Feature
        id="philanthropy"
        icon={HandHeart}
        eyebrow="Philanthropy"
        title="Service hours that count once they're reviewed."
        body="Members log hours and an officer reviews each submission. Volunteer shifts, fundraising campaigns, and recorded donations live on the same page."
        points={["Hours reviewed before they count", "No one approves their own hours", "Volunteer shift sign-ups", "Campaigns with goals and recorded donations"]}
      >
        <HoursDemo />
      </Feature>

      <Feature
        id="standards"
        icon={ClipboardCheck}
        eyebrow="Standards"
        title="Policies with a record of who read them."
        body="Publish a policy and track acknowledgments. Each revision becomes a new version that everyone acknowledges again. Trainings and incident reports sit alongside it."
        points={["Versioned policies with acknowledgments", "Training completions verified by an officer", "Incident reports with a confidential option", "Reports readable only by standards officers"]}
      >
        <PolicyDemo />
      </Feature>

      <section id="more" className="scroll-mt-12 border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink">Also included</h2>
          <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {MORE.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="size-5 text-accent" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Ready when your chapter is</h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-2">Register, get verified, and invite your members. Questions first? We answer every message.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/signup">Register your chapter</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">Talk to us</ButtonLink>
        </div>
      </section>
    </>
  );
}
