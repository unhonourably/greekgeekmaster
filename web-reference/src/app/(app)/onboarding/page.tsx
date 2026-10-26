import type { Metadata } from "next";
import Link from "next/link";
import { Building2, KeyRound, ListChecks } from "lucide-react";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS, type ApplicationKind, type ApplicationStatus } from "@/lib/applications";
import { startApplication } from "./actions";

export const metadata: Metadata = { title: "Register a chapter" };

const OPTIONS: Array<{ kind: ApplicationKind; title: string; body: string; icon: typeof Building2 }> = [
  { kind: "new_chapter", title: "Register a new chapter", body: "Your chapter is not on GreekGeek yet. You will become its first administrator.", icon: Building2 },
  { kind: "claim_existing", title: "Claim a listed chapter", body: "Your chapter appears in our directory but nobody manages it yet.", icon: ListChecks },
  { kind: "recovery", title: "Recover administrator access", body: "Your chapter already uses GreekGeek, but every administrator has graduated or left.", icon: KeyRound },
];

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const supabase = await createClient();
  const { data } = await supabase
    .from("chapter_applications")
    .select("id, kind, status, organization_name, designation, updated_at")
    .eq("applicant_id", user.id)
    .in("status", ["draft", "pending_verification", "info_requested"])
    .order("updated_at", { ascending: false });
  const open = (data ?? []) as Array<{ id: string; kind: ApplicationKind; status: ApplicationStatus; organization_name: string | null; designation: string | null }>;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={<Link href="/home" className="hover:text-ink">Home</Link>}
        title="Register a chapter"
        description="Applications take about five minutes. A platform reviewer verifies each chapter, usually within two business days, before it can invite members or collect dues."
      />

      {open.length > 0 ? (
        <Card className="mb-6">
          <CardBody>
            <h2 className="text-sm font-medium text-ink">Continue where you left off</h2>
            <ul className="mt-3 space-y-2">
              {open.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/onboarding/${a.id}`} className="truncate text-accent hover:underline">
                    {[a.organization_name, a.designation].filter(Boolean).join(", ") || APPLICATION_KIND_LABEL[a.kind]}
                  </Link>
                  <Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <ul className="space-y-3">
        {OPTIONS.map((o) => (
          <li key={o.kind}>
            <form action={startApplication} className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface px-5 py-4">
              <input type="hidden" name="kind" value={o.kind} />
              <o.icon className="size-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">{o.title}</h2>
                <p className="text-[13px] text-ink-3">{o.body}</p>
              </div>
              <SubmitButton variant="secondary" size="sm" pendingLabel="Starting">Start</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
