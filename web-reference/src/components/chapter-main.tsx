"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { ButtonLink, Notice } from "@/components/ui";

function setupPreview(pathname: string, base: string): boolean {
  if (!pathname.startsWith(`${base}/`)) return false;
  const rest = pathname.slice(base.length);
  if (rest === "/setup" || rest.startsWith("/setup/")) return false;
  if (rest === "/settings/billing" || rest.startsWith("/settings/billing/")) return false;
  if (rest === "/settings" || rest.startsWith("/settings/")) return true;
  if (rest === "/events/new" || /\/events\/[^/]+\/edit$/.test(rest)) return true;
  if (rest.startsWith("/housing/rooms") || rest.startsWith("/housing/manage")) return true;
  if (rest.startsWith("/standards") || rest.startsWith("/recruitment") || rest.startsWith("/philanthropy") || rest.startsWith("/academics")) return true;
  return false;
}

export function ChapterMain({ base, setupLocked, children }: { base: string; setupLocked: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const chat = `${base}/chat`;
  const preview = setupLocked && setupPreview(pathname, base);
  const body = preview ? (
    <>
      <Notice tone="info" title="Preview" className="mb-6" action={<ButtonLink href={`${base}/settings/billing`} size="sm">Activate subscription</ButtonLink>}>
        Start the chapter subscription before changing this. You can look around, but nothing here can be saved yet.
      </Notice>
      <div inert className="opacity-80">
        {children}
      </div>
    </>
  ) : (
    children
  );
  if (pathname === chat || pathname.startsWith(`${chat}/`)) {
    return <main className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</main>;
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <BackButton base={base} />
      {body}
    </main>
  );
}
