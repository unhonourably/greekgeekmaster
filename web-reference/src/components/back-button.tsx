"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const history = { moved: false };

export function BackButton({ base, hideUnder = [] }: { base: string; hideUnder?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) history.moved = true;
  }, [pathname]);
  if (pathname === base || hideUnder.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const parent = pathname.slice(0, pathname.lastIndexOf("/")) || base;
  return (
    <button
      type="button"
      onClick={() => (history.moved && window.history.length > 1 ? router.back() : router.push(parent.length >= base.length ? parent : base))}
      className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-subtle hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back
    </button>
  );
}
