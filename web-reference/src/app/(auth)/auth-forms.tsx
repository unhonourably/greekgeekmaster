"use client";

import Link from "next/link";
import { useActionState, useState, type ComponentProps } from "react";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Checkbox, Field, Input, cx } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionState } from "@/lib/action-state";
import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";
import { AuthStatus, authLink } from "./auth-ui";

const tall = "h-11! rounded-lg! px-3.5!";

function PasswordInput({ className, ...props }: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cx(tall, "pr-11!", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-ink-3 hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

function Sent({ title, message, children }: { title: string; message?: string; children?: React.ReactNode }) {
  return (
    <div className="fade-up">
      <AuthStatus icon={MailCheck} title={title}>
        <p>{message}</p>
        <p className="mt-2 text-[13px] text-ink-3">It can take a minute to arrive. Check spam if you don&apos;t see it.</p>
      </AuthStatus>
      {children}
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, {} as ActionState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@school.edu" required defaultValue={state.values?.email} aria-invalid={Boolean(state.fieldErrors?.email)} className={tall} />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="block text-[13px] font-medium text-ink">Password</label>
          <Link href="/forgot-password" className="text-[13px] text-ink-3 hover:text-ink">Forgot password?</Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" required aria-invalid={Boolean(state.fieldErrors?.password)} />
        {state.fieldErrors?.password ? <p className="text-[13px] text-danger">{state.fieldErrors.password}</p> : null}
      </div>
      <SubmitButton className="h-11! w-full rounded-lg! text-[15px]!" pendingLabel="Signing in">Sign in</SubmitButton>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUp, {} as ActionState);
  if (state.ok) {
    return (
      <Sent title="Check your email" message={state.message}>
        <p className="mt-8 text-center text-sm text-ink-3">
          Wrong address? <a href={`/signup?next=${encodeURIComponent(next)}`} className={authLink}>Start over</a>
        </p>
      </Sent>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Field label="Full name" htmlFor="fullName" error={state.fieldErrors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" placeholder="Jordan Smith" required defaultValue={state.values?.fullName} aria-invalid={Boolean(state.fieldErrors?.fullName)} className={tall} />
      </Field>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email} hint="Officers: use your school email to verify your chapter faster.">
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@school.edu" required defaultValue={state.values?.email} aria-invalid={Boolean(state.fieldErrors?.email)} className={tall} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password} hint="10 or more characters, with a letter and a number.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required aria-invalid={Boolean(state.fieldErrors?.password)} />
      </Field>
      <div className="rounded-lg border border-line bg-surface/60 px-3.5 py-3">
        <Checkbox
          name="terms"
          className="text-[13px] leading-5"
          label={
            <span className="text-ink-2">
              I agree to the <Link href="/legal/terms" className={authLink} target="_blank">Terms</Link> and{" "}
              <Link href="/legal/privacy" className={authLink} target="_blank">Privacy Policy</Link>.
            </span>
          }
        />
        {state.fieldErrors?.terms ? <p className="mt-1.5 pl-7 text-[13px] text-danger">{state.fieldErrors.terms}</p> : null}
      </div>
      <SubmitButton className="h-11! w-full rounded-lg! text-[15px]!" pendingLabel="Creating account">Create account</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {} as ActionState);
  if (state.ok) {
    return (
      <Sent title="Check your email" message={state.message}>
        <p className="mt-8 text-center text-sm text-ink-3">
          <Link href="/login" className={authLink}>Back to sign in</Link>
        </p>
      </Sent>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@school.edu" required defaultValue={state.values?.email} aria-invalid={Boolean(state.fieldErrors?.email)} className={tall} />
      </Field>
      <SubmitButton className="h-11! w-full rounded-lg! text-[15px]!" pendingLabel="Sending">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, {} as ActionState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" error={state.fieldErrors?.password} hint="10 or more characters, with a letter and a number.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required aria-invalid={Boolean(state.fieldErrors?.password)} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required aria-invalid={Boolean(state.fieldErrors?.confirm)} />
      </Field>
      <SubmitButton className="h-11! w-full rounded-lg! text-[15px]!" pendingLabel="Saving">Save password</SubmitButton>
    </form>
  );
}
