import { redirect } from "next/navigation";

export default async function BillingRedirect({ params }: PageProps<"/c/[slug]/billing">) {
  const { slug } = await params;
  redirect(`/c/${slug}/dues`);
}
