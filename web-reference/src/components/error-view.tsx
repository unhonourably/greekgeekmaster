"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";

export function ErrorView({ error, retry, homeHref = "/home" }: { error: unknown; retry: () => void; homeHref?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center" role="alert">
      <span className="grid size-10 place-items-center rounded-full bg-danger/10 text-danger">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">This page could not load</h2>
      <p className="mt-1 text-sm text-ink-2">Something went wrong while loading this page. Try again, or go back to the previous page.</p>
      {digest ? <p className="mt-2 font-mono text-[11px] text-ink-3">Reference {digest}</p> : null}
      <div className="mt-6 flex gap-2">
        <Button type="button" variant="secondary" onClick={() => window.history.back()}>Go back</Button>
        <Button type="button" onClick={() => retry()}>Try again</Button>
        <Link href={homeHref} className={buttonClass("ghost", "md")}>Home</Link>
      </div>
    </div>
  );
}
