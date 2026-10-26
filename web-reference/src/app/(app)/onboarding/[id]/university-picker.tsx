"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { cx } from "@/components/ui";

type Result = { id: string; name: string; city: string | null; state: string | null; domains: string[] };

const cache = new Map<string, Result[]>();

export function UniversityPicker({ applicationId, allowOther, initialQuery }: { applicationId: string; allowOther: boolean; initialQuery: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [fetched, setFetched] = useState<{ key: string; results: Result[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const controller = useRef<AbortController | null>(null);

  const key = query.trim().toLowerCase();
  const cached = key.length >= 2 ? cache.get(key) : undefined;
  const results = cached ?? (fetched?.key === key ? fetched.results : []);
  const searchedFor = cached ? key : (fetched?.key ?? "");

  useEffect(() => {
    if (key.length < 2 || cache.has(key)) return;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      setLoading(true);
      try {
        const res = await fetch(`/api/universities?q=${encodeURIComponent(key)}`, { signal: ac.signal });
        const body = res.ok ? ((await res.json()) as { results: Result[] }) : { results: [] };
        cache.set(key, body.results);
        setFetched({ key, results: body.results });
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setFetched({ key, results: [] });
      } finally {
        if (controller.current === ac) setLoading(false);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [key]);

  const choose = (id: string) => {
    setChoosing(id);
    startTransition(() => router.replace(`/onboarding/${applicationId}?step=2&uni=${id}`, { scroll: false }));
  };

  const open = key.length >= 2;
  const shown = open ? results : [];

  return (
    <div className="mt-2 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
          aria-label="Search universities"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Search by name, nickname, or school email domain"
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setActive(0);
            const nextKey = next.trim().toLowerCase();
            setLoading(nextKey.length >= 2 && !cache.has(nextKey));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && shown[active]) {
              e.preventDefault();
              choose(shown[active].id);
            }
          }}
          className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-9 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <Loader2
          className={cx("absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-3 transition-opacity duration-150", loading || pending ? "opacity-100" : "opacity-0")}
          aria-hidden
        />
      </div>
      <div className={cx("grid transition-[grid-template-rows,opacity] duration-200 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <ul id={listId} role="listbox" className={cx("divide-y divide-line rounded-md border border-line transition-opacity duration-150", loading && "opacity-60")}>
            {shown.map((u, i) => (
              <li
                key={u.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(u.id)}
                className={cx("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm transition-colors duration-100", i === active ? "bg-canvas" : "bg-surface")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-ink">{u.name}</span>
                  {u.domains.length ? <span className="block truncate text-[12px] text-ink-3">{u.domains.map((d) => `@${d}`).join(", ")}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[12px] text-ink-3">
                  {[u.city, u.state].filter(Boolean).join(", ")}
                  {choosing === u.id && pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                </span>
              </li>
            ))}
            {open && shown.length === 0 && searchedFor === key && !loading ? <li className="bg-surface px-3 py-2 text-sm text-ink-3">No universities match.</li> : null}
            {open && shown.length === 0 && searchedFor !== key ? <li className="bg-surface px-3 py-2 text-sm text-ink-3">Searching</li> : null}
          </ul>
        </div>
      </div>
      {allowOther ? (
        <button type="button" onClick={() => choose("other")} className="text-[13px] text-accent hover:underline">
          My university is not listed
        </button>
      ) : null}
    </div>
  );
}
