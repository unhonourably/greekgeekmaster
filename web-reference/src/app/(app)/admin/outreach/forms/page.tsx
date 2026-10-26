import Link from "next/link";
import { ClipboardList, Mail, MessageSquare, Phone, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Stat, StatGrid } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, formatRelative, requestTime } from "@/lib/format";
import { FORM_INTEREST_LABEL, FORM_STATUSES, FORM_STATUS_LABEL, FORM_STATUS_TONE, OUTREACH_ZONE, type FormStatus } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

const VIEWS = ["inbox", "unread", ...FORM_STATUSES] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { inbox: "Inbox", unread: "Unread", ...FORM_STATUS_LABEL };

const BASE = "id, created_at, full_name, role, organization, council, member_count, email, phone, prefer_email, prefer_text, prefer_call, interest, help, notes, university_id, university:universities(name, state)";

type Row = {
  id: string;
  created_at: string;
  full_name: string;
  role: string;
  organization: string;
  council: string | null;
  member_count: number | null;
  email: string;
  phone: string | null;
  prefer_email: boolean;
  prefer_text: boolean;
  prefer_call: boolean;
  interest: string;
  help: string[];
  notes: string | null;
  university_id: string;
  university: { name: string; state: string | null } | null;
  status: FormStatus;
  read_at: string | null;
  contact_id: string | null;
};

function hrefFor(view: View, q: string): string {
  const params = new URLSearchParams();
  if (view !== "inbox") params.set("view", view);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/admin/outreach/forms?${query}` : "/admin/outreach/forms";
}

function inView(row: Row, view: View): boolean {
  if (view === "inbox") return row.status !== "archived";
  if (view === "unread") return !row.read_at;
  return row.status === view;
}

export default async function FormsInboxPage({ searchParams }: PageProps<"/admin/outreach/forms">) {
  await requireStaff([]);
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "inbox";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  const full = await supabase.from("intro_responses").select(`${BASE}, status, read_at, contact_id`).order("created_at", { ascending: false }).limit(2000);
  const migrationMissing = Boolean(full.error);
  const fallback = migrationMissing ? await supabase.from("intro_responses").select(BASE).order("created_at", { ascending: false }).limit(2000) : null;
  const all = (((fallback ?? full).data ?? []) as unknown as Row[]).map((row) => ({ ...row, status: row.status ?? "new", read_at: row.read_at ?? null, contact_id: row.contact_id ?? null }));
  const needle = q.toLowerCase();
  const rows = all
    .filter((row) => inView(row, view))
    .filter((row) => !needle || [row.full_name, row.organization, row.email, row.role, row.university?.name ?? ""].some((value) => value.toLowerCase().includes(needle)));
  const counts = new Map<View, number>(VIEWS.map((item) => [item, all.filter((row) => inView(row, item)).length]));
  const open = all.filter((row) => row.status === "new" || row.status === "contacted" || row.status === "meeting");
  const now = new Date(requestTime());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Outreach</Link>}
        title="Forms"
        description="Chapters that filled out the interest form from your emails. Open one to read it, reply, and track where it stands."
        actions={
          <div className="flex items-center gap-4">
            <Link href="/admin/outreach/stats" className="text-sm text-ink-2 hover:text-ink">Email stats</Link>
            <Link href="/admin/outreach/forms/links" className="text-sm text-ink-2 hover:text-ink">Form links</Link>
          </div>
        }
      />
      {migrationMissing ? <Notice tone="warning" title="Run npx supabase db push">Statuses, read tracking, and notes need the newest migration. Until then every submission shows as new.</Notice> : null}
      {fallback?.error ? <p className="text-sm text-danger">{fallback.error.message}</p> : null}

      <StatGrid>
        <Stat label="Unread" value={counts.get("unread") ?? 0} tone={(counts.get("unread") ?? 0) > 0 ? "warning" : undefined} />
        <Stat label="Waiting on you" value={counts.get("new") ?? 0} hint="Status is still new" />
        <Stat label="Want a demo" value={open.filter((row) => row.interest === "demo").length} hint="Not yet closed out" />
        <Stat label="Signed up" value={counts.get("signed_up") ?? 0} hint={`${all.length} submission${all.length === 1 ? "" : "s"} total`} tone={(counts.get("signed_up") ?? 0) > 0 ? "positive" : undefined} />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filter forms">
          {VIEWS.map((item) => (
            <Link
              key={item}
              href={hrefFor(item, q)}
              aria-current={item === view ? "page" : undefined}
              className={item === view ? "rounded-md border border-accent px-3 py-1.5 text-sm text-ink" : "rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"}
            >
              {VIEW_LABEL[item]}
              <span className="ml-1.5 text-ink-3 tnum">{counts.get(item) ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" role="search">
          {view !== "inbox" ? <input type="hidden" name="view" value={view} /> : null}
          <Input name="q" defaultValue={q} placeholder="Name, chapter, school, email" aria-label="Search forms" className="w-64" />
          <Button type="submit" variant="secondary"><Search className="size-4" aria-hidden />Search</Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={all.length === 0 ? "No forms yet" : "Nothing here"}>
          {all.length === 0 ? "When a chapter fills out the form linked in your emails, it shows up here." : q ? "No submissions match that search." : "No submissions in this view."}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/outreach/forms/${row.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 hover:bg-canvas/50">
                  <span className={row.read_at ? "mt-2 size-2 shrink-0 rounded-full bg-transparent" : "mt-2 size-2 shrink-0 rounded-full bg-accent"} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={row.read_at ? "text-ink" : "font-semibold text-ink"}>{row.organization}</span>
                      <span className="text-[13px] text-ink-3">at {row.university?.name ?? "Unknown school"}</span>
                      {!row.read_at ? <span className="sr-only">Unread</span> : null}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{row.full_name}, {row.role} · {row.email}</p>
                    {row.notes ? <p className="mt-1 line-clamp-1 text-[13px] text-ink-3">{row.notes}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={row.interest === "demo" ? "positive" : row.interest === "later" ? "neutral" : "info"}>{FORM_INTEREST_LABEL[row.interest] ?? row.interest}</Badge>
                      {row.council ? <Badge>{row.council}</Badge> : null}
                      {row.member_count != null ? <Badge>{row.member_count} members</Badge> : null}
                      <span className="ml-1 inline-flex items-center gap-1.5 text-ink-3" aria-label="Preferred contact">
                        {row.prefer_email ? <Mail className="size-3.5" aria-label="Email" /> : null}
                        {row.prefer_text ? <MessageSquare className="size-3.5" aria-label="Text" /> : null}
                        {row.prefer_call ? <Phone className="size-3.5" aria-label="Call" /> : null}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={FORM_STATUS_TONE[row.status]}>{FORM_STATUS_LABEL[row.status]}</Badge>
                    <time dateTime={row.created_at} title={formatDateTime(row.created_at, OUTREACH_ZONE)} className="text-[12px] text-ink-3">{formatRelative(row.created_at, now)}</time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
