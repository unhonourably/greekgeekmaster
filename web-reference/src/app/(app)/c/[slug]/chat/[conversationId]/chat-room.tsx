"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  FileText,
  Flag,
  Hash,
  Heart,
  Info,
  Laugh,
  LoaderCircle,
  Lock,
  Megaphone,
  MessagesSquare,
  Paperclip,
  PartyPopper,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SendHorizontal,
  SmilePlus,
  ThumbsUp,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import { Avatar } from "@/components/people";
import { Button, Notice, Select, Textarea, cx } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { CHAT_READ_EVENT } from "@/components/chapter-unread";
import { dbErrorMessage } from "@/lib/errors";
import { useNow } from "@/lib/clock";
import type { ChatMember, ChatMessage } from "@/lib/chat";
import { createAttachmentUpload, fetchMessages, purgeDeletedAttachments, removePendingAttachment } from "../actions";

const REACTIONS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "+1", label: "Agree", icon: ThumbsUp },
  { key: "heart", label: "Love", icon: Heart },
  { key: "check", label: "Done", icon: Check },
  { key: "laugh", label: "Funny", icon: Laugh },
  { key: "eyes", label: "Looking", icon: Eye },
  { key: "party", label: "Celebrate", icon: PartyPopper },
];

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_FILE = 15 * 1024 * 1024;

type Conversation = {
  id: string;
  chapterId: string;
  kind: string;
  title: string;
  topic: string | null;
  visibility: string;
  postingPolicy: string;
  archived: boolean;
};

type Me = { id: string; isModerator: boolean; restricted: boolean; lastReadAt: string | null };
type RoleOption = { id: string; name: string };
type Pending = { path: string; name: string; type: string; size: number };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function typingLabel(people: ChatMember[]): string {
  const first = (m: ChatMember) => m.name.split(" ")[0];
  if (people.length === 1) return `${first(people[0])} is typing`;
  if (people.length === 2) return `${first(people[0])} and ${first(people[1])} are typing`;
  return `${people.length} people are typing`;
}

function ConversationAvatar({ kind, visibility, other, title, large }: { kind: string; visibility: string; other?: ChatMember; title: string; large?: boolean }) {
  if (kind === "direct") return <Avatar name={other?.name ?? title} path={other?.avatar_path} size={large ? "lg" : "md"} />;
  const Icon = kind === "group" ? Users : kind === "announcement" ? Megaphone : visibility === "restricted" ? Lock : Hash;
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center",
        large ? "size-16" : "size-10",
        kind === "group" ? "rounded-full bg-accent-soft text-accent" : cx("border border-line bg-canvas text-ink-3", large ? "rounded-2xl" : "rounded-xl"),
      )}
    >
      <Icon className={large ? "size-7" : "size-5"} aria-hidden />
    </span>
  );
}

function sameDay(a: string, b: string, tz: string): boolean {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  return f.format(new Date(a)) === f.format(new Date(b));
}

export function ChatRoom({
  slug,
  supabaseUrl,
  supabaseKey,
  conversation,
  me,
  members: initialMembers,
  roles,
  initialMessages,
  hasMore: initialHasMore,
  timezone,
}: {
  slug: string;
  supabaseUrl: string;
  supabaseKey: string;
  conversation: Conversation;
  me: Me;
  members: ChatMember[];
  roles: RoleOption[];
  initialMessages: ChatMessage[];
  hasMore: boolean;
  timezone: string;
}) {
  const supabase = useMemo(() => createBrowserSupabase(supabaseUrl, supabaseKey), [supabaseUrl, supabaseKey]);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [members, setMembers] = useState<Map<string, ChatMember>>(() => new Map(initialMembers.map((m) => [m.user_id, m])));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [thread, setThread] = useState<{ parent: ChatMessage; replies: ChatMessage[]; loading: boolean } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [threadReplyTo, setThreadReplyTo] = useState<ChatMessage | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState<Record<string, number>>({});
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const threadRef = useRef(thread);
  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);
  const firstUnreadId = useMemo(() => {
    if (!me.lastReadAt) return null;
    const t = new Date(me.lastReadAt).getTime();
    return initialMessages.find((m) => new Date(m.created_at).getTime() > t && m.sender_id !== me.id)?.id ?? null;
  }, [initialMessages, me.lastReadAt, me.id]);

  const timeFmt = useMemo(() => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }), [timezone]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: timezone }), [timezone]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const markRead = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadNow = useCallback(async () => {
    const { error } = await supabase.rpc("mark_conversation_read", { p_conversation: conversation.id });
    if (!error) window.dispatchEvent(new CustomEvent(CHAT_READ_EVENT, { detail: conversation.id }));
  }, [supabase, conversation.id]);
  const scheduleMarkRead = useCallback(() => {
    if (markRead.current) clearTimeout(markRead.current);
    markRead.current = setTimeout(() => {
      if (document.visibilityState === "visible") void markReadNow();
    }, 800);
  }, [markReadNow]);

  useEffect(() => {
    void markReadNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleMarkRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [markReadNow, scheduleMarkRead]);

  const ensureMember = useCallback(
    async (userId: string) => {
      if (members.has(userId)) return;
      const { data } = await supabase.from("profiles").select("id, display_name, full_name, avatar_path").eq("id", userId).maybeSingle();
      if (data) {
        setMembers((prev) => {
          const next = new Map(prev);
          next.set(userId, { user_id: userId, name: (data.display_name as string)?.trim() || (data.full_name as string)?.trim() || "Member", avatar_path: (data.avatar_path as string | null) ?? null, role: "member" });
          return next;
        });
      }
    },
    [members, supabase],
  );

  const upsert = useCallback((list: ChatMessage[], msg: ChatMessage) => {
    const i = list.findIndex((m) => m.id === msg.id);
    if (i === -1) return [...list, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const next = list.slice();
    next[i] = msg;
    return next;
  }, []);

  const hydrate = useCallback(
    async (id: string): Promise<ChatMessage | null> => {
      const [m] = await fetchMessages(slug, conversation.id, { ids: [id] });
      return m ?? null;
    },
    [slug, conversation.id],
  );

  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversation.id}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, async (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
        const row = payload.new as unknown as ChatMessage;
        void ensureMember(row.sender_id);
        const full = (await hydrate(row.id)) ?? { ...row, reply_to_id: row.reply_to_id ?? null, reply_to: null, reactions: [], attachments: [] };
        if (full.parent_id) {
          const t = threadRef.current;
          if (t && t.parent.id === full.parent_id) setThread({ ...t, replies: upsert(t.replies, full) });
          return;
        }
        const el = scrollRef.current;
        atBottom.current = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 120 : true;
        setTyping((prev) => {
          if (!(row.sender_id in prev)) return prev;
          const next = { ...prev };
          delete next[row.sender_id];
          return next;
        });
        setFresh((prev) => new Set(prev).add(full.id));
        setMessages((prev) => upsert(prev, full));
        if (row.sender_id !== me.id) scheduleMarkRead();
        if (atBottom.current || row.sender_id === me.id) requestAnimationFrame(() => scrollToBottom(true));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, (payload: RealtimePostgresUpdatePayload<Record<string, unknown>>) => {
        const row = payload.new as unknown as ChatMessage;
        const merge = (m: ChatMessage): ChatMessage =>
          m.id === row.id
            ? { ...m, body: row.body, edited_at: row.edited_at, deleted_at: row.deleted_at, pinned_at: row.pinned_at, reply_count: row.reply_count, attachments: row.deleted_at ? [] : m.attachments, reactions: row.deleted_at ? [] : m.reactions }
            : m;
        setMessages((prev) => prev.map(merge));
        setThread((t) => (t ? { ...t, parent: merge(t.parent), replies: t.replies.map(merge) } : t));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversation.id}` }, (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
        const r = payload.new as { message_id: string; user_id: string; emoji: string };
        const add = (m: ChatMessage): ChatMessage =>
          m.id === r.message_id && !m.reactions.some((x) => x.user_id === r.user_id && x.emoji === r.emoji) ? { ...m, reactions: [...m.reactions, { user_id: r.user_id, emoji: r.emoji }] } : m;
        setMessages((prev) => prev.map(add));
        setThread((t) => (t ? { ...t, parent: add(t.parent), replies: t.replies.map(add) } : t));
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? "offline" : "connecting");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, conversation.id, me.id, ensureMember, hydrate, upsert, scheduleMarkRead, scrollToBottom]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`typing:${conversation.id}`, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const p = payload as { user_id?: string; typing?: boolean };
          if (!p.user_id || p.user_id === me.id) return;
          const id = p.user_id;
          setTyping((prev) => {
            const next = { ...prev };
            if (p.typing) next[id] = Date.now() + 6000;
            else delete next[id];
            return next;
          });
        })
        .subscribe();
      typingChannel.current = channel;
    })();
    return () => {
      cancelled = true;
      typingChannel.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, conversation.id, me.id]);

  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, until]) => until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typing]);

  const notifyTyping = useCallback(
    (active: boolean) => {
      const channel = typingChannel.current;
      if (!channel) return;
      const now = Date.now();
      if (active && now - lastTypingSent.current < 2500) return;
      if (!active && lastTypingSent.current === 0) return;
      lastTypingSent.current = active ? now : 0;
      void channel.send({ type: "broadcast", event: "typing", payload: { user_id: me.id, typing: active } });
    },
    [me.id],
  );

  const typers = useMemo(() => Object.keys(typing).map((id) => members.get(id)).filter((m): m is ChatMember => Boolean(m)), [typing, members]);

  useEffect(() => {
    if (typers.length && atBottom.current) scrollToBottom(true);
  }, [typers.length, scrollToBottom]);

  async function loadOlder() {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const older = await fetchMessages(slug, conversation.id, { before: messages[0].created_at });
    setHasMore(older.length >= 50);
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    older.forEach((m) => void ensureMember(m.sender_id));
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
    setLoadingOlder(false);
  }

  async function openThread(parent: ChatMessage) {
    setPinned(null);
    setThreadReplyTo(null);
    setThread({ parent, replies: [], loading: true });
    const replies = await fetchMessages(slug, conversation.id, { parentId: parent.id });
    replies.forEach((m) => void ensureMember(m.sender_id));
    setThread((t) => (t && t.parent.id === parent.id ? { ...t, replies, loading: false } : t));
  }

  async function openPinned() {
    setThread(null);
    setPinned([]);
    setPinned(await fetchMessages(slug, conversation.id, { pinned: true }));
  }

  const applyLocal = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    setThread((t) => (t ? { ...t, parent: t.parent.id === id ? fn(t.parent) : t.parent, replies: t.replies.map((m) => (m.id === id ? fn(m) : m)) } : t));
  }, []);

  async function toggleReaction(m: ChatMessage, key: string) {
    const mine = m.reactions.some((r) => r.user_id === me.id && r.emoji === key);
    if (mine) {
      applyLocal(m.id, (x) => ({ ...x, reactions: x.reactions.filter((r) => !(r.user_id === me.id && r.emoji === key)) }));
      const { error: e } = await supabase.from("message_reactions").delete().eq("message_id", m.id).eq("user_id", me.id).eq("emoji", key);
      if (e) setError(dbErrorMessage(e));
    } else {
      applyLocal(m.id, (x) => ({ ...x, reactions: [...x.reactions, { user_id: me.id, emoji: key }] }));
      const { error: e } = await supabase.from("message_reactions").insert({ message_id: m.id, conversation_id: conversation.id, user_id: me.id, emoji: key });
      if (e && e.code !== "23505") setError(dbErrorMessage(e));
    }
  }

  async function editMessage(m: ChatMessage, body: string): Promise<boolean> {
    const { error: e } = await supabase.from("messages").update({ body }).eq("id", m.id);
    if (e) {
      setError(dbErrorMessage(e));
      return false;
    }
    applyLocal(m.id, (x) => ({ ...x, body, edited_at: new Date().toISOString() }));
    return true;
  }

  async function deleteMessage(m: ChatMessage) {
    if (!window.confirm("Delete this message?")) return;
    if (m.sender_id === me.id) {
      const { data, error: e } = await supabase.rpc("delete_message", { p_message: m.id });
      if (e) return setError(dbErrorMessage(e));
      const paths = (data as string[] | null) ?? [];
      if (paths.length) await purgeDeletedAttachments(slug, conversation.id, paths).catch(() => undefined);
    } else {
      const { error: e } = await supabase.rpc("moderate_message", { p_message: m.id, p_action: "delete" });
      if (e) return setError(dbErrorMessage(e));
    }
    applyLocal(m.id, (x) => ({ ...x, deleted_at: new Date().toISOString(), body: "", attachments: [], reactions: [] }));
  }

  async function togglePin(m: ChatMessage) {
    const { error: e } = await supabase.rpc("moderate_message", { p_message: m.id, p_action: m.pinned_at ? "unpin" : "pin" });
    if (e) return setError(dbErrorMessage(e));
    applyLocal(m.id, (x) => ({ ...x, pinned_at: x.pinned_at ? null : new Date().toISOString() }));
  }

  async function reportMessage(m: ChatMessage, reason: string, details: string): Promise<boolean> {
    const { error: e } = await supabase.rpc("report_message", { p_message: m.id, p_reason: reason, p_details: details || null });
    if (e) {
      setError(dbErrorMessage(e));
      return false;
    }
    return true;
  }

  const restricted = me.restricted;
  const canPost = !conversation.archived && !restricted && (conversation.postingPolicy === "all" || me.isModerator);
  const memberList = useMemo(() => [...members.values()], [members]);

  function reply(m: ChatMessage) {
    if (m.parent_id) setThreadReplyTo(m);
    else setReplyTo(m);
  }

  function jumpTo(id: string, inThread: boolean) {
    const root = inThread ? threadScrollRef.current : scrollRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  }

  const actions: MessageActions = { toggleReaction, editMessage, deleteMessage, togglePin, reportMessage, openThread, reply, jumpTo };
  const others = memberList.filter((m) => m.user_id !== me.id);
  const other = conversation.kind === "direct" ? others[0] : undefined;
  const subtitle =
    conversation.kind === "direct"
      ? "Direct message"
      : conversation.kind === "group"
        ? `You, ${others.map((m) => m.name.split(" ")[0]).join(", ")}`
        : conversation.topic || `${memberList.length} ${memberList.length === 1 ? "member" : "members"}`;
  const showNames = conversation.kind !== "direct";

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-5">
          <Link href={`/c/${slug}/chat`} className="rounded p-1 text-ink-3 hover:bg-subtle md:hidden" aria-label="All conversations">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <ConversationAvatar kind={conversation.kind} visibility={conversation.visibility} other={other} title={conversation.title} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-ink">{conversation.title}</h1>
            <p className="truncate text-xs text-ink-3">
              {typers.length ? <span className="text-accent">{typingLabel(typers)}</span> : subtitle}
            </p>
          </div>
          {live !== "live" ? (
            <span className="hidden items-center gap-1.5 text-xs text-ink-3 sm:flex" aria-live="polite">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              {live === "offline" ? "Reconnecting" : "Connecting"}
            </span>
          ) : null}
          <button type="button" onClick={openPinned} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Pinned messages">
            <Pin className="size-4" aria-hidden />
          </button>
          <Link href={`/c/${slug}/chat/${conversation.id}/details`} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Conversation details">
            <Info className="size-4" aria-hidden />
          </Link>
        </header>
        {error ? (
          <div className="px-4 pt-3">
            <Notice tone="danger" action={<button type="button" onClick={() => setError(null)} className="text-xs underline">Dismiss</button>}>{error}</Notice>
          </div>
        ) : null}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-canvas px-3 pb-4 pt-6 sm:px-6 xl:px-10" onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}>
          {hasMore ? (
            <div className="mb-4 flex justify-center">
              <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Load earlier messages
              </Button>
            </div>
          ) : (
            <div className="mx-auto mb-8 flex max-w-sm flex-col items-center pt-6 text-center">
              <ConversationAvatar kind={conversation.kind} visibility={conversation.visibility} other={other} title={conversation.title} large />
              <p className="mt-3 text-base font-semibold text-ink">{conversation.title}</p>
              <p className="mt-1 text-[13px] text-ink-3">
                {conversation.kind === "direct"
                  ? "This is the start of your conversation. Only the two of you can see these messages."
                  : conversation.kind === "group"
                    ? `This is the start of your group with ${others.length} ${others.length === 1 ? "person" : "people"}.`
                    : `Messages here are visible to the ${memberList.length} ${memberList.length === 1 ? "member" : "members"} of this channel.`}
              </p>
            </div>
          )}
          <ol>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || !sameDay(prev.created_at, m.created_at, timezone);
              const grouped = !newDay && Boolean(prev) && prev.sender_id === m.sender_id && !prev.deleted_at && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
              const continues =
                Boolean(next) && next.sender_id === m.sender_id && !m.deleted_at && sameDay(m.created_at, next.created_at, timezone) && new Date(next.created_at).getTime() - new Date(m.created_at).getTime() < 5 * 60_000 && next.id !== firstUnreadId;
              return (
                <Fragment key={m.id}>
                  {newDay ? (
                    <li className="my-6 flex items-center gap-3" aria-hidden>
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-[11px] font-medium text-ink-3">{dayFmt.format(new Date(m.created_at))}</span>
                      <span className="h-px flex-1 bg-line" />
                    </li>
                  ) : null}
                  {m.id === firstUnreadId ? (
                    <li className="my-4 flex items-center gap-3 text-[11px] font-medium text-accent">
                      <span className="h-px flex-1 bg-accent/25" />
                      New messages
                      <span className="h-px flex-1 bg-accent/25" />
                    </li>
                  ) : null}
                  <MessageItem
                    m={m}
                    me={me}
                    sender={members.get(m.sender_id)}
                    members={memberList}
                    roles={roles}
                    grouped={grouped && m.id !== firstUnreadId}
                    last={!continues}
                    fresh={fresh.has(m.id)}
                    showName={showNames}
                    time={timeFmt.format(new Date(m.created_at))}
                    actions={actions}
                    highlight={flash === m.id}
                    showThread
                  />
                </Fragment>
              );
            })}
          </ol>
          {messages.length === 0 && typers.length === 0 ? <p className="py-4 text-center text-[13px] text-ink-3">No messages yet. Say hello.</p> : null}
          {typers.length ? (
            <div className="fade-up mt-3 flex items-end gap-2" aria-live="polite">
              <div className="w-10 shrink-0">
                <Avatar name={typers[0].name} path={typers[0].avatar_path} size="md" />
              </div>
              <div className="flex h-10 items-center gap-1 rounded-[20px] rounded-bl-md bg-subtle px-4" aria-label={typingLabel(typers)}>
                <span className="typing-dot size-1.5 rounded-full bg-ink-2" />
                <span className="typing-dot size-1.5 rounded-full bg-ink-2 [animation-delay:150ms]" />
                <span className="typing-dot size-1.5 rounded-full bg-ink-2 [animation-delay:300ms]" />
              </div>
              <span className="mb-2.5 text-[11px] text-ink-3">{typingLabel(typers)}</span>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 bg-canvas px-3 pb-4 pt-2 sm:px-6 xl:px-10">
          {canPost ? (
            <Composer
              slug={slug}
              supabase={supabase}
              conversation={conversation}
              me={me}
              members={memberList}
              roles={roles}
              placeholder={conversation.kind === "direct" ? `Message ${conversation.title}` : conversation.kind === "group" ? "Message the group" : `Message ${conversation.title}`}
              replyTo={replyTo}
              replyName={replyTo ? members.get(replyTo.sender_id)?.name : undefined}
              onCancelReply={() => setReplyTo(null)}
              onTyping={notifyTyping}
              onSent={(msg) => {
                setFresh((prev) => new Set(prev).add(msg.id));
                setMessages((prev) => upsert(prev, msg));
                requestAnimationFrame(() => scrollToBottom(true));
              }}
              onError={setError}
            />
          ) : (
            <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-center text-sm text-ink-3">
              {conversation.archived ? "This channel is archived." : restricted ? "Posting is temporarily restricted for you here." : "Only moderators can post in this channel."}
            </p>
          )}
        </div>
      </section>
      {thread ? (
        <aside className="fixed inset-0 z-40 flex flex-col bg-surface md:static md:z-auto md:w-96 md:shrink-0 md:border-l md:border-line">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <p className="text-sm font-semibold text-ink">Thread</p>
            <button type="button" onClick={() => setThread(null)} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle" aria-label="Close thread">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div ref={threadScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            <ol>
              <MessageItem m={thread.parent} me={me} sender={members.get(thread.parent.sender_id)} members={memberList} roles={roles} grouped={false} last fresh={false} showName time={timeFmt.format(new Date(thread.parent.created_at))} actions={actions} compact noReply showThread={false} />
            </ol>
            <p className="my-3 text-xs text-ink-3">{thread.parent.reply_count} {thread.parent.reply_count === 1 ? "reply" : "replies"}</p>
            {thread.loading ? <LoaderCircle className="mx-auto size-4 animate-spin text-ink-3" aria-label="Loading replies" /> : null}
            <ol className="space-y-0.5">
              {thread.replies.map((r, i) => {
                const prev = thread.replies[i - 1];
                const next = thread.replies[i + 1];
                const grouped = Boolean(prev) && prev.sender_id === r.sender_id && new Date(r.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
                const continues = Boolean(next) && next.sender_id === r.sender_id && new Date(next.created_at).getTime() - new Date(r.created_at).getTime() < 5 * 60_000;
                return <MessageItem key={r.id} m={r} me={me} sender={members.get(r.sender_id)} members={memberList} roles={roles} grouped={grouped} last={!continues} fresh={fresh.has(r.id)} showName={showNames} time={timeFmt.format(new Date(r.created_at))} actions={actions} highlight={flash === r.id} inThread compact showThread={false} />;
              })}
            </ol>
          </div>
          {canPost && !thread.parent.deleted_at ? (
            <div className="shrink-0 border-t border-line p-3">
              <Composer
                slug={slug}
                supabase={supabase}
                conversation={conversation}
                me={me}
                members={memberList}
                roles={roles}
                parentId={thread.parent.id}
                placeholder="Reply in thread"
                replyTo={threadReplyTo}
                replyName={threadReplyTo ? members.get(threadReplyTo.sender_id)?.name : undefined}
                onCancelReply={() => setThreadReplyTo(null)}
                onTyping={notifyTyping}
                onSent={(msg) => {
                  setFresh((prev) => new Set(prev).add(msg.id));
                  setThread((t) => (t ? { ...t, replies: upsert(t.replies, msg) } : t));
                }}
                onError={setError}
              />
            </div>
          ) : null}
        </aside>
      ) : null}
      {pinned ? (
        <aside className="fixed inset-0 z-40 flex flex-col bg-surface md:static md:z-auto md:w-96 md:shrink-0 md:border-l md:border-line">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <p className="text-sm font-semibold text-ink">Pinned</p>
            <button type="button" onClick={() => setPinned(null)} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle" aria-label="Close pinned messages">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {pinned.length === 0 ? <p className="text-sm text-ink-3">Moderators can pin important messages here.</p> : null}
            <ol className="space-y-3">
              {pinned.map((p) => (
                <MessageItem key={p.id} m={p} me={me} sender={members.get(p.sender_id)} members={memberList} roles={roles} grouped={false} last fresh={false} showName time={dayFmt.format(new Date(p.created_at))} actions={actions} compact noReply showThread={false} />
              ))}
            </ol>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

type MessageActions = {
  toggleReaction: (m: ChatMessage, key: string) => Promise<void>;
  editMessage: (m: ChatMessage, body: string) => Promise<boolean>;
  deleteMessage: (m: ChatMessage) => Promise<void>;
  togglePin: (m: ChatMessage) => Promise<void>;
  reportMessage: (m: ChatMessage, reason: string, details: string) => Promise<boolean>;
  openThread: (m: ChatMessage) => Promise<void>;
  reply: (m: ChatMessage) => void;
  jumpTo: (id: string, inThread: boolean) => void;
};

function MessageBody({ body, members, roles, meId, inverted }: { body: string; members: ChatMember[]; roles: RoleOption[]; meId: string; inverted: boolean }) {
  const parts = useMemo(() => {
    const names = [...members.map((m) => ({ label: m.name, me: m.user_id === meId })), ...roles.map((r) => ({ label: r.name, me: false })), { label: "everyone", me: true }].sort((a, b) => b.label.length - a.label.length);
    const mentionSrc = names.length ? `@(?:${names.map((n) => escapeRegex(n.label)).join("|")})` : "@everyone";
    const re = new RegExp(`(https?:\\/\\/[^\\s<]+[^\\s<.,;:!?)\\]'"])|(${mentionSrc})`, "gi");
    const out: ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    let k = 0;
    while ((match = re.exec(body))) {
      if (match.index > last) out.push(body.slice(last, match.index));
      if (match[1]) {
        out.push(
          <a key={k++} href={match[1]} target="_blank" rel="noopener noreferrer nofollow" className={cx("break-all underline underline-offset-2", inverted ? "text-on-accent decoration-on-accent/40" : "text-accent decoration-accent/40")}>
            {match[1]}
          </a>,
        );
      } else {
        const label = match[2].slice(1).toLowerCase();
        const n = names.find((x) => x.label.toLowerCase() === label);
        out.push(
          <span key={k++} className={cx("rounded px-0.5 font-medium", inverted ? "bg-black/15 text-on-accent" : n?.me ? "bg-gold-soft text-gold" : "bg-accent-soft text-accent")}>
            {match[2]}
          </span>,
        );
      }
      last = match.index + match[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  }, [body, members, roles, meId, inverted]);
  return <>{parts}</>;
}

function MessageItem({
  m,
  me,
  sender,
  members,
  roles,
  grouped,
  last,
  fresh,
  showName,
  time,
  actions,
  showThread,
  highlight = false,
  inThread = false,
  compact = false,
  noReply = false,
}: {
  m: ChatMessage;
  me: Me;
  sender: ChatMember | undefined;
  members: ChatMember[];
  roles: RoleOption[];
  grouped: boolean;
  last: boolean;
  fresh: boolean;
  showName: boolean;
  time: string;
  actions: MessageActions;
  showThread: boolean;
  highlight?: boolean;
  inThread?: boolean;
  compact?: boolean;
  noReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [reacting, setReacting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const now = useNow();
  const mine = m.sender_id === me.id;
  const name = sender?.name ?? "Member";
  const quoteName = m.reply_to ? (m.reply_to.sender_id === me.id ? "You" : members.find((x) => x.user_id === m.reply_to?.sender_id)?.name ?? "Member") : "";
  const editable = mine && !m.deleted_at && now - new Date(m.created_at).getTime() < 24 * 3600_000;
  const counts = new Map<string, { n: number; mine: boolean }>();
  for (const r of m.reactions) {
    const c = counts.get(r.emoji) ?? { n: 0, mine: false };
    counts.set(r.emoji, { n: c.n + 1, mine: c.mine || r.user_id === me.id });
  }
  const toolbar = !m.deleted_at && !editing ? (
    <div
      className={cx(
        "absolute z-10 hidden items-center rounded-full border border-line bg-surface px-0.5 shadow-lg shadow-black/40 group-focus-within:flex group-hover:flex",
        compact ? cx("-top-5", mine ? "right-0" : "left-0") : cx("top-1/2 -translate-y-1/2", mine ? "right-full mr-1.5" : "left-full ml-1.5"),
      )}
    >
      {reacting ? (
        <div className="flex items-center" onMouseLeave={() => setReacting(false)}>
          {REACTIONS.map((r) => (
            <button key={r.key} type="button" onClick={() => { setReacting(false); void actions.toggleReaction(m, r.key); }} className="rounded-full p-1.5 text-ink-2 hover:bg-subtle hover:text-ink" aria-label={r.label} title={r.label}>
              <r.icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <>
          <ToolButton label="React" onClick={() => setReacting(true)} icon={SmilePlus} />
          {!noReply ? <ToolButton label="Reply" onClick={() => actions.reply(m)} icon={Reply} /> : null}
          {showThread ? <ToolButton label="Start a thread" onClick={() => actions.openThread(m)} icon={MessagesSquare} /> : null}
          {editable ? <ToolButton label="Edit" onClick={() => { setDraft(m.body); setEditing(true); }} icon={Pencil} /> : null}
          {me.isModerator && !m.parent_id ? <ToolButton label={m.pinned_at ? "Unpin" : "Pin"} onClick={() => actions.togglePin(m)} icon={m.pinned_at ? PinOff : Pin} /> : null}
          {!mine ? <ToolButton label="Report" onClick={() => setReporting(true)} icon={Flag} /> : null}
          {mine || me.isModerator ? <ToolButton label="Delete" onClick={() => actions.deleteMessage(m)} icon={Trash2} danger /> : null}
        </>
      )}
    </div>
  ) : null;
  return (
    <li
      data-mid={m.id}
      className={cx(
        "group -mx-2 flex items-end gap-2 rounded-2xl px-2 transition-colors duration-700",
        mine && "flex-row-reverse",
        grouped && !m.reply_to ? "mt-0.5" : "mt-4",
        highlight && "bg-accent-soft",
        fresh && (mine ? "bubble-in origin-bottom-right" : "bubble-in origin-bottom-left"),
      )}
    >
      {!mine ? (
        <div className={cx("mb-0.5 shrink-0 self-end", compact ? "w-8" : "w-10")}>
          {last ? <Avatar name={name} path={sender?.avatar_path} size={compact ? "sm" : "md"} /> : null}
        </div>
      ) : null}
      <div className={cx("flex min-w-0 flex-col", compact ? "max-w-[85%]" : "max-w-[85%] md:max-w-[72%] xl:max-w-[62%]", mine ? "items-end" : "items-start")}>
        {!grouped ? (
          <p className={cx("mb-1 flex items-center gap-1.5 px-3 text-xs", mine && "flex-row-reverse")}>
            {!mine && showName ? <span className="font-medium text-ink-2">{name}</span> : null}
            <span className="text-ink-3">{time}</span>
            {m.pinned_at ? <Pin className="size-3 text-gold" aria-label="Pinned" /> : null}
          </p>
        ) : null}
        {m.reply_to && !m.deleted_at ? (
          <button
            type="button"
            onClick={() => m.reply_to && !m.reply_to.deleted && actions.jumpTo(m.reply_to.id, inThread)}
            className={cx("mb-1 flex max-w-full items-start gap-2 text-left", mine && "flex-row-reverse text-right")}
            aria-label={m.reply_to.deleted ? "Replied to a deleted message" : `Replied to ${quoteName}: ${m.reply_to.body}`}
          >
            <Reply className={cx("mt-1 size-3.5 shrink-0 text-ink-3", mine && "-scale-x-100")} aria-hidden />
            <span className={cx("min-w-0 rounded-2xl border border-line bg-surface/60 px-3 py-1.5 transition-colors hover:border-line-strong", mine ? "border-r-2 border-r-accent/60" : "border-l-2 border-l-accent/60")}>
              <span className="block text-[11px] font-medium text-ink-2">{m.reply_to.deleted ? "Original message" : quoteName}</span>
              <span className="line-clamp-2 block text-[13px] text-ink-3">
                {m.reply_to.deleted ? "This message was deleted." : m.reply_to.body || (m.reply_to.has_attachment ? "Attachment" : "Message")}
              </span>
            </span>
          </button>
        ) : null}
        <div className="relative max-w-full" title={grouped ? time : undefined}>
          {toolbar}
          {m.deleted_at ? (
            <p className="rounded-[20px] border border-dashed border-line px-4 py-2 text-[13px] italic text-ink-3">Message deleted</p>
          ) : editing ? (
            <form
              className="w-[min(32rem,80vw)] space-y-2 rounded-2xl border border-line bg-surface p-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const body = draft.trim();
                if (!body || body === m.body) return setEditing(false);
                if (await actions.editMessage(m, body)) setEditing(false);
              }}
            >
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} className="min-h-16" autoFocus onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }} />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button type="submit" size="sm">Save</Button>
              </div>
            </form>
          ) : (
            <>
              {m.body ? (
                <p
                  className={cx(
                    "whitespace-pre-wrap break-words rounded-[22px] px-4 py-2.5 text-[15px] leading-[1.45] sm:text-base",
                    mine ? "bg-accent text-on-accent" : "bg-subtle text-ink",
                    grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                    !last && (mine ? "rounded-br-md" : "rounded-bl-md"),
                    m.pinned_at && !mine && "ring-1 ring-gold/40",
                  )}
                >
                  <MessageBody body={m.body} members={members} roles={roles} meId={me.id} inverted={mine} />
                  {m.edited_at ? <span className={cx("ml-1.5 text-[11px]", mine ? "text-on-accent/70" : "text-ink-3")}>edited</span> : null}
                </p>
              ) : null}
              {m.attachments.length ? (
                <div className={cx("mt-1.5 flex flex-wrap gap-2", mine && "justify-end")}>
                  {m.attachments.map((a) =>
                    a.mime_type.startsWith("image/") && a.url ? (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-line">
                        <img src={a.url} alt={a.file_name} className={cx("object-cover", compact ? "max-h-56 max-w-56" : "max-h-80 max-w-[min(24rem,70vw)]")} loading="lazy" />
                      </a>
                    ) : (
                      <a key={a.id} href={a.url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-2xl border border-line bg-subtle px-3 py-2 text-sm hover:border-line-strong">
                        <FileText className="size-4 text-ink-3" aria-hidden />
                        <span className="max-w-48 truncate text-ink">{a.file_name}</span>
                        <span className="text-xs text-ink-3">{sizeLabel(a.size_bytes)}</span>
                      </a>
                    ),
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
        {counts.size > 0 ? (
          <div className={cx("mt-1 flex flex-wrap items-center gap-1.5", mine && "justify-end")}>
            {[...counts.entries()].map(([key, c]) => {
              const R = REACTIONS.find((x) => x.key === key);
              const Icon = R?.icon ?? SmilePlus;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => actions.toggleReaction(m, key)}
                  className={cx("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tnum", c.mine ? "border-accent/40 bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:bg-subtle")}
                  aria-pressed={c.mine}
                  aria-label={`${R?.label ?? key}: ${c.n}`}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {c.n}
                </button>
              );
            })}
          </div>
        ) : null}
        {showThread && m.reply_count > 0 ? (
          <button
            type="button"
            onClick={() => actions.openThread(m)}
            className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-2 pr-3 text-left transition-colors hover:border-accent/50 hover:bg-subtle"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
              <MessagesSquare className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-xs font-semibold text-ink">Thread</span>
              <span className="block text-[11px] text-ink-3">{m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}</span>
            </span>
            <ChevronRight className="size-4 text-ink-3" aria-hidden />
          </button>
        ) : null}
        {reporting ? (
          <ReportForm
            onCancel={() => setReporting(false)}
            onSubmit={async (reason, details) => {
              if (await actions.reportMessage(m, reason, details)) {
                setReporting(false);
                setReported(true);
              }
            }}
          />
        ) : null}
        {reported ? <p className="mt-1 px-1 text-xs text-ink-3">Reported to chapter moderators. Thank you.</p> : null}
      </div>
    </li>
  );
}

function ToolButton({ label, onClick, icon: Icon, danger }: { label: string; onClick: () => void; icon: LucideIcon; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx("rounded-full p-1.5 hover:bg-subtle", danger ? "text-ink-3 hover:text-danger" : "text-ink-3 hover:text-ink")} aria-label={label} title={label}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function ReportForm({ onSubmit, onCancel }: { onSubmit: (reason: string, details: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2 space-y-2 rounded-md border border-line bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(reason, details);
        setBusy(false);
      }}
    >
      <p className="text-sm font-medium text-ink">Report this message</p>
      <p className="text-xs text-ink-3">Chapter moderators will see the message and your note. The sender is not told who reported it.</p>
      <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
        <option value="harassment">Harassment or bullying</option>
        <option value="hazing">Hazing</option>
        <option value="threat">Threat or safety concern</option>
        <option value="privacy">Shares private information</option>
        <option value="spam">Spam</option>
        <option value="other">Something else</option>
      </Select>
      <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Optional details" className="min-h-14" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={busy}>Report</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function Composer({
  slug,
  supabase,
  conversation,
  me,
  members,
  roles,
  parentId,
  placeholder,
  replyTo,
  replyName,
  onCancelReply,
  onTyping,
  onSent,
  onError,
}: {
  slug: string;
  replyTo?: ChatMessage | null;
  replyName?: string;
  onCancelReply?: () => void;
  supabase: ReturnType<typeof createBrowserSupabase>;
  conversation: Conversation;
  me: Me;
  members: ChatMember[];
  roles: RoleOption[];
  parentId?: string;
  placeholder: string;
  onTyping: (active: boolean) => void;
  onSent: (m: ChatMessage) => void;
  onError: (e: string) => void;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Array<Pending & { local: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    const people = members.filter((m) => m.user_id !== me.id && m.name.toLowerCase().includes(q)).slice(0, 6).map((m) => ({ id: m.user_id, label: m.name, kind: "user" as const }));
    const rs = roles.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 3).map((r) => ({ id: r.id, label: r.name, kind: "role" as const }));
    const all = me.isModerator && "everyone".includes(q) ? [{ id: "everyone", label: "everyone", kind: "all" as const }] : [];
    return [...people, ...rs, ...all];
  }, [query, members, roles, me]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [body]);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  function onChange(value: string, caret: number) {
    setBody(value);
    onTyping(value.trim().length > 0);
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (m) {
      setQuery({ text: m[2], start: caret - m[2].length - 1 });
      setActive(0);
    } else setQuery(null);
  }

  function pick(s: { label: string }) {
    if (!query) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? body.length;
    const next = `${body.slice(0, query.start)}@${s.label} ${body.slice(caret)}`;
    setBody(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + s.label.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    if (files.length + list.length > 5) return onError("Attach up to 5 files per message.");
    setUploading(true);
    for (const f of Array.from(list)) {
      if (!ALLOWED_TYPES.has(f.type)) {
        onError(`${f.name} is not a supported file type.`);
        continue;
      }
      if (f.size > MAX_FILE) {
        onError(`${f.name} is larger than 15 MB.`);
        continue;
      }
      const ticket = await createAttachmentUpload(slug, conversation.id, { name: f.name, type: f.type, size: f.size }).catch(() => ({ error: `Could not upload ${f.name}.` }));
      if ("error" in ticket) {
        onError(ticket.error);
        continue;
      }
      const path = ticket.path;
      const { error } = await supabase.storage.from("chat-attachments").uploadToSignedUrl(path, ticket.token, f, { contentType: f.type });
      if (error) {
        onError(`Could not upload ${f.name}: ${error.message}`);
        continue;
      }
      setFiles((prev) => [...prev, { path, name: f.name.slice(0, 200), type: f.type, size: f.size, local: f.type.startsWith("image/") ? URL.createObjectURL(f) : "" }]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function removeFile(path: string) {
    setFiles((prev) => prev.filter((f) => f.path !== path));
    await removePendingAttachment(slug, conversation.id, path).catch(() => undefined);
  }

  async function send() {
    const text = (ref.current?.value ?? body).trim();
    if ((!text && files.length === 0) || sending || uploading) return;
    setSending(true);
    onTyping(false);
    const lower = text.toLowerCase();
    const has = (label: string) => new RegExp(`(^|\\s)@${escapeRegex(label.toLowerCase())}(?=$|[\\s.,!?;:])`).test(lower);
    const mentions = members.filter((m) => m.user_id !== me.id && has(m.name)).map((m) => m.user_id);
    const mentionRoles = roles.filter((r) => has(r.name)).map((r) => r.id);
    const mentionAll = me.isModerator && has("everyone");
    const { data, error } = await supabase.rpc("send_message", {
      p_conversation: conversation.id,
      p_body: text,
      p_parent: parentId ?? null,
      p_mentions: mentions,
      p_mention_roles: mentionRoles,
      p_mention_all: mentionAll,
      p_attachments: files.map(({ path, name, type, size }) => ({ path, name, type, size })),
      ...(replyTo ? { p_reply_to: replyTo.id } : {}),
    });
    setSending(false);
    if (error) return onError(dbErrorMessage(error));
    const row = data as Omit<ChatMessage, "reactions" | "attachments" | "reply_to">;
    onSent({
      ...row,
      reply_to_id: replyTo?.id ?? null,
      reply_to: replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, body: replyTo.body, deleted: false, has_attachment: replyTo.attachments.length > 0 } : null,
      reactions: [],
      attachments: files.map((f) => ({ id: f.path, file_name: f.name, mime_type: f.type, size_bytes: f.size, url: f.local || null })),
    });
    onCancelReply?.();
    setBody("");
    if (ref.current) ref.current.value = "";
    setFiles([]);
    ref.current?.focus();
  }

  return (
    <div className="relative">
      {query && suggestions.length > 0 ? (
        <ul className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-md" role="listbox">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}-${s.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={cx("flex w-full items-center justify-between px-3 py-1.5 text-left text-sm", i === active ? "bg-subtle text-ink" : "text-ink-2")}
              >
                <span>@{s.label}</span>
                <span className="text-xs text-ink-3">{s.kind === "role" ? "Role" : s.kind === "all" ? "Notify everyone" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {replyTo ? (
        <div className="fade-up mb-2 flex items-center gap-3 rounded-2xl border border-line bg-surface py-2 pl-3 pr-2">
          <Reply className="size-4 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1 border-l-2 border-accent/60 pl-2.5">
            <p className="text-xs font-medium text-accent">Replying to {replyTo.sender_id === me.id ? "yourself" : replyName ?? "Member"}</p>
            <p className="truncate text-[13px] text-ink-2">{replyTo.body || (replyTo.attachments.length ? "Attachment" : "Message")}</p>
          </div>
          <button type="button" onClick={onCancelReply} className="rounded-full p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Cancel reply">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {files.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <span key={f.path} className="flex items-center gap-2 rounded-md border border-line bg-subtle px-2 py-1 text-xs">
              {f.local ? <img src={f.local} alt="" className="size-6 rounded object-cover" /> : <FileText className="size-4 text-ink-3" aria-hidden />}
              <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" onClick={() => removeFile(f.path)} className="text-ink-3 hover:text-danger" aria-label={`Remove ${f.name}`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5 rounded-[22px] border border-line bg-surface px-1.5 py-1.5 shadow-lg shadow-black/30 transition-colors focus-within:border-line-strong">
        <button type="button" onClick={() => fileRef.current?.click()} className="mb-0.5 rounded-full p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Attach files" title="Attach files" disabled={uploading}>
          {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
        </button>
        <input ref={fileRef} type="file" multiple hidden accept={[...ALLOWED_TYPES].join(",")} onChange={(e) => addFiles(e.target.files)} />
        <textarea
          suppressHydrationWarning
          ref={ref}
          value={body}
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (query && suggestions.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(suggestions[active]);
                return;
              }
              if (e.key === "Escape") {
                setQuery(null);
                return;
              }
            }
            if (e.key === "Escape" && replyTo) {
              onCancelReply?.();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          onBlur={() => onTyping(false)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void addFiles(e.clipboardData.files);
            }
          }}
          className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
        <button
          suppressHydrationWarning
          type="button"
          onClick={send}
          disabled={sending || uploading || (!body.trim() && files.length === 0)}
          aria-label="Send"
          title="Send"
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-full transition-all duration-200",
            body.trim() || files.length ? "scale-100 bg-accent text-on-accent hover:bg-accent-hover" : "scale-90 bg-subtle text-ink-3",
          )}
        >
          {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
