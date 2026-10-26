import { forbidden } from "next/navigation";
import { SubNav } from "@/components/chapter-nav";
import { PageHeader } from "@/components/ui";
import { requireChapter } from "@/lib/auth";

export default async function SettingsLayout({ children, params }: LayoutProps<"/c/[slug]/settings">) {
  const { slug } = await params;
  const { can, chapter } = await requireChapter(slug);
  const base = `/c/${chapter.slug}/settings`;
  const items: Array<{ label: string; href: string; exact?: boolean }> = [];
  if (can("chapter.manage")) items.push({ label: "General", href: base, exact: true });
  if (can("chapter.manage") || can("payments.configure") || can("finance.view")) items.push({ label: "Stripe and billing", href: `${base}/billing` });
  if (can("members.manage")) items.push({ label: "Members and invitations", href: `${base}/members` });
  if (can("roles.manage")) items.push({ label: "Roles", href: `${base}/roles` });
  if (can("audit.view")) items.push({ label: "Audit log", href: `${base}/audit` });
  if (items.length === 0) forbidden();
  return (
    <>
      <PageHeader title="Settings" />
      <SubNav items={items} />
      {children}
    </>
  );
}
