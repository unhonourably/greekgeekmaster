import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Badge, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th, Tr, buttonClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

const PAGE = 50;
const STATUS_TONE = { verified: "positive", unclaimed: "neutral", suspended: "danger", closed: "neutral" } as const;
type Status = keyof typeof STATUS_TONE;

type Row = {
  id: string;
  slug: string;
  organization_name: string;
  designation: string | null;
  university: string;
  status: Status;
  verified_at: string | null;
  active_members: number;
  subscription_status: string | null;
  payments_enabled: boolean;
  total_count: number;
};

export default async function AdminChapters({ searchParams }: PageProps<"/admin/chapters">) {
  await requireStaff(["support", "reviewer", "finance"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80).replace(/[%_\\]/g, "") : "";
  const status = typeof sp.status === "string" && sp.status in STATUS_TONE ? (sp.status as Status) : null;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_chapter_overview", { p_search: q || null, p_status: status, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (status) s.set("status", status);
    if (p > 1) s.set("page", String(p));
    return `/admin/chapters${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Chapters" description={`${total} ${total === 1 ? "chapter" : "chapters"}. Staff see chapter status and counts here, not member messages or recruitment records.`} />
      <form action="/admin/chapters" className="mb-6 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search by organization, school, or slug" className="pl-8" aria-label="Search chapters" />
        </div>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-40">
          <option value="">Any status</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
      </form>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No chapters found" />
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Chapter</Th>
                <Th>Status</Th>
                <Th align="right">Members</Th>
                <Th>Subscription</Th>
                <Th>Payments</Th>
                <Th>Verified</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/admin/chapters/${c.id}`} className="font-medium text-ink hover:underline">
                      {[c.organization_name, c.designation].filter(Boolean).join(", ")}
                    </Link>
                    <span className="block text-[12px] text-ink-3">{c.university}</span>
                  </Td>
                  <Td><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></Td>
                  <Td align="right">{c.active_members}</Td>
                  <Td className="text-[13px]">{c.subscription_status ? <Badge tone={c.subscription_status === "active" || c.subscription_status === "trialing" ? "positive" : "warning"}>{c.subscription_status.replace(/_/g, " ")}</Badge> : <span className="text-ink-3">None</span>}</Td>
                  <Td className="text-[13px]">{c.payments_enabled ? "Enabled" : <span className="text-ink-3">Not set up</span>}</Td>
                  <Td className="whitespace-nowrap text-[13px] text-ink-3">{c.verified_at ? formatDate(c.verified_at) : ""}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={qs(page - 1)} className={buttonClass("secondary", "sm")}>Previous</Link> : <span />}
          <span className="text-ink-3">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs(page + 1)} className={buttonClass("secondary", "sm")}>Next</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
