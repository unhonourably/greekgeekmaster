import { SubNav } from "@/components/chapter-nav";
import { PageHeader } from "@/components/ui";
import { requireChapter } from "@/lib/auth";

export default async function FinancesLayout({ children, params }: LayoutProps<"/c/[slug]/finances">) {
  const { slug } = await params;
  const { chapter } = await requireChapter(slug, "finance.view");
  const base = `/c/${chapter.slug}/finances`;
  return (
    <>
      <PageHeader title="Finances" description="Dues, payments, and the chapter ledger. Every number here comes from the double-entry ledger." />
      <SubNav
        items={[
          { label: "Overview", href: base, exact: true },
          { label: "Assessments", href: `${base}/assessments` },
          { label: "Member balances", href: `${base}/members` },
          { label: "Payments", href: `${base}/payments` },
          { label: "Reimbursements", href: `${base}/reimbursements` },
          { label: "Budget", href: `${base}/budget` },
          { label: "Ledger", href: `${base}/ledger` },
          { label: "Reports", href: `${base}/reports` },
        ]}
      />
      {children}
    </>
  );
}
