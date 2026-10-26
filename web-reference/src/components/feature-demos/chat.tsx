"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Eye,
  FileText,
  Flag,
  Hash,
  Heart,
  Info,
  Laugh,
  Lock,
  MessagesSquare,
  Paperclip,
  PartyPopper,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Search,
  SendHorizontal,
  SmilePlus,
  SquarePen,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/people";
import { Button, Select, Textarea, cx } from "@/components/ui";
import { AppFrame, TryIt } from "./shared";

const REACTIONS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "+1", label: "Agree", icon: ThumbsUp },
  { key: "heart", label: "Love", icon: Heart },
  { key: "check", label: "Done", icon: Check },
  { key: "laugh", label: "Funny", icon: Laugh },
  { key: "eyes", label: "Looking", icon: Eye },
  { key: "party", label: "Celebrate", icon: PartyPopper },
];

const ME = "Jordan Lee";
const PEOPLE = ["Marcus Hill", "Devin Ortiz", "Chris Nguyen", "Sam Patel", "Tyler Brooks"];
const ROLES = ["President", "Treasurer", "Recruitment chair"];

type Quote = { from: string; body: string };
type Message = { id: string; from: string; body: string; time: string; reactions: Record<string, string[]>; pinned?: boolean; edited?: boolean; deleted?: boolean; reply?: Quote; file?: string; thread?: Message[] };
type Conversation = { id: string; kind: "direct" | "channel" | "restricted"; title: string; subtitle: string; unread: number; responder: string; answer: string; messages: Message[] };

const START: Conversation[] = [
  {
    id: "devin",
    kind: "direct",
    title: "Devin Ortiz",
    subtitle: "Direct message",
    unread: 1,
    responder: "Devin Ortiz",
    answer: "Perfect, thanks. I'll send it over tonight.",
    messages: [{ id: "d1", from: "Devin Ortiz", body: "Can you look over the formal budget before Sunday?", time: "4:51 PM", reactions: {} }],
  },
  {
    id: "general",
    kind: "channel",
    title: "General",
    subtitle: "48 members",
    unread: 0,
    responder: "Chris Nguyen",
    answer: "Sounds good, see everyone there.",
    messages: [
      { id: "g1", from: "Marcus Hill", body: "Chapter meeting moved to 7:30 Sunday. Same room.", time: "6:02 PM", reactions: { "+1": ["Devin Ortiz", "Chris Nguyen", "Sam Patel", "Tyler Brooks"], check: ["Sam Patel"] }, pinned: true },
      {
        id: "g2",
        from: "Chris Nguyen",
        body: "Who's driving to the food bank Saturday? I have 3 seats.",
        time: "6:14 PM",
        reactions: { heart: ["Marcus Hill"] },
        thread: [
          { id: "g2a", from: "Sam Patel", body: "I can take 4 more.", time: "6:16 PM", reactions: {} },
          { id: "g2b", from: "Tyler Brooks", body: "Put me in Sam's car.", time: "6:19 PM", reactions: {} },
        ],
      },
      { id: "g3", from: "Devin Ortiz", body: "Formal RSVPs are open in Events. Please RSVP by Friday.", time: "6:21 PM", reactions: { party: ["Marcus Hill", "Chris Nguyen"] } },
      { id: "g4", from: ME, body: "Thanks Devin. @everyone please RSVP so we can get a headcount.", time: "6:25 PM", reactions: { "+1": ["Devin Ortiz"] } },
    ],
  },
  {
    id: "exec",
    kind: "restricted",
    title: "Executive board",
    subtitle: "8 members",
    unread: 2,
    responder: "Devin Ortiz",
    answer: "On it. I'll bring the numbers Sunday.",
    messages: [
      { id: "e1", from: "Devin Ortiz", body: "Fall dues are at 82% collected. Reminders go out automatically before each due date.", time: "5:40 PM", reactions: { "+1": ["Marcus Hill"] } },
      { id: "e2", from: "Marcus Hill", body: "Let's review the formal budget before Sunday.", time: "5:44 PM", reactions: {} },
    ],
  },
];

function now(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function first(name: string): string {
  return name.split(" ")[0];
}

const MENTIONS = [...PEOPLE.map((label) => ({ label, kind: "person" })), { label: ME, kind: "person" }, ...ROLES.map((label) => ({ label, kind: "role" })), { label: "everyone", kind: "all" }];

function Body({ text, mine }: { text: string; mine: boolean }) {
  const pattern = new RegExp(`(@(?:${MENTIONS.map((m) => m.label).sort((a, b) => b.length - a.length).join("|")}))`, "gi");
  return (
    <>
      {text.split(pattern).map((part, index) => {
        if (!part.startsWith("@") || !MENTIONS.some((m) => `@${m.label}`.toLowerCase() === part.toLowerCase())) return <span key={index}>{part}</span>;
        const self = part.toLowerCase() === `@${ME}`.toLowerCase() || part.toLowerCase() === "@everyone";
        return <span key={index} className={cx("rounded px-0.5 font-medium", mine ? "bg-black/15 text-on-accent" : self ? "bg-gold-soft text-gold" : "bg-accent-soft text-accent")}>{part}</span>;
      })}
    </>
  );
}

function ConvoIcon({ convo, large }: { convo: Conversation; large?: boolean }) {
  if (convo.kind === "direct") return <Avatar name={convo.title} size={large ? "md" : "md"} />;
  const Icon = convo.kind === "restricted" ? Lock : Hash;
  return (
    <span className={cx("grid shrink-0 place-items-center border border-line bg-canvas text-ink-3", large ? "size-10 rounded-xl" : "size-9 rounded-lg")}>
      <Icon className={large ? "size-5" : "size-4"} aria-hidden />
    </span>
  );
}

function Tool({ label, icon: Icon, onClick, danger }: { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx("rounded-full p-1.5 hover:bg-subtle", danger ? "text-ink-3 hover:text-danger" : "text-ink-3 hover:text-ink")} aria-label={label} title={label}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

type Handlers = {
  react: (id: string, key: string) => void;
  reply: (m: Message) => void;
  thread: (id: string) => void;
  pin: (id: string) => void;
  remove: (id: string) => void;
  edit: (id: string, body: string) => void;
};

function Item({ m, grouped, last, handlers, compact, inThread }: { m: Message; grouped: boolean; last: boolean; handlers: Handlers; compact?: boolean; inThread?: boolean }) {
  const mine = m.from === ME;
  const [reacting, setReacting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const counts = Object.entries(m.reactions).filter(([, people]) => people.length > 0);
  const toolbar = !m.deleted && !editing ? (
    <div className={cx("absolute z-10 hidden items-center rounded-full border border-line bg-surface px-0.5 shadow-lg shadow-black/40 group-focus-within:flex group-hover:flex", compact ? cx("-top-5", mine ? "right-0" : "left-0") : cx("top-1/2 -translate-y-1/2", mine ? "right-full mr-1.5" : "left-full ml-1.5"))}>
      {reacting ? (
        <div className="flex items-center" onMouseLeave={() => setReacting(false)}>
          {REACTIONS.map((r) => (
            <button key={r.key} type="button" onClick={() => { setReacting(false); handlers.react(m.id, r.key); }} className="rounded-full p-1.5 text-ink-2 hover:bg-subtle hover:text-ink" aria-label={r.label} title={r.label}>
              <r.icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <>
          <Tool label="React" icon={SmilePlus} onClick={() => setReacting(true)} />
          {!inThread ? <Tool label="Reply" icon={Reply} onClick={() => handlers.reply(m)} /> : null}
          {!inThread ? <Tool label="Start a thread" icon={MessagesSquare} onClick={() => handlers.thread(m.id)} /> : null}
          {mine ? <Tool label="Edit" icon={Pencil} onClick={() => { setDraft(m.body); setEditing(true); }} /> : null}
          {!inThread ? <Tool label={m.pinned ? "Unpin" : "Pin"} icon={m.pinned ? PinOff : Pin} onClick={() => handlers.pin(m.id)} /> : null}
          {!mine ? <Tool label="Report" icon={Flag} onClick={() => setReporting(true)} /> : null}
          <Tool label="Delete" icon={Trash2} onClick={() => handlers.remove(m.id)} danger />
        </>
      )}
    </div>
  ) : null;

  return (
    <li className={cx("group -mx-2 flex items-end gap-2 rounded-2xl px-2", mine && "flex-row-reverse", grouped && !m.reply ? "mt-0.5" : "mt-4")}>
      {!mine ? <div className={cx("mb-0.5 shrink-0 self-end", compact ? "w-8" : "w-10")}>{last ? <Avatar name={m.from} size={compact ? "sm" : "md"} /> : null}</div> : null}
      <div className={cx("flex min-w-0 flex-col", compact ? "max-w-[85%]" : "max-w-[85%] md:max-w-[72%]", mine ? "items-end" : "items-start")}>
        {!grouped ? (
          <p className={cx("mb-1 flex items-center gap-1.5 px-3 text-xs", mine && "flex-row-reverse")}>
            {!mine ? <span className="font-medium text-ink-2">{m.from}</span> : null}
            <span className="text-ink-3">{m.time}</span>
            {m.pinned ? <Pin className="size-3 text-gold" aria-label="Pinned" /> : null}
          </p>
        ) : null}
        {m.reply && !m.deleted ? (
          <span className={cx("mb-1 flex max-w-full items-start gap-2 text-left", mine && "flex-row-reverse text-right")}>
            <Reply className={cx("mt-1 size-3.5 shrink-0 text-ink-3", mine && "-scale-x-100")} aria-hidden />
            <span className={cx("min-w-0 rounded-2xl border border-line bg-surface/60 px-3 py-1.5", mine ? "border-r-2 border-r-accent/60" : "border-l-2 border-l-accent/60")}>
              <span className="block text-[11px] font-medium text-ink-2">{m.reply.from === ME ? "You" : m.reply.from}</span>
              <span className="line-clamp-2 block text-[13px] text-ink-3">{m.reply.body}</span>
            </span>
          </span>
        ) : null}
        <div className="relative max-w-full">
          {toolbar}
          {m.deleted ? (
            <p className="rounded-[20px] border border-dashed border-line px-4 py-2 text-[13px] italic text-ink-3">Message deleted</p>
          ) : editing ? (
            <form
              className="w-[min(28rem,70vw)] space-y-2 rounded-2xl border border-line bg-surface p-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim() && draft.trim() !== m.body) handlers.edit(m.id, draft.trim());
                setEditing(false);
              }}
            >
              <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-16" autoFocus onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }} />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button type="submit" size="sm">Save</Button>
              </div>
            </form>
          ) : (
            <>
              {m.body ? (
                <p className={cx("whitespace-pre-wrap break-words rounded-[22px] px-4 py-2.5 text-[15px] leading-[1.45]", mine ? "bg-accent text-on-accent" : "bg-subtle text-ink", grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"), !last && (mine ? "rounded-br-md" : "rounded-bl-md"), m.pinned && !mine && "ring-1 ring-gold/40")}>
                  <Body text={m.body} mine={mine} />
                  {m.edited ? <span className={cx("ml-1.5 text-[11px]", mine ? "text-on-accent/70" : "text-ink-3")}>edited</span> : null}
                </p>
              ) : null}
              {m.file ? (
                <span className={cx("mt-1.5 flex items-center gap-2 rounded-2xl border border-line bg-subtle px-3 py-2 text-sm", mine && "self-end")}>
                  <FileText className="size-4 text-ink-3" aria-hidden />
                  <span className="max-w-48 truncate text-ink">{m.file}</span>
                  <span className="text-xs text-ink-3">84 KB</span>
                </span>
              ) : null}
            </>
          )}
        </div>
        {counts.length > 0 ? (
          <div className={cx("mt-1 flex flex-wrap items-center gap-1.5", mine && "justify-end")}>
            {counts.map(([key, people]) => {
              const reaction = REACTIONS.find((r) => r.key === key)!;
              const mineToo = people.includes(ME);
              return (
                <button key={key} type="button" onClick={() => handlers.react(m.id, key)} aria-pressed={mineToo} aria-label={`${reaction.label}: ${people.length}`} title={people.map((p) => (p === ME ? "You" : p)).join(", ")} className={cx("chip-in inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tnum", mineToo ? "border-accent/40 bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:bg-subtle")}>
                  <reaction.icon className="size-3.5" aria-hidden />
                  {people.length}
                </button>
              );
            })}
          </div>
        ) : null}
        {!inThread && m.thread && m.thread.length > 0 ? (
          <button type="button" onClick={() => handlers.thread(m.id)} className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-2 pr-3 text-left transition-colors hover:border-accent/50 hover:bg-subtle">
            <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent"><MessagesSquare className="size-4" aria-hidden /></span>
            <span>
              <span className="block text-xs font-semibold text-ink">Thread</span>
              <span className="block text-[11px] text-ink-3">{m.thread.length} {m.thread.length === 1 ? "reply" : "replies"}</span>
            </span>
            <ChevronRight className="size-4 text-ink-3" aria-hidden />
          </button>
        ) : null}
        {reporting ? (
          <form className="mt-2 space-y-2 rounded-md border border-line bg-surface p-3" onSubmit={(event) => { event.preventDefault(); setReporting(false); setReported(true); }}>
            <p className="text-sm font-medium text-ink">Report this message</p>
            <p className="text-xs text-ink-3">Chapter moderators will see the message and your note. The sender is not told who reported it.</p>
            <Select defaultValue="harassment" aria-label="Reason">
              <option value="harassment">Harassment or bullying</option>
              <option value="hazing">Hazing</option>
              <option value="threat">Threat or safety concern</option>
              <option value="privacy">Shares private information</option>
              <option value="spam">Spam</option>
              <option value="other">Something else</option>
            </Select>
            <Textarea placeholder="Optional details" className="min-h-14" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="danger">Report</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setReporting(false)}>Cancel</Button>
            </div>
          </form>
        ) : null}
        {reported ? <p className="mt-1 px-1 text-xs text-ink-3">Reported to chapter moderators. Thank you.</p> : null}
      </div>
    </li>
  );
}

function List({ messages, handlers, compact, inThread }: { messages: Message[]; handlers: Handlers; compact?: boolean; inThread?: boolean }) {
  return (
    <ol>
      {messages.map((m, index) => (
        <Item key={m.id} m={m} grouped={messages[index - 1]?.from === m.from} last={messages[index + 1]?.from !== m.from} handlers={handlers} compact={compact} inThread={inThread} />
      ))}
    </ol>
  );
}

function Composer({ placeholder, replyTo, onCancelReply, onSend }: { placeholder: string; replyTo?: Message | null; onCancelReply?: () => void; onSend: (body: string, file: string | null) => void }) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const query = body.match(/@([\w ]{0,20})$/)?.[1] ?? null;
  const suggestions = query === null ? [] : MENTIONS.filter((m) => m.label !== ME && m.label.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  function pick(label: string) {
    setBody((value) => value.replace(/@([\w ]{0,20})$/, `@${label} `));
    setActive(0);
    ref.current?.focus();
  }

  function send() {
    if (!body.trim() && !file) return;
    onSend(body.trim(), file);
    setBody("");
    setFile(null);
  }

  return (
    <div className="relative">
      {suggestions.length > 0 ? (
        <ul className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg shadow-black/40">
          {suggestions.map((s, index) => (
            <li key={s.label}>
              <button type="button" onMouseDown={(event) => { event.preventDefault(); pick(s.label); }} className={cx("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm", index === active ? "bg-subtle text-ink" : "text-ink-2")}>
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
            <p className="text-xs font-medium text-accent">Replying to {replyTo.from === ME ? "yourself" : replyTo.from}</p>
            <p className="truncate text-[13px] text-ink-2">{replyTo.body}</p>
          </div>
          <button type="button" onClick={onCancelReply} className="rounded-full p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Cancel reply"><X className="size-4" aria-hidden /></button>
        </div>
      ) : null}
      {file ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <span className="flex items-center gap-2 rounded-md border border-line bg-subtle px-2 py-1 text-xs">
            <FileText className="size-4 text-ink-3" aria-hidden />
            <span className="max-w-40 truncate">{file}</span>
            <button type="button" onClick={() => setFile(null)} className="text-ink-3 hover:text-danger" aria-label={`Remove ${file}`}><X className="size-3.5" aria-hidden /></button>
          </span>
        </div>
      ) : null}
      <div className="flex items-end gap-1.5 rounded-[22px] border border-line bg-surface px-1.5 py-1.5 shadow-lg shadow-black/30 transition-colors focus-within:border-line-strong">
        <button type="button" onClick={() => setFile("Formal budget.pdf")} className="mb-0.5 rounded-full p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Attach files" title="Attach files">
          <Paperclip className="size-4" aria-hidden />
        </button>
        <textarea
          ref={ref}
          value={body}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => { setBody(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (suggestions.length) {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => (value + 1) % suggestions.length); return; }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value - 1 + suggestions.length) % suggestions.length); return; }
              if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); pick(suggestions[active].label); return; }
            }
            if (event.key === "Escape" && replyTo) { onCancelReply?.(); return; }
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
          }}
          className="max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
        <button type="button" onClick={send} disabled={!body.trim() && !file} aria-label="Send" title="Send" className={cx("grid size-9 shrink-0 place-items-center rounded-full transition-all duration-200", body.trim() || file ? "scale-100 bg-accent text-on-accent hover:bg-accent-hover" : "scale-90 bg-subtle text-ink-3")}>
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:shadow-xl max-xl:shadow-black/50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle" aria-label={`Close ${title.toLowerCase()}`}><X className="size-4" aria-hidden /></button>
      </header>
      {children}
    </aside>
  );
}

export function ChatDemo() {
  const [convos, setConvos] = useState(START);
  const [activeId, setActiveId] = useState("general");
  const [q, setQ] = useState("");
  const [side, setSide] = useState<{ kind: "pinned" } | { kind: "thread"; id: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState<{ convo: string; who: string } | null>(null);
  const timers = useRef<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convo = convos.find((c) => c.id === activeId)!;
  const threadParent = side?.kind === "thread" ? convo.messages.find((m) => m.id === side.id) ?? null : null;
  const pinned = convo.messages.filter((m) => m.pinned && !m.deleted);
  const typingHere = typing?.convo === activeId ? typing.who : null;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [convo.messages.length, typingHere, activeId]);

  function update(id: string, fn: (m: Message) => Message, inThread?: string) {
    setConvos((list) =>
      list.map((c) =>
        c.id !== activeId
          ? c
          : { ...c, messages: c.messages.map((m) => (inThread && m.id === inThread ? { ...m, thread: (m.thread ?? []).map((r) => (r.id === id ? fn(r) : r)) } : m.id === id ? fn(m) : m)) },
      ),
    );
  }

  function handlersFor(inThread?: string): Handlers {
    return {
      react: (id, key) => update(id, (m) => { const people = m.reactions[key] ?? []; return { ...m, reactions: { ...m.reactions, [key]: people.includes(ME) ? people.filter((p) => p !== ME) : [...people, ME] } }; }, inThread),
      reply: (m) => setReplyTo(m),
      thread: (id) => setSide({ kind: "thread", id }),
      pin: (id) => update(id, (m) => ({ ...m, pinned: !m.pinned })),
      remove: (id) => update(id, (m) => ({ ...m, deleted: true, body: "", reactions: {}, file: undefined }), inThread),
      edit: (id, body) => update(id, (m) => ({ ...m, body, edited: true }), inThread),
    };
  }

  function respond(convoId: string, who: string, answer: string, threadId?: string) {
    timers.current.push(window.setTimeout(() => setTyping({ convo: convoId, who }), 900));
    timers.current.push(
      window.setTimeout(() => {
        setTyping(null);
        const message: Message = { id: `r${Date.now()}`, from: who, body: answer, time: now(), reactions: {} };
        setConvos((list) => list.map((c) => (c.id !== convoId ? c : threadId ? { ...c, messages: c.messages.map((m) => (m.id === threadId ? { ...m, thread: [...(m.thread ?? []), message] } : m)) } : { ...c, messages: [...c.messages, message] })));
      }, 2600),
    );
  }

  function send(body: string, file: string | null, threadId?: string) {
    const message: Message = { id: `m${Date.now()}`, from: ME, body, time: now(), reactions: {}, file: file ?? undefined, reply: !threadId && replyTo ? { from: replyTo.from, body: replyTo.body } : undefined };
    setConvos((list) => list.map((c) => (c.id !== activeId ? c : threadId ? { ...c, messages: c.messages.map((m) => (m.id === threadId ? { ...m, thread: [...(m.thread ?? []), message] } : m)) } : { ...c, messages: [...c.messages, message] })));
    if (!threadId) setReplyTo(null);
    respond(activeId, threadId ? "Sam Patel" : convo.responder, threadId ? "Works for me." : convo.answer, threadId);
  }

  function open(id: string) {
    setActiveId(id);
    setSide(null);
    setReplyTo(null);
    setConvos((list) => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }

  function reset() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setConvos(START);
    setActiveId("general");
    setSide(null);
    setReplyTo(null);
    setTyping(null);
    setQ("");
  }

  const visible = useMemo(() => convos.filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase())), [convos, q]);
  const row = (c: Conversation) => {
    const last = c.messages.filter((m) => !m.deleted).at(-1);
    const isActive = c.id === activeId;
    const strong = c.unread > 0 && !isActive;
    return (
      <li key={c.id}>
        <button type="button" onClick={() => open(c.id)} aria-current={isActive ? "page" : undefined} className={cx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", isActive ? "bg-subtle" : "hover:bg-subtle/60")}>
          <ConvoIcon convo={c} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className={cx("min-w-0 flex-1 truncate text-sm", strong || isActive ? "font-semibold text-ink" : "font-medium text-ink-2")}>{c.title}</span>
              <span className={cx("shrink-0 text-[11px] tnum", strong ? "text-accent" : "text-ink-3")}>{last?.time ?? ""}</span>
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className={cx("min-w-0 flex-1 truncate text-[13px]", strong ? "text-ink-2" : "text-ink-3")}>{last ? `${last.from === ME ? "You: " : ""}${last.body || "Sent an attachment"}` : "No messages yet"}</span>
              {strong ? <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-on-accent tnum">{c.unread}</span> : null}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div>
      <TryIt>Hover a message to react, reply, pin, or start a thread. Type @ to mention someone. Send something and a member answers.</TryIt>
      <AppFrame path={`/chat/${convo.id}`} active="chat" onReset={reset} bodyClassName="relative p-0 sm:p-0">
        <div className="relative flex h-[560px] lg:absolute lg:inset-0 lg:h-auto">
          <div className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <p className="text-base font-semibold text-ink">Messages</p>
              <span className="grid size-8 place-items-center rounded-lg text-ink-2" aria-hidden title="New message"><SquarePen className="size-4" /></span>
            </div>
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
                <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="h-8 w-full rounded-lg border border-line bg-canvas pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/50" />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-3">
              {[["Direct and group", visible.filter((c) => c.kind === "direct")], ["Channels", visible.filter((c) => c.kind !== "direct")]].map(([label, items]) =>
                (items as Conversation[]).length ? (
                  <section key={label as string}>
                    <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">{label as string}</p>
                    <ul className="space-y-0.5">{(items as Conversation[]).map(row)}</ul>
                  </section>
                ) : null,
              )}
            </div>
          </div>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 sm:px-5">
              <ConvoIcon convo={convo} large />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{convo.title}</p>
                <p className="truncate text-xs text-ink-3">{typingHere ? <span className="text-accent">{first(typingHere)} is typing</span> : convo.subtitle}</p>
              </div>
              <button type="button" onClick={() => setSide(side?.kind === "pinned" ? null : { kind: "pinned" })} className={cx("rounded-md p-1.5 hover:bg-subtle hover:text-ink", side?.kind === "pinned" ? "bg-subtle text-ink" : "text-ink-3")} aria-label="Pinned messages">
                <Pin className="size-4" aria-hidden />
              </button>
              <span className="rounded-md p-1.5 text-ink-3" aria-hidden><Info className="size-4" /></span>
            </header>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-canvas px-3 pb-4 pt-2 sm:px-6">
              <List messages={convo.messages} handlers={handlersFor()} />
              {typingHere && !threadParent ? (
                <div className="mt-4 flex items-end gap-2">
                  <Avatar name={typingHere} size="md" />
                  <span className="flex items-center gap-1 rounded-[20px] rounded-bl-md bg-subtle px-4 py-3" aria-label={`${first(typingHere)} is typing`}>
                    {[0, 1, 2].map((dot) => <span key={dot} className="typing-dot size-1.5 rounded-full bg-ink-2" style={{ animationDelay: `${dot * 150}ms` }} />)}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 bg-canvas px-3 pb-3 sm:px-6">
              <Composer key={convo.id} placeholder={`Message ${convo.title}`} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={(body, file) => send(body, file)} />
            </div>
          </section>

          {side?.kind === "pinned" ? (
            <Panel title="Pinned" onClose={() => setSide(null)}>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {pinned.length === 0 ? <p className="text-sm text-ink-3">Moderators can pin important messages here.</p> : <List messages={pinned} handlers={handlersFor()} compact inThread />}
              </div>
            </Panel>
          ) : null}
          {threadParent ? (
            <Panel title="Thread" onClose={() => setSide(null)}>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <ol><Item m={threadParent} grouped={false} last handlers={handlersFor()} compact inThread /></ol>
                <p className="my-3 text-xs text-ink-3">{threadParent.thread?.length ?? 0} {(threadParent.thread?.length ?? 0) === 1 ? "reply" : "replies"}</p>
                <List messages={threadParent.thread ?? []} handlers={handlersFor(threadParent.id)} compact inThread />
                {typingHere ? <p className="mt-3 text-xs text-accent">{first(typingHere)} is typing</p> : null}
              </div>
              <div className="shrink-0 border-t border-line p-3">
                <Composer key={threadParent.id} placeholder="Reply in thread" onSend={(body, file) => send(body, file, threadParent.id)} />
              </div>
            </Panel>
          ) : null}
        </div>
      </AppFrame>
    </div>
  );
}
