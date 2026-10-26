import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, DefinitionList, Money, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { paymentMethodLabel } from "@/lib/payment-state";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: PageProps<"/c/[slug]/dues/receipts/[paymentId]">) {
  const { slug, paymentId } = await params;
  const { chapter, can } = await requireChapter(slug);
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("receipts")
    .select("receipt_number, amount_cents, issued_at, membership_id, payment:payments(id, kind, method, status, refunded_cents, succeeded_at, offline_reference, stripe_payment_intent_id, assessment:member_assessments(dues:dues_assessments(title))), membership:memberships(user:profiles!memberships_user_id_fkey(full_name, display_name))")
    .eq("payment_id", paymentId)
    .eq("chapter_id", chapter.id)
    .maybeSingle();
  if (!r) notFound();
  const p = r.payment as unknown as { id: string; kind: string; method: string; status: string; refunded_cents: number; succeeded_at: string | null; offline_reference: string | null; stripe_payment_intent_id: string | null; assessment: { dues: { title: string } | null } | null };
  const member = r.membership as unknown as { user: { full_name: string; display_name: string } | null } | null;
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: chapter.timezone });
  const back = can("finance.view") ? `/c/${chapter.slug}/finances/payments/${p.id}` : `/c/${chapter.slug}/dues`;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow={<Link href={back} className="hover:text-ink print:hidden">Back</Link>}
        title={`Receipt ${r.receipt_number}`}
        actions={<PrintButton />}
      />
      <Card>
        <CardBody className="space-y-6 py-6">
          <div>
            <p className="text-sm font-semibold text-ink">{[chapter.organization_name, chapter.designation].filter(Boolean).join(", ")}</p>
            <p className="text-[13px] text-ink-3">{chapter.university?.name}</p>
          </div>
          <div className="rounded-md bg-canvas px-4 py-4 text-center">
            <p className="text-[13px] text-ink-3">Amount paid</p>
            <Money cents={Number(r.amount_cents)} className="text-3xl font-semibold text-ink" />
            {Number(p.refunded_cents) > 0 ? (
              <p className="mt-1 text-[13px] text-warning">
                <Money cents={Number(p.refunded_cents)} /> refunded
              </p>
            ) : null}
          </div>
          <DefinitionList
            items={[
              { label: "Paid by", value: member?.user?.full_name || member?.user?.display_name || "Member" },
              { label: "For", value: p.assessment?.dues?.title ?? "Chapter dues" },
              { label: "Date", value: fmt.format(new Date(p.succeeded_at ?? r.issued_at)) },
              { label: "Method", value: paymentMethodLabel(p.kind, p.method) },
              { label: "Reference", value: <span className="font-mono text-[12px]">{p.offline_reference ?? p.stripe_payment_intent_id ?? p.id}</span> },
            ]}
          />
          <p className="text-[12px] text-ink-3">
            Dues are paid to the chapter. {p.kind === "stripe" ? "Processed by Stripe on the chapter's behalf. " : ""}Issued by {brand.name}. This receipt does not indicate tax deductibility.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
