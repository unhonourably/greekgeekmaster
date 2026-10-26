import { redirect } from "next/navigation";

export default async function PaymentRedirect({ params }: PageProps<"/c/[slug]/billing/payments/[paymentId]">) {
  const { slug, paymentId } = await params;
  redirect(`/c/${slug}/dues/receipts/${encodeURIComponent(paymentId)}`);
}
