"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { CHAT_READ_EVENT } from "@/components/chapter-unread";
import { BellOff, Compass, Flag, Hash, Lock, Megaphone, Search, SquarePen, Users } from "lucide-react";
import { cx } from "@/components/ui";
import { initials } from "@/lib/names";
import { useNow } from "@/lib/clock";

export type SidebarConversation = {
  id: string;
  kind: string;
  title: string;
  visibility: string;
  unread: number;
  muted: boolean;
  lastAt: string | null;
  preview: string | null;
  previewMine: boolean;
};

const CHANNEL_KINDS = new Set(["chapter_main", "announcement", "exec", "channel", "committee", "recruitment", "event", "alumni"]);

function Icon({ c }: { c: SidebarConversation }) {
  if (c.kind === "direct") {
    return <span className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-semibold text-ink-2">{initials(c.title)}</span>;
  }
  if (c.kind === "group") {
    return (
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Users className="size-4" aria-hidden />
      </span>
    );
  }
  const I = c.kind === "announcement" ? Megaphone : c.visibility === "restricted" ? Lock : Hash;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-ink-3">
      <I className="size-4" aria-hidden />
    </span>
  );
}

function stamp(iso: string | null, now: number): string {
  if (!iso || !now) return "";
  const t = new Date(iso);
  const diff = now - t.getTime();
  if (diff < 60_000) return "now";
  if (new Date(now).toDateString() === t.toDateString()) return t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff < 6 * 86_400_000) return t.toLocaleDateString("en-US", { weekday: "short" });
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChatSidebar({
  slug,
  conversations: initial,
  canModerate,
  canCreateChannel,
  openReports,
  realtime,
}: {
  slug: string;
  conversations: SidebarConversation[];
  canModerate: boolean;
  canCreateChannel: boolean;
  openReports: number;
  realtime: { url: string; key: string; chapterId: string; meId: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const now = useNow();
  const base = `/c/${slug}/chat`;
  const [source, setSource] = useState(initial);
  const [live, setLive] = useState<Record<string, { bump: number; preview: string; at: string; mine: boolean }>>({});
  const [q, setQ] = useState("");
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set());
  if (source !== initial) {
    setSource(initial);
    setLive({});
    setRead(new Set());
  }
  useEffect(() => {
    const onRead = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      setRead((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      setLive((prev) => (prev[id]?.bump ? { ...prev, [id]: { ...prev[id], bump: 0 } } : prev));
    };
    window.addEventListener(CHAT_READ_EVENT, onRead);
    return () => window.removeEventListener(CHAT_READ_EVENT, onRead);
  }, []);
  const conversations = useMemo(
    () =>
      initial
        .map((c) => {
          const l = live[c.id];
          const baseUnread = read.has(c.id) ? 0 : c.unread;
          return l ? { ...c, unread: baseUnread + l.bump, preview: l.preview, lastAt: l.at, previewMine: l.mine } : { ...c, unread: baseUnread };
        })
        .filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase())),
    [initial, live, read, q],
  );
  const pathRef = useRef(pathname);
  const known = useRef(new Set(initial.map((c) => c.id)));
  useEffect(() => {
    known.current = new Set(initial.map((c) => c.id));
  }, [initial]);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    const supabase = createBrowserSupabase(realtime.url, realtime.key);
    const channel = supabase
      .channel(`chapter-messages:${realtime.chapterId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chapter_id=eq.${realtime.chapterId}` }, (payload) => {
        const row = payload.new as { conversation_id: string; sender_id: string; parent_id: string | null; body: string; created_at: string };
        if (row.parent_id) return;
        if (!known.current.has(row.conversation_id)) {
          router.refresh();
          return;
        }
        const mine = row.sender_id === realtime.meId;
        const viewing = pathRef.current.startsWith(`${base}/${row.conversation_id}`);
        setLive((prev) => {
          const cur = prev[row.conversation_id];
          return {
            ...prev,
            [row.conversation_id]: { bump: (cur?.bump ?? 0) + (mine || viewing ? 0 : 1), preview: row.body?.trim() || "Sent an attachment", at: row.created_at, mine },
          };
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtime.url, realtime.key, realtime.chapterId, realtime.meId, base, router]);

  const channels = conversations.filter((c) => CHANNEL_KINDS.has(c.kind));
  const direct = conversations
    .filter((c) => !CHANNEL_KINDS.has(c.kind))
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  const row = (c: SidebarConversation) => {
    const href = `${base}/${c.id}`;
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const unread = active ? 0 : c.unread;
    const strong = unread > 0 && !c.muted;
    return (
      <li key={c.id}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={cx("flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors", active ? "bg-subtle" : "hover:bg-subtle/60")}
        >
          <Icon c={c} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className={cx("min-w-0 flex-1 truncate text-sm", strong || active ? "font-semibold text-ink" : "font-medium text-ink-2")}>{c.title}</span>
              <span className={cx("shrink-0 text-[11px] tnum", strong ? "text-accent" : "text-ink-3")}>{stamp(c.lastAt, now)}</span>
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className={cx("min-w-0 flex-1 truncate text-[13px]", strong ? "text-ink-2" : "text-ink-3")}>
                {c.preview ? `${c.previewMine ? "You: " : ""}${c.preview}` : c.kind === "direct" || c.kind === "group" ? "No messages yet" : "Channel"}
              </span>
              {c.muted ? <BellOff className="size-3.5 shrink-0 text-ink-3" aria-label="Muted" /> : null}
              {strong ? <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-on-accent tnum">{unread > 99 ? "99+" : unread}</span> : null}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <nav className="flex h-full flex-col" aria-label="Conversations">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-base font-semibold text-ink">Messages</h2>
        <Link href={`${base}/new`} className="grid size-8 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink" aria-label="New message" title="New message">
          <SquarePen className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            suppressHydrationWarning
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="h-8 w-full rounded-lg border border-line bg-canvas pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/50"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        <section>
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Direct and group</p>
          </div>
          {direct.length === 0 ? (
            <Link href={`${base}/new`} className="mx-2.5 flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-[13px] text-ink-3 hover:border-line-strong hover:text-ink-2">
              <SquarePen className="size-3.5" aria-hidden />
              {q ? "No matches" : "Start a conversation"}
            </Link>
          ) : (
            <ul className="space-y-0.5">{direct.map(row)}</ul>
          )}
        </section>
        <section>
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Channels</p>
            {canCreateChannel ? (
              <Link href={`${base}/new?kind=channel`} className="text-[11px] font-medium text-ink-3 hover:text-ink">New channel</Link>
            ) : null}
          </div>
          {channels.length === 0 ? <p className="px-2.5 py-1 text-[13px] text-ink-3">{q ? "No matches" : "None yet"}</p> : <ul className="space-y-0.5">{channels.map(row)}</ul>}
        </section>
      </div>
      <div className="flex gap-1 border-t border-line p-2">
        <Link href={`${base}/browse`} className={cx("flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle", pathname === `${base}/browse` ? "bg-subtle text-ink" : "text-ink-2")}>
          <Compass className="size-4 text-ink-3" aria-hidden />
          Browse channels
        </Link>
        {canModerate ? (
          <Link href={`${base}/reports`} className={cx("flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle", pathname === `${base}/reports` ? "bg-subtle text-ink" : "text-ink-2")}>
            <Flag className="size-4 text-ink-3" aria-hidden />
            Reports
            {openReports > 0 ? <span className="rounded-full bg-danger px-1.5 text-[11px] font-medium leading-5 text-on-accent tnum">{openReports}</span> : null}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
