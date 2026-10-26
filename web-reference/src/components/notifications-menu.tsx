"use client";

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, LoaderCircle, Settings } from "lucide-react";
import { cx } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { notificationIcon, safeNotificationLink } from "@/lib/notification-kinds";
import type { NotificationRow } from "@/lib/notifications";
import { createBrowserSupabase } from "@/lib/supabase/client";

const LIMIT = 20;

export function NotificationsMenu({ initialUnread, meId, supabaseUrl, supabaseKey }: { initialUnread: number; meId: string; supabaseUrl: string; supabaseKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState(initialUnread);
  const [unread, setUnread] = useState(initialUnread);
  const [now, setNow] = useState(() => new Date());
  if (source !== initialUnread) {
    setSource(initialUnread);
    setUnread(initialUnread);
  }
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const supabase = createBrowserSupabase(supabaseUrl, supabaseKey);
    const [list, count] = await Promise.all([
      supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at, chapter_id").eq("user_id", meId).order("created_at", { ascending: false }).limit(LIMIT),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", meId).is("read_at", null),
    ]);
    setLoading(false);
    if (list.error) {
      setFailed(true);
      return;
    }
    setItems((list.data ?? []) as NotificationRow[]);
    if (!count.error) setUnread(count.count ?? 0);
  }, [supabaseUrl, supabaseKey, meId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setNow(new Date());
      void load();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const supabase = createBrowserSupabase(supabaseUrl, supabaseKey);
    const channel = supabase
      .channel(`notifications:${meId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` }, (payload) => {
        const row = payload.new as NotificationRow;
        if (row.read_at) return;
        setUnread((n) => n + 1);
        setItems((prev) => (prev ? [row, ...prev.filter((p) => p.id !== row.id)].slice(0, LIMIT) : prev));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseKey, meId]);

  const markRead = async (ids: string[] | null) => {
    const stamp = new Date().toISOString();
    setItems((prev) => prev?.map((n) => (!n.read_at && (ids === null || ids.includes(n.id)) ? { ...n, read_at: stamp } : n)) ?? prev);
    setUnread((n) => (ids === null ? 0 : Math.max(0, n - ids.length)));
    const { error } = await createBrowserSupabase(supabaseUrl, supabaseKey).rpc("mark_notifications_read", { p_ids: ids });
    if (error) void load();
  };

  const openItem = (n: NotificationRow) => {
    if (!n.read_at) void markRead([n.id]);
    const link = safeNotificationLink(n.link);
    setOpen(false);
    if (link) router.push(link);
  };

  const hasUnread = (items ?? []).some((n) => !n.read_at) || unread > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={cx("relative rounded-md p-2 text-ink-2 hover:bg-subtle hover:text-ink", open && "bg-subtle text-ink")}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tnum">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="fade-up absolute right-0 z-40 mt-1 flex max-h-[min(560px,calc(100vh-5rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/60">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">
              Notifications
              {unread > 0 ? <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent tnum">{unread} new</span> : null}
            </p>
            {hasUnread ? (
              <button type="button" onClick={() => void markRead(null)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-ink-2 hover:bg-subtle hover:text-ink">
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items === null && loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-ink-3" role="status">
                <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden />
                Loading
              </div>
            ) : failed && items === null ? (
              <div className="px-4 py-10 text-center text-[13px] text-ink-3">
                Couldn&apos;t load notifications.{" "}
                <button type="button" onClick={() => void load()} className="text-accent hover:underline">
                  Try again
                </button>
              </div>
            ) : (items ?? []).length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-subtle text-ink-3">
                  <Bell className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">You&apos;re all caught up</p>
                <p className="mt-1 text-[13px] text-ink-3">Charges, announcements, mentions, and receipts show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {(items ?? []).map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle", !n.read_at && "bg-accent-soft/30")}>
                      <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", n.read_at ? "bg-subtle text-ink-3" : "bg-accent-soft text-accent")}>
                        {createElement(notificationIcon(n.kind), { className: "size-4", "aria-hidden": true })}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-[13px] leading-5", n.read_at ? "text-ink-2" : "font-medium text-ink")}>{n.title}</span>
                        {n.body ? <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-3">{n.body}</span> : null}
                        <span className="mt-1 block text-[11px] text-ink-3">{formatRelative(n.created_at, now)}</span>
                      </span>
                      {!n.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px]">
            <Link href="/account#notifications" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
              <Settings className="size-3.5" aria-hidden />
              Notification settings
            </Link>
            {(items ?? []).length >= LIMIT ? (
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-accent hover:underline">
                Older notifications
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
