import Link from "next/link";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, Tr, cx } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRelative, requestTime } from "@/lib/format";
import { APPLICATION_KIND_LABEL, APPLICATION_STATUS, VERIFICATION_METHOD_LABEL, type ApplicationKind, type ApplicationStatus, type VerificationMethod } from "@/lib/applications";

const VIEWS = {
  open: { label: "Needs review", statuses: ["pending_verification"] },
  waiting: { label: "Waiting on applicant", statuses: ["info_requested"] },
  decided: { label: "Decided", statuses: ["verified", "rejected", "suspended", "withdrawn"] },
} as const;
type View = keyof typeof VIEWS;

type Row = {
  id: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  organization_name: string | null;
  designation: string | null;
  proposed_university_name: string | null;
  verification_method: VerificationMethod | null;
  institutional_email_verified_at: string | null;
  duplicate_candidates: unknown[];
  appeal_count: number;
  submitted_at: string | null;
  decided_at: string | null;
  university: { name: string } | null;
};

export default async function VerificationQueue({ searchParams }: PageProps<"/admin/verification">) {
  await requireStaff(["reviewer"]);
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "open";
  const supabase = await createClient();
  const { data } = await supabase
    .from("chapter_applications")
    .select("id, kind, status, organization_name, designation, proposed_university_name, verification_method, institutional_email_verified_at, duplicate_candidates, appeal_count, submitted_at, decided_at, university:universities(name)")
    .in("status", [...VIEWS[view].statuses])
    .order(view === "decided" ? "decided_at" : "submitted_at", { ascending: view !== "decided", nullsFirst: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const { count: openCount } = await supabase.from("chapter_applications").select("id", { count: "exact", head: true }).eq("status", "pending_verification");
  const now = new Date(requestTime());

  return (
    <>
      <PageHeader title="Verification queue" description="Oldest first. A chapter gets payments, invitations, and officer tools only after a reviewer verifies it." />
      <nav className="mb-6 flex gap-1 border-b border-line text-sm" aria-label="Queue views">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={v === "open" ? "/admin/verification" : `/admin/verification?view=${v}`} aria-current={v === view ? "page" : undefined} className={cx("-mb-px border-b-2 px-3 py-2", v === view ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {VIEWS[v].label}
            {v === "open" && openCount ? <span className="ml-1.5 text-ink-3 tnum">{openCount}</span> : null}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title={view === "open" ? "Nothing to review" : "No applications"} />
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Chapter</Th>
                <Th>Type</Th>
                <Th>Method</Th>
                <Th>Signals</Th>
                <Th>{view === "decided" ? "Decided" : "Waiting"}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`/admin/verification/${a.id}`} className="font-medium text-ink hover:underline">
                      {[a.organization_name, a.designation].filter(Boolean).join(", ") || "Untitled application"}
                    </Link>
                    <span className="block text-[12px] text-ink-3">{a.university?.name ?? (a.proposed_university_name ? `${a.proposed_university_name} (new school)` : "No school")}</span>
                  </Td>
                  <Td className="text-[13px]">{APPLICATION_KIND_LABEL[a.kind]}</Td>
                  <Td className="text-[13px]">{a.verification_method ? VERIFICATION_METHOD_LABEL[a.verification_method] : "Not chosen"}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {a.institutional_email_verified_at ? <Badge tone="positive">Email confirmed</Badge> : null}
                      {a.duplicate_candidates?.length ? (
                        <Badge tone="warning">
                          <TriangleAlert className="size-3" aria-hidden />
                          Possible duplicate
                        </Badge>
                      ) : null}
                      {a.appeal_count ? <Badge tone="info">Appeal</Badge> : null}
                      {view === "decided" ? <Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge> : null}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-ink-3">
                    {view === "decided" ? (a.decided_at ? formatDateTime(a.decided_at) : "") : a.submitted_at ? formatRelative(a.submitted_at, now) : "Not submitted"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
