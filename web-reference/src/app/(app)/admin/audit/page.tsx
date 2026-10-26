import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Card, EmptyState, PageHeader, Select, Table, Td, Th, Tr, buttonClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { ACTOR_KIND_LABEL, auditLabel } from "@/lib/audit";
import { personName } from "@/components/people";

const PAGE = 50;

type Row = { id: number; chapter_id: string | null; actor_id: string | null; actor_kind: string; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; created_at: string };

export default async function PlatformAudit({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff([]);
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "platform";
  const before = typeof sp.before === "string" && /^\d+$/.test(sp.before) ? Number(sp.before) : null;
  const supabase = await createClient();
  let query = supabase.from("audit_logs").select("id, chapter_id, actor_id, actor_kind, action, target_type, target_id, metadata, created_at").order("id", { ascending: false }).limit(PAGE + 1);
  if (scope === "platform") query = query.or("chapter_id.is.null,action.like.verification.%,action.like.chapter.status%,action.like.pricing.%");
  if (before) query = query.lt("id", before);
  const { data } = await query;
  const rows = ((data ?? []) as Row[]).slice(0, PAGE);
  const more = (data ?? []).length > PAGE;
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))];
  const chapterIds = [...new Set(rows.map((r) => r.chapter_id).filter((v): v is string => Boolean(v)))];
  const [{ data: actors }, { data: chapters }] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id, display_name, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
    chapterIds.length ? supabase.from("chapters").select("id, organization_name, designation").in("id", chapterIds) : Promise.resolve({ data: [] }),
  ]);
  const actorName = new Map(((actors ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null }>).map((a) => [a.id, personName(a)]));
  const chapterName = new Map(((chapters ?? []) as Array<{ id: string; organization_name: string; designation: string | null }>).map((c) => [c.id, [c.organization_name, c.designation].filter(Boolean).join(", ")]));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only. Platform view shows verification, chapter status, and pricing decisions. All events includes chapter activity metadata but never message or note contents."
        actions={
          <form action="/admin/audit" className="flex gap-2">
            <Select name="scope" defaultValue={scope} aria-label="Scope" className="w-40">
              <option value="platform">Platform actions</option>
              <option value="all">All events</option>
            </Select>
            <button type="submit" className={buttonClass("secondary")}>Show</button>
          </form>
        }
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={ScrollText} title="No audit events" />
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Actor</Th>
                <Th>Chapter</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-[13px] text-ink-3">{formatDateTime(r.created_at)}</Td>
                  <Td className="text-[13px]">{auditLabel(r.action)}</Td>
                  <Td className="text-[13px]">{r.actor_id ? actorName.get(r.actor_id) ?? "Unknown user" : ACTOR_KIND_LABEL[r.actor_kind] ?? r.actor_kind}</Td>
                  <Td className="text-[13px]">{r.chapter_id ? <Link href={`/admin/chapters/${r.chapter_id}`} className="hover:underline">{chapterName.get(r.chapter_id) ?? "Chapter"}</Link> : <span className="text-ink-3">Platform</span>}</Td>
                  <Td className="max-w-sm truncate font-mono text-[12px] text-ink-3" title={JSON.stringify(r.metadata)}>
                    {Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : ""}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {more ? (
        <div className="mt-6 flex justify-end">
          <Link href={`/admin/audit?scope=${scope}&before=${rows.at(-1)!.id}`} className={buttonClass("secondary", "sm")}>Older</Link>
        </div>
      ) : null}
    </>
  );
}
