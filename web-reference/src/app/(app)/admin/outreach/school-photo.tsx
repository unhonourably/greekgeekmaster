"use client";

import { useEffect, useState } from "react";

function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 2 && !/^(of|the|at|and|for)$/i.test(word));
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

export function SchoolPhoto({
  id,
  name,
  initialUrl,
  load,
  className,
}: {
  id: string;
  name: string;
  initialUrl: string | null;
  load: (id: string) => Promise<string | null>;
  className?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    let gone = false;
    void load(id).then((next) => {
      if (!gone && next) setUrl(next);
    }).catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [id, load, url]);
  if (!url || failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-subtle text-2xl font-semibold tracking-tight text-ink-3 ${className ?? ""}`}>
        {initials(name)}
      </div>
    );
  }
  return <img src={url} alt="" className={`h-full w-full object-cover ${className ?? ""}`} onError={() => setFailed(true)} />;
}
