import type { Metadata } from "next";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Badge, Card, CardHeader, Input, Money, Table, Td, Th, Tr, buttonClass } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_CLASS_LABEL, MEMBERSHIP_STATUS_LABEL, type MemberClass, type MembershipStatus } from "@/lib/permissions";

export const metadata: Metadata = { title: "Member balances" };

type Row = { membership_id: string; full_name: string; display_name: string; member_class: MemberClass; status: MembershipStatus; balance_cents: number; processing_cents: number; overdue_cents: number };

export default async function MemberBalances({ params, searchParams }: PageProps<"/c/[slug]/finances/members">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter } = await requireChapter(slug, "finance.view");
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const show = sp.show === "all" ? "all" : sp.show === "overdue" ? "overdue" : "owing";
  const supabase = await createClient();
  const { data } = await supabase.rpc("chapter_member_balances", { p_chapter: chapter.id });
  const all = (data ?? []) as Row[];
  const rows = all
    .filter((r) => (show === "all" ? true : show === "overdue" ? Number(r.overdue_cents) > 0 : Number(r.balance_cents) > 0 || Number(r.processing_cents) > 0))
    .filter((r) => !q || `${r.full_name} ${r.display_name}`.toLowerCase().includes(q));
  const total = rows.reduce((s, r) => s + Number(r.balance_cents), 0);
  const base = `/c/${chapter.slug}/finances/members`;

  return (
    <Card>
      <CardHeader
        title="Member balances"
        description={`${rows.length} shown · ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total / 100)} outstanding`}
        actions={
          <a href={`/c/${chapter.slug}/finances/export?type=balances`} className={buttonClass("secondary", "sm")}>
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </a>
        }
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <form method="get" className="relative" role="search">
          <input type="hidden" name="show" value={show} />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search members" className="h-8 w-56 pl-9 text-[13px]" aria-label="Search members" />
        </form>
        <div className="flex gap-1 text-[13px]">
          {(["owing", "overdue", "all"] as const).map((k) => (
            <Link key={k} href={`${base}?show=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={k === show ? "rounded px-2 py-1 font-medium text-ink bg-subtle" : "rounded px-2 py-1 text-ink-2 hover:text-ink"}>
              {k === "owing" ? "Owing" : k === "overdue" ? "Overdue" : "Everyone"}
            </Link>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">{show === "all" ? "No members match." : "Nobody owes anything."}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Class</Th>
              <Th align="right">Clearing</Th>
              <Th align="right">Overdue</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.membership_id}>
                <Td>
                  <Link href={`${base}/${r.membership_id}`} className="font-medium hover:underline">{r.full_name || r.display_name}</Link>
                  {r.status !== "active" ? <Badge className="ml-2">{MEMBERSHIP_STATUS_LABEL[r.status]}</Badge> : null}
                </Td>
                <Td className="text-ink-2">{MEMBER_CLASS_LABEL[r.member_class]}</Td>
                <Td align="right">{Number(r.processing_cents) > 0 ? <Money cents={Number(r.processing_cents)} className="text-info" /> : <span className="text-ink-3">—</span>}</Td>
                <Td align="right">{Number(r.overdue_cents) > 0 ? <Money cents={Number(r.overdue_cents)} className="text-danger" /> : <span className="text-ink-3">—</span>}</Td>
                <Td align="right"><Money cents={Number(r.balance_cents)} className="font-medium" /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
