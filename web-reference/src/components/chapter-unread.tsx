"use client";

import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export const CHAT_READ_EVENT = "greekgeek:chat-read";

const UnreadContext = createContext<number | null>(null);

export function useChapterUnread(): number | null {
  return use(UnreadContext);
}

export function ChapterUnreadProvider({
  initial,
  chapterId,
  chatBase,
  meId,
  supabaseUrl,
  supabaseKey,
  children,
}: {
  initial: number;
  chapterId: string;
  chatBase: string;
  meId: string;
  supabaseUrl: string;
  supabaseKey: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [source, setSource] = useState(initial);
  const [count, setCount] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setCount(initial);
  }
  const pathRef = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { data, error } = await createBrowserSupabase(supabaseUrl, supabaseKey).rpc("chapter_unread_total", { p_chapter: chapterId });
      if (!error) setCount(Number(data ?? 0));
    }, 250);
  }, [supabaseUrl, supabaseKey, chapterId]);

  useEffect(() => {
    pathRef.current = pathname;
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const supabase = createBrowserSupabase(supabaseUrl, supabaseKey);
    const channel = supabase
      .channel(`chapter-unread:${chapterId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chapter_id=eq.${chapterId}` }, (payload) => {
        const row = payload.new as { conversation_id: string; sender_id: string };
        if (row.sender_id === meId) return;
        if (document.visibilityState === "visible" && pathRef.current.startsWith(`${chatBase}/${row.conversation_id}`)) return;
        refresh();
      })
      .subscribe();
    const onRead = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(CHAT_READ_EVENT, onRead);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(CHAT_READ_EVENT, onRead);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseKey, chapterId, chatBase, meId, refresh]);

  return <UnreadContext value={count}>{children}</UnreadContext>;
}
