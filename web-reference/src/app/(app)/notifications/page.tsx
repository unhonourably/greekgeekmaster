import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Card, EmptyState, PageHeader, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import { formatRelative } from "@/lib/format";
import { notificationIcon } from "@/lib/notification-kinds";
import { markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  await requireUser("/notifications");
  const sp = await searchParams;
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const rows = await listNotifications(51, before);
  const items = rows.slice(0, 50);
  const more = rows.length > 50;
  const unread = items.some((n) => !n.read_at);
  const now = new Date();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Notifications"
        actions={
          <div className="flex gap-2">
            <Link href="/account" className={buttonClass("ghost", "sm")}>Settings</Link>
            {unread ? (
              <form action={markAllRead}>
                <SubmitButton variant="secondary" size="sm">
                  <CheckCheck className="size-4" aria-hidden />
                  Mark all read
                </SubmitButton>
              </form>
            ) : null}
          </div>
        }
      />
      <Card>
        {items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Bell} title="You are all caught up">Charges, announcements, mentions, and receipts will show up here.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const Icon = notificationIcon(n.kind);
              return (
                <li key={n.id}>
                  <form action={openNotification.bind(null, n.id)}>
                    <button type="submit" className={cx("flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-subtle", !n.read_at && "bg-accent-soft/40")}>
                      <span className={cx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", n.read_at ? "bg-subtle text-ink-3" : "bg-accent-soft text-accent")}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-sm", n.read_at ? "text-ink-2" : "font-medium text-ink")}>{n.title}</span>
                        {n.body ? <span className="mt-0.5 block text-sm text-ink-3">{n.body}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">{formatRelative(n.created_at, now)}</span>
                      {!n.read_at ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {more ? (
        <div className="mt-4 flex justify-center">
          <Link href={`/notifications?before=${encodeURIComponent(items[items.length - 1].created_at)}`} className={buttonClass("secondary", "sm")}>Older</Link>
        </div>
      ) : null}
    </main>
  );
}
