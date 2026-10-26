import { Building2 } from "lucide-react";
import { personName } from "@/components/people";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { reviewClosure } from "../actions";
import { ClosureDecision } from "./decision";

type Row = {
  id: string;
  reason: string;
  created_at: string;
  requester: { display_name: string | null; full_name: string | null } | null;
  chapter: { organization_name: string; designation: string | null; slug: string; university: { name: string } | null } | null;
};

export default async function ClosuresPage() {
  await requireStaff([]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("chapter_closure_requests")
    .select("id, reason, created_at, requester:profiles!chapter_closure_requests_requested_by_fkey(display_name, full_name), chapter:chapters(organization_name, designation, slug, university:universities(name))")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Closure requests" description="A chapter stays open until an administrator accepts the request. Accepting closes it and removes member access." />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No closure requests">Presidents and chapter administrators send these from chapter settings.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const label = [row.chapter?.organization_name, row.chapter?.designation].filter(Boolean).join(", ") || "Chapter";
            return (
              <Card key={row.id}>
                <CardHeader title={label} description={[row.chapter?.university?.name, personName(row.requester ?? {}), formatDateTime(row.created_at)].filter(Boolean).join(" · ")} />
                <CardBody className="space-y-4">
                  <p className="whitespace-pre-wrap text-sm text-ink-2">{row.reason}</p>
                  <ClosureDecision action={reviewClosure.bind(null, row.id)} id={row.id} />
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
