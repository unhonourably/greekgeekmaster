"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MousePointerClick } from "lucide-react";
import { scrollToSection } from "@/components/feature-demos/shared";
import { cx } from "@/components/ui";

function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return false;
  event.preventDefault();
  scrollToSection(id);
  return true;
}

export function JumpLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a href={`#${to}`} onClick={(event) => jump(event, to)} className={className}>
      {children}
    </a>
  );
}

export function SectionNav({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const listRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    const nodes = sections.map((section) => document.getElementById(section.id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (list && link) list.scrollTo({ left: link.offsetLeft - list.clientWidth / 2 + link.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  function go(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (!jump(event, id)) return;
    setActive(id);
    lockRef.current = true;
    let timer = 0;
    const release = () => {
      lockRef.current = false;
      window.clearTimeout(timer);
      window.removeEventListener("scrollend", release);
    };
    window.addEventListener("scrollend", release, { once: true });
    timer = window.setTimeout(release, 1500);
  }

  return (
    <div data-section-nav className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6">
        <span className="hidden shrink-0 items-center gap-1.5 border-r border-line py-2 pr-3 text-[12px] text-ink-3 md:inline-flex">
          <MousePointerClick className="size-3.5 text-accent" aria-hidden />
          All demos are interactive
        </span>
        <div ref={listRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              data-id={section.id}
              onClick={(event) => go(event, section.id)}
              aria-current={active === section.id ? "true" : undefined}
              className={cx("shrink-0 rounded-md px-3 py-1.5 text-[13px] transition-colors", active === section.id ? "bg-subtle font-medium text-ink" : "text-ink-3 hover:text-ink")}
            >
              {section.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
