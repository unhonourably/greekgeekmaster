import { BugReport } from "@/components/bug-report";
import { ChapterNav, type NavGroup } from "@/components/chapter-nav";
import { requireStaff, type StaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABEL: Record<StaffRole, string> = { admin: "Administrator", reviewer: "Reviewer", support: "Support", finance: "Finance" };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { role } = await requireStaff(["reviewer", "support", "finance"]);
  const has = (r: StaffRole) => role === "admin" || role === r;
  const groups: NavGroup[] = [];
  if (has("reviewer")) groups.push({ label: "Trust", items: [{ key: "verification", label: "Verification queue", href: "/admin/verification" }] });
  if (has("support") || has("reviewer")) groups.push({ items: [{ key: "chapters", label: "Chapters", href: "/admin/chapters" }] });
  if (has("finance")) {
    groups.push({
      label: "Finance",
      items: [
        { key: "revenue", label: "Revenue", href: "/admin/revenue" },
        { key: "reconciliation", label: "Reconciliation", href: "/admin/reconciliation" },
      ],
    });
  }
  const supabase = await createClient();
  const bugs = has("support") ? await supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "new") : null;
  const bugItem = { key: "bugs" as const, label: "Bug reports", href: "/admin/bugs", badge: bugs && !bugs.error ? bugs.count ?? 0 : 0 };
  if (role === "support") groups.push({ label: "Support", items: [bugItem] });
  if (role === "admin") {
    const [{ count }, forms] = await Promise.all([
      supabase.from("outreach_emails").select("id", { count: "exact", head: true }).eq("direction", "reply").is("read_at", null),
      supabase.from("intro_responses").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    groups.push({
      label: "Growth",
      items: [
        { key: "outreach", label: "Outreach", href: "/admin/outreach", badge: count ?? 0 },
        { key: "outreachStats", label: "Email stats", href: "/admin/outreach/stats" },
        { key: "outreachForms", label: "Forms", href: "/admin/outreach/forms", badge: forms.error ? 0 : forms.count ?? 0 },
      ],
    });
    groups.push({
      label: "Platform",
      items: [
        bugItem,
        { key: "closures", label: "Closures", href: "/admin/closures" },
        { key: "pricing", label: "Pricing", href: "/admin/pricing" },
        { key: "audit", label: "Audit log", href: "/admin/audit" },
      ],
    });
  }
  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
            <div className="mb-5 px-3">
              <p className="text-sm font-semibold text-ink">Platform admin</p>
              <p className="text-[12px] text-ink-3">Signed in as {ROLE_LABEL[role].toLowerCase()}</p>
            </div>
            <ChapterNav groups={groups} />
          </div>
          <div className="shrink-0 border-t border-line px-3 py-3">
            <BugReport />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <details className="border-b border-line bg-surface lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            Platform admin <span className="text-ink-3">· Menu</span>
          </summary>
          <div className="px-2 pb-4">
            <ChapterNav groups={groups} />
            <div className="mt-4 border-t border-line px-1 pt-3">
              <BugReport />
            </div>
          </div>
        </details>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
