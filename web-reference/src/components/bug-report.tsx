"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Bug, CheckCircle2, X } from "lucide-react";
import { reportBug } from "@/app/(app)/bug-report";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Field, Notice, Textarea, cx } from "@/components/ui";

const MIN = 10;
const MAX = 3000;
const EXIT_MS = 200;
const STAGGER = (index: number) => ({ animationDelay: `${80 + index * 45}ms` });

const IMPACTS = [
  ["blocked", "It stops me"],
  ["annoying", "I can work around it"],
  ["minor", "Small or cosmetic"],
] as const;

function BugDialog({ page, viewport, onClose }: { page: string; viewport: string; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [impact, setImpact] = useState("");
  const titleId = useId();
  const messageId = useId();
  const expectedId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const leaving = useRef(false);
  const [shown, setShown] = useState(false);
  const length = message.trim().length;

  useEffect(() => {
    const show = () => setShown(true);
    const frame = requestAnimationFrame(() => requestAnimationFrame(show));
    const fallback = window.setTimeout(show, 60);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setShown(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(onClose, reduced ? 0 : EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    area.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [dismiss, attempt]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={dismiss}>
      <div
        aria-hidden
        className={cx(
          "absolute inset-0 bg-black/60 transition-[opacity,backdrop-filter] ease-out",
          shown ? "opacity-100 backdrop-blur-sm duration-300" : "opacity-0 backdrop-blur-none duration-200",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg origin-bottom flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/60 transition-[opacity,transform] will-change-transform",
          shown ? "translate-y-0 scale-100 opacity-100 duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]" : "translate-y-4 scale-[0.96] opacity-0 duration-200 ease-[cubic-bezier(0.4,0,1,1)]",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-accent"><Bug className="size-4" aria-hidden /></span>
            <div>
              <h2 id={titleId} className="text-base font-semibold text-ink">Report a bug</h2>
              <p className="text-[13px] text-ink-3">It goes straight to the GreekGeek team.</p>
            </div>
          </div>
          <button type="button" onClick={dismiss} className="group rounded-md p-1.5 text-ink-3 transition-colors duration-150 hover:bg-subtle hover:text-ink" aria-label="Close">
            <X className="size-4 transition-transform duration-200 ease-out group-hover:rotate-90" aria-hidden />
          </button>
        </div>

        <ActionForm key={attempt} action={reportBug} className="flex min-h-0 flex-1 flex-col">
          {(state) =>
            state.ok ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="check-pop flex size-14 items-center justify-center rounded-full bg-positive-soft"><CheckCircle2 className="size-8 text-positive" aria-hidden /></span>
                <p className="step-in mt-4 font-medium text-ink" style={{ animationDelay: "120ms" }}>Thanks, we got it.</p>
                <p className="step-in mt-1 max-w-sm text-sm text-ink-2" style={{ animationDelay: "180ms" }}>{state.message}</p>
                <div className="step-in mt-6 flex gap-2" style={{ animationDelay: "240ms" }}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setMessage(""); setImpact(""); setAttempt((value) => value + 1); }}>Report another</Button>
                  <Button type="button" size="sm" onClick={dismiss}>Done</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  <input type="hidden" name="page" value={page} />
                  <input type="hidden" name="viewport" value={viewport} />
                  <input type="hidden" name="impact" value={impact} />
                  {state.error ? <div className="fade-up"><Notice tone="danger">{state.error}</Notice></div> : null}
                  <Field
                    label="What went wrong?"
                    htmlFor={messageId}
                    error={state.fieldErrors?.message}
                    className="step-in [animation-delay:80ms]"
                    hint={
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-subtle" aria-hidden>
                          <span className={cx("block h-full rounded-full transition-[width,background-color] duration-300 ease-out", length >= MIN ? "bg-positive" : "bg-accent")} style={{ width: `${Math.min(100, (length / MIN) * 100)}%` }} />
                        </span>
                        <span className={cx("transition-colors duration-300", length >= MIN ? "text-positive" : undefined)}>
                          {length < MIN ? `${MIN - length} more character${MIN - length === 1 ? "" : "s"} needed` : `${length.toLocaleString("en-US")} / ${MAX.toLocaleString("en-US")}`}
                        </span>
                      </span>
                    }
                  >
                    <Textarea
                      ref={area}
                      id={messageId}
                      name="message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={MAX}
                      className="min-h-32"
                      placeholder="What you clicked and what happened. Error messages help a lot."
                      aria-invalid={state.fieldErrors?.message ? true : undefined}
                    />
                  </Field>
                  <Field label="What did you expect to happen?" htmlFor={expectedId} hint="Optional" error={state.fieldErrors?.expected} className="step-in [animation-delay:125ms]">
                    <Textarea id={expectedId} name="expected" maxLength={900} className="min-h-16" placeholder="The payment should have shown as paid." />
                  </Field>
                  <fieldset className="step-in" style={STAGGER(2)}>
                    <legend className="text-[13px] font-medium text-ink">How much does it get in your way? <span className="font-normal text-ink-3">Optional</span></legend>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {IMPACTS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={impact === value}
                          onClick={() => setImpact(impact === value ? "" : value)}
                          className={cx(
                            "rounded-md border px-3 py-1.5 text-[13px] transition-[color,background-color,border-color,transform] duration-200 ease-out active:scale-95",
                            impact === value ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <p className="step-in rounded-md border border-line bg-canvas px-3 py-2 text-[12px] text-ink-3" style={STAGGER(3)}>
                    We also send the page you&apos;re on (<span className="font-mono text-ink-2">{page}</span>), your browser, and your screen size, so you don&apos;t have to.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                  <Button type="button" variant="ghost" size="sm" onClick={dismiss}>Cancel</Button>
                  <SubmitButton size="sm" pendingLabel="Sending" disabled={length < MIN}>Send report</SubmitButton>
                </div>
              </>
            )
          }
        </ActionForm>
      </div>
    </div>,
    document.body,
  );
}

export function BugReport() {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState("");
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => { setViewport(`${window.innerWidth}x${window.innerHeight}`); setOpen(true); }}
        aria-haspopup="dialog"
        className="group flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-ink-2 transition-colors duration-150 hover:bg-subtle/70 hover:text-ink"
      >
        <Bug className="size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-rotate-12 group-hover:scale-110" aria-hidden />
        Report a bug
      </button>
      {open ? <BugDialog page={pathname.slice(0, 300)} viewport={viewport} onClose={close} /> : null}
    </>
  );
}
