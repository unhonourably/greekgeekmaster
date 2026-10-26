import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardHeader, Money, Table, Td, Th, Tr, buttonClass } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LEDGER_ACCOUNT_LABEL, LEDGER_KIND_LABEL } from "@/lib/ledger";

export const metadata: Metadata = { title: "Ledger" };

export default async function LedgerPage({ params, searchParams }: PageProps<"/c/[slug]/finances/ledger">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter } = await requireChapter(slug, "finance.view");
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 50;
  const supabase = await createClient();
  const [{ data: txns, count }, { data: totals }] = await Promise.all([
    supabase
      .from("ledger_transactions")
      .select("id, kind, description, occurred_at, source, payment_id, membership:memberships(user:profiles!memberships_user_id_fkey(full_name, display_name)), ledger_entries(id, account, amount_cents)", { count: "exact" })
      .eq("chapter_id", chapter.id)
      .order("occurred_at", { ascending: false })
      .range((page - 1) * size, page * size - 1),
    supabase.rpc("chapter_account_balances", { p_chapter: chapter.id }),
  ]);
  const balances = new Map<string, number>();
  for (const e of (totals ?? []) as Array<{ account: string; balance_cents: number }>) balances.set(e.account, Number(e.balance_cents));
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: chapter.timezone });
  const base = `/c/${chapter.slug}/finances/ledger`;
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  const sum = [...balances.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader
          title="Journal"
          description="Append-only. Corrections are new entries, never edits."
          actions={
            <a href={`/c/${chapter.slug}/finances/export?type=ledger`} className={buttonClass("secondary", "sm")}>
              <Download className="size-3.5" aria-hidden />
              Export CSV
            </a>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Transaction</Th>
              <Th>Account</Th>
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
            </tr>
          </thead>
          <tbody>
            {((txns ?? []) as unknown as Array<{ id: string; kind: string; description: string; occurred_at: string; payment_id: string | null; membership: { user: { full_name: string; display_name: string } | null } | null; ledger_entries: Array<{ id: number; account: string; amount_cents: number }> }>).map((t) =>
              t.ledger_entries.map((e, i) => (
                <Tr key={e.id} className={i === 0 ? "[&>td]:border-t [&>td]:border-line-strong/40" : ""}>
                  <Td className="whitespace-nowrap text-ink-2">{i === 0 ? fmt.format(new Date(t.occurred_at)) : ""}</Td>
                  <Td>
                    {i === 0 ? (
                      <>
                        {t.payment_id ? <Link href={`/c/${chapter.slug}/finances/payments/${t.payment_id}`} className="font-medium hover:underline">{LEDGER_KIND_LABEL[t.kind] ?? t.kind}</Link> : <span className="font-medium">{LEDGER_KIND_LABEL[t.kind] ?? t.kind}</span>}
                        <span className="block text-[12px] text-ink-3">{[t.description, t.membership?.user?.full_name || t.membership?.user?.display_name].filter(Boolean).join(" · ")}</span>
                      </>
                    ) : null}
                  </Td>
                  <Td className="text-ink-2">{LEDGER_ACCOUNT_LABEL[e.account] ?? e.account}</Td>
                  <Td align="right">{Number(e.amount_cents) > 0 ? <Money cents={Number(e.amount_cents)} /> : ""}</Td>
                  <Td align="right">{Number(e.amount_cents) < 0 ? <Money cents={-Number(e.amount_cents)} /> : ""}</Td>
                </Tr>
              )),
            )}
            {(txns ?? []).length === 0 ? <tr><Td colSpan={5} className="py-8 text-center text-ink-3">No ledger activity yet.</Td></tr> : null}
          </tbody>
        </Table>
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-2">
            <span>Page {page} of {pages}</span>
            <span className="flex gap-2">
              {page > 1 ? <Link href={`${base}?page=${page - 1}`} className={buttonClass("secondary", "sm")}>Newer</Link> : null}
              {page < pages ? <Link href={`${base}?page=${page + 1}`} className={buttonClass("secondary", "sm")}>Older</Link> : null}
            </span>
          </div>
        ) : null}
      </Card>
      <Card className="self-start">
        <CardHeader title="Account balances" description={sum === 0 ? "Debits equal credits." : "Ledger is out of balance. Contact support."} />
        <ul className="divide-y divide-line text-sm">
          {Object.keys(LEDGER_ACCOUNT_LABEL).map((k) => (
            <li key={k} className="flex justify-between px-5 py-2">
              <span className="text-ink-2">{LEDGER_ACCOUNT_LABEL[k]}</span>
              <Money cents={balances.get(k) ?? 0} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
