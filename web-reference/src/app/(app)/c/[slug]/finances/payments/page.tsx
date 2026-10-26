import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge, Card, CardHeader, Money, Table, Td, Th, Tr, buttonClass, cx } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_STATUS_LABEL, paymentMethodLabel, paymentTone, type PaymentStatus } from "@/lib/payment-state";

export const metadata: Metadata = { title: "Payments" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "succeeded", label: "Succeeded" },
  { key: "processing", label: "Clearing" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
  { key: "disputed", label: "Disputed" },
] as const;

export default async function PaymentsPage({ params, searchParams }: PageProps<"/c/[slug]/finances/payments">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter } = await requireChapter(slug, "finance.view");
  const filter = FILTERS.find((f) => f.key === sp.status)?.key ?? "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 50;
  const supabase = await createClient();
  let query = supabase
    .from("payments")
    .select("id, kind, method, status, amount_cents, platform_fee_cents, processing_fee_cents, refunded_cents, reconciliation_status, created_at, succeeded_at, membership:memberships(user:profiles!memberships_user_id_fkey(full_name, display_name)), assessment:member_assessments(dues:dues_assessments(title))", { count: "exact" })
    .eq("chapter_id", chapter.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (filter === "refunded") query = query.in("status", ["refunded", "partially_refunded"]);
  else if (filter === "disputed") query = query.in("status", ["disputed", "dispute_lost"]);
  else if (filter === "failed") query = query.in("status", ["failed", "canceled"]);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data, count } = await query;
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: chapter.timezone });
  const base = `/c/${chapter.slug}/finances/payments`;
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));

  return (
    <Card>
      <CardHeader
        title="Payments"
        description={`${count ?? 0} payments`}
        actions={
          <a href={`/c/${chapter.slug}/finances/export?type=payments`} className={buttonClass("secondary", "sm")}>
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </a>
        }
      />
      <div className="flex flex-wrap gap-1 border-b border-line px-5 py-3 text-[13px]">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`${base}?status=${f.key}`} className={cx("rounded px-2 py-1", f.key === filter ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:text-ink")}>
            {f.label}
          </Link>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Member</Th>
            <Th>For</Th>
            <Th>Method</Th>
            <Th>Status</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Platform fee</Th>
            <Th align="right">Stripe fee</Th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => {
            const m = p.membership as unknown as { user: { full_name: string; display_name: string } | null } | null;
            const a = p.assessment as unknown as { dues: { title: string } | null } | null;
            return (
              <Tr key={p.id}>
                <Td className="whitespace-nowrap text-ink-2">{fmt.format(new Date(p.succeeded_at ?? p.created_at))}</Td>
                <Td><Link href={`${base}/${p.id}`} className="font-medium hover:underline">{m?.user?.full_name || m?.user?.display_name || "Member"}</Link></Td>
                <Td className="text-ink-2">{a?.dues?.title}</Td>
                <Td className="text-ink-2">{paymentMethodLabel(p.kind, p.method)}</Td>
                <Td>
                  <Badge tone={paymentTone(p.status)}>{PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status}</Badge>
                  {p.reconciliation_status === "mismatch" ? <Badge tone="danger" className="ml-1">Mismatch</Badge> : null}
                </Td>
                <Td align="right"><Money cents={Number(p.amount_cents)} /></Td>
                <Td align="right" className="text-ink-2">{p.kind === "stripe" ? <Money cents={Number(p.platform_fee_cents)} /> : "—"}</Td>
                <Td align="right" className="text-ink-2">{p.processing_fee_cents !== null ? <Money cents={Number(p.processing_fee_cents)} /> : p.kind === "stripe" ? "Pending" : "—"}</Td>
              </Tr>
            );
          })}
          {(data ?? []).length === 0 ? <tr><Td colSpan={8} className="py-8 text-center text-ink-3">No payments.</Td></tr> : null}
        </tbody>
      </Table>
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-2">
          <span>Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 ? <Link href={`${base}?status=${filter}&page=${page - 1}`} className={buttonClass("secondary", "sm")}>Previous</Link> : null}
            {page < pages ? <Link href={`${base}?status=${filter}&page=${page + 1}`} className={buttonClass("secondary", "sm")}>Next</Link> : null}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
