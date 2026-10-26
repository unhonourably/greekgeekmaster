import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { OUTREACH_ZONE, STATUS_LABEL, STATUS_TONE, contactStatus } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  university: string;
  organization: string;
  role: string;
  full_name: string | null;
  email: string;
  do_not_contact: boolean;
  emails_sent: number;
  last_sent_at: string | null;
  last_status: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  bounced_at: string | null;
  replied_at: string | null;
  replies: number;
  unread_replies: number;
};

export default async function EmailsPage() {
  await requireStaff([]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_contacts")
    .select("id, university, organization, role, full_name, email, do_not_contact, emails_sent, last_sent_at, last_status, delivered_at, opened_at, bounced_at, replied_at, replies, unread_replies")
    .order("created_at", { ascending: false })
    .limit(400);
  const rows = (data ?? []) as Row[];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Universities</Link>} title="Saved emails" description="Every address gathered from a school, and every email sent to it." actions={<Link href="/admin/outreach/sent" className="text-sm text-ink-2 hover:text-ink">Sent</Link>} />
      {error ? <p className="text-sm text-danger">{error.message}</p> : null}
      {rows.length === 0 ? (
        <EmptyState icon={Mail} title="No emails yet">Gather info on a university to collect Greek life addresses.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((row) => {
            const status = contactStatus(row);
            return (
              <li key={row.id}>
                <Link href={`/admin/outreach/contacts/${row.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/40">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{row.full_name ?? row.email}{row.unread_replies > 0 ? <Badge tone="gold" className="ml-2">{row.unread_replies} new</Badge> : null}</p>
                    <p className="text-[13px] text-ink-2">{row.role}, {row.organization} · {row.university}</p>
                    <p className="truncate font-mono text-[12px] text-ink-3">{row.email}</p>
                  </div>
                  <div className="text-right text-[12px] text-ink-3">
                    <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                    {row.last_sent_at ? <p className="mt-1">Sent {formatDateTime(row.last_sent_at, OUTREACH_ZONE)}</p> : null}
                    {row.replied_at ? <p className="text-positive">Replied {formatDateTime(row.replied_at, OUTREACH_ZONE)}</p> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
