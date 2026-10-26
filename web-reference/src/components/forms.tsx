"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button, Notice, buttonClass, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

const ExternalPending = createContext(false);

function isExternalUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function redirectPath(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const digest = String((error as { digest: unknown }).digest);
  if (!digest.startsWith("NEXT_REDIRECT")) return null;
  const path = digest.split(";")[2];
  return path || null;
}

export function ExternalActionForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<string>;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const tab = window.open("about:blank", "_blank");
        setPending(true);
        setFailure(null);
        void (async () => {
          try {
            const destination = await action(formData);
            if (isExternalUrl(destination)) {
              if (tab && !tab.closed) {
                tab.location.href = destination;
                try {
                  tab.opener = null;
                } catch {
                  // The new tab has already started navigating.
                }
              } else {
                window.location.assign(destination);
              }
              return;
            }
            tab?.close();
            router.push(destination);
          } catch (error) {
            tab?.close();
            const path = redirectPath(error);
            if (path) {
              router.push(path);
              return;
            }
            setFailure(error instanceof Error && error.message ? error.message : "Could not open the payment page.");
          } finally {
            setPending(false);
          }
        })();
      }}
    >
      <ExternalPending.Provider value={pending}>{children}</ExternalPending.Provider>
      {failure ? <p className="mt-2 text-[12px] text-danger" role="alert">{failure}</p> : null}
    </form>
  );
}

export function ExternalSubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  const pending = useContext(ExternalPending);
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const active = pending && (!name || !data?.has(name) || data.get(name) === value);
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} aria-busy={active} name={name} value={value}>
      {active ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {active && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) return <Notice tone="danger">{state.error}</Notice>;
  if (state.message) return <Notice tone="positive">{state.message}</Notice>;
  return null;
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      {children(state)}
    </form>
  );
}

export function ConfirmSubmit({
  children,
  message,
  variant = "danger",
  size = "sm",
}: {
  children: ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      suppressHydrationWarning
      type="submit"
      className={cx(buttonClass(variant, size))}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
