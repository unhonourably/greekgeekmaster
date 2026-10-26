import { NextResponse, type NextRequest } from "next/server";
import { getChapterContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { centsToCsv, toCsv } from "@/lib/csv";
import { LEDGER_ACCOUNT_LABEL, LEDGER_KIND_LABEL } from "@/lib/ledger";

type Person = { user: { full_name: string; display_name: string } | null } | null;

function personName(m: unknown): string {
  const p = m as Person;
  return p?.user?.full_name || p?.user?.display_name || "";
}

export async function GET(request: NextRequest, { params }: RouteContext<"/c/[slug]/finances/export">) {
  const { slug } = await params;
  const ctx = await getChapterContext(slug);
  if (!ctx || !ctx.can("finance.view")) return new NextResponse("Not found", { status: 404 });
  const type = request.nextUrl.searchParams.get("type");
  const supabase = await createClient();
  const stamp = new Date().toISOString().slice(0, 10);
  let csv: string;

  if (type === "balances") {
    const { data, error } = await supabase.rpc("chapter_member_balances", { p_chapter: ctx.chapter.id });
    if (error) return new NextResponse("Export failed", { status: 500 });
    csv = toCsv(
      ["Member", "Class", "Status", "Balance", "Clearing", "Overdue"],
      ((data ?? []) as Array<Record<string, unknown>>).map((r) => [r.full_name || r.display_name, r.member_class, r.status, centsToCsv(Number(r.balance_cents)), centsToCsv(Number(r.processing_cents)), centsToCsv(Number(r.overdue_cents))]),
    );
  } else if (type === "payments") {
    const { data, error } = await supabase
      .from("payments")
      .select("id, created_at, succeeded_at, kind, method, status, amount_cents, platform_fee_cents, processing_fee_cents, refunded_cents, offline_reference, stripe_payment_intent_id, membership:memberships(user:profiles!memberships_user_id_fkey(full_name, display_name)), assessment:member_assessments(dues:dues_assessments(title)), receipt:receipts(receipt_number)")
      .eq("chapter_id", ctx.chapter.id)
      .neq("status", "pending")
      .order("created_at")
      .limit(50000);
    if (error) return new NextResponse("Export failed", { status: 500 });
    csv = toCsv(
      ["Payment ID", "Created", "Paid", "Member", "Charge", "Kind", "Method", "Status", "Amount", "Platform fee", "Stripe fee", "Refunded", "Net", "Receipt", "Reference"],
      (data ?? []).map((p) => {
        const receipt = p.receipt as unknown as { receipt_number: string } | Array<{ receipt_number: string }> | null;
        const fee = Number(p.platform_fee_cents ?? 0);
        const proc = Number(p.processing_fee_cents ?? 0);
        return [
          p.id,
          p.created_at,
          p.succeeded_at,
          personName(p.membership),
          (p.assessment as unknown as { dues: { title: string } | null } | null)?.dues?.title,
          p.kind,
          p.method,
          p.status,
          centsToCsv(Number(p.amount_cents)),
          centsToCsv(fee),
          p.processing_fee_cents === null ? "" : centsToCsv(proc),
          centsToCsv(Number(p.refunded_cents)),
          centsToCsv(Number(p.amount_cents) - fee - proc - Number(p.refunded_cents)),
          Array.isArray(receipt) ? receipt[0]?.receipt_number : receipt?.receipt_number,
          p.offline_reference ?? p.stripe_payment_intent_id,
        ];
      }),
    );
  } else if (type === "ledger") {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("id, account, amount_cents, txn:ledger_transactions(id, kind, description, occurred_at, source, payment_id, membership:memberships(user:profiles!memberships_user_id_fkey(full_name, display_name)))")
      .eq("chapter_id", ctx.chapter.id)
      .order("id")
      .limit(100000);
    if (error) return new NextResponse("Export failed", { status: 500 });
    csv = toCsv(
      ["Entry", "Transaction", "Date", "Kind", "Description", "Member", "Account", "Debit", "Credit", "Source", "Payment ID"],
      ((data ?? []) as unknown as Array<{ id: number; account: string; amount_cents: number; txn: { id: string; kind: string; description: string; occurred_at: string; source: string; payment_id: string | null; membership: unknown } | null }>).map((e) => [
        e.id,
        e.txn?.id,
        e.txn?.occurred_at,
        LEDGER_KIND_LABEL[e.txn?.kind ?? ""] ?? e.txn?.kind,
        e.txn?.description,
        personName(e.txn?.membership),
        LEDGER_ACCOUNT_LABEL[e.account] ?? e.account,
        Number(e.amount_cents) > 0 ? centsToCsv(Number(e.amount_cents)) : "",
        Number(e.amount_cents) < 0 ? centsToCsv(-Number(e.amount_cents)) : "",
        e.txn?.source,
        e.txn?.payment_id,
      ]),
    );
  } else {
    return new NextResponse("Unknown export", { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.chapter.slug}-${type}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
