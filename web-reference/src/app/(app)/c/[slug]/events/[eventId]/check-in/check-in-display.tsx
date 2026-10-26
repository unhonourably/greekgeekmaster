"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Notice } from "@/components/ui";

type Issue = () => Promise<{ url: string; refreshMs: number } | { error: string }>;

export function CheckInDisplay({ issue }: { issue: Issue }) {
  const router = useRouter();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const issueRef = useRef(issue);

  useEffect(() => {
    issueRef.current = issue;
  }, [issue]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const tick = async () => {
      try {
        const res = await issueRef.current();
        if (!alive) return;
        if ("error" in res) {
          setError(res.error);
          return;
        }
        const markup = await QRCode.toString(res.url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });
        if (!alive) return;
        setSvg(markup);
        setError(null);
        router.refresh();
        timer = setTimeout(tick, res.refreshMs);
      } catch {
        if (!alive) return;
        setError("Lost connection. Retrying.");
        timer = setTimeout(tick, 5_000);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-4">
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {svg ? (
        <div className="aspect-square w-full max-w-sm rounded-lg border border-line bg-white p-4 [&>svg]:size-full" aria-label="Check-in QR code" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="aspect-square w-full max-w-sm animate-pulse rounded-lg border border-line bg-subtle" aria-label="Loading check-in code" />
      )}
      <p className="text-center text-[13px] text-ink-3">The code changes every 30 seconds, so screenshots stop working quickly.</p>
    </div>
  );
}
