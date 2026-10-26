import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th, Tr, buttonClass } from "@/components/ui";
import { personName } from "@/components/people";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTOR_KIND_LABEL, auditLabel } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";

const PAGE = 50;

function summarize(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["role", "name", "title", "reason", "to_status", "to_class", "method", "amount_cents"]) {
    const v = metadata[key];
    if (v === null || v === undefined || v === "") continue;
    if (key === "amount_cents" && typeof v === "number") parts.push(`$${(v / 100).toFixed(2)}`);
    else parts.push(String(v).replace(/_/g, " "));
  }
  return parts.join(" · ").slice(0, 160);
}

export default async function AuditPage({ params, searchParams }: PageProps<"/c/[slug]/settings/audit">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter } = await requireChapter(slug, "audit.view");
  const before = typeof sp.before === "string" && /^\d+$/.test(sp.before) ? Number(sp.before) : null;
  const supabase = await createClient();
  let query = supabase.from("audit_logs").select("id, actor_id, actor_kind, action, target_type, metadata, created_at").eq("chapter_id", chapter.id).order("id", { ascending: false }).limit(PAGE + 1);
  if (before) query = query.lt("id", before);
  const { data } = await query;
  const rows = (data ?? []).slice(0, PAGE);
  const more = (data ?? []).length > PAGE;
  const actorIds = [...new Set(rows.map((r) => r.actor_id as string | null).filter((v): v is string => Boolean(v)))];
  const { data: profiles } = actorIds.length ? await supabase.from("profiles").select("id, display_name, full_name").in("id", actorIds) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, personName(p)]));

  return (
    <Card>
      <CardHeader title="Audit log" description="Every sensitive change in the chapter, newest first. Entries cannot be edited or deleted." />
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={ScrollText} title="Nothing recorded yet" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th className="pl-5">When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th className="pr-5">Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id as number}>
                  <Td className="whitespace-nowrap pl-5 text-ink-2">{formatDateTime(r.created_at as string, chapter.timezone)}</Td>
                  <Td>
                    {r.actor_id && names.get(r.actor_id as string) ? names.get(r.actor_id as string) : <span className="text-ink-3">{ACTOR_KIND_LABEL[r.actor_kind as string] ?? "Unknown"}</span>}
                    {r.actor_kind === "platform_staff" ? <Badge tone="warning" className="ml-1.5">Platform</Badge> : null}
                  </Td>
                  <Td className="text-ink">{auditLabel(r.action as string)}</Td>
                  <Td className="pr-5 text-ink-2">{summarize((r.metadata ?? {}) as Record<string, unknown>)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {more || before ? (
        <div className="flex justify-between border-t border-line px-5 py-3">
          {before ? <Link href={`/c/${slug}/settings/audit`} className={buttonClass("ghost", "sm")}>Newest</Link> : <span />}
          {more ? <Link href={`/c/${slug}/settings/audit?before=${rows[rows.length - 1].id}`} className={buttonClass("secondary", "sm")}>Older</Link> : null}
        </div>
      ) : null}
    </Card>
  );
}
