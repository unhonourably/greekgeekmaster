import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "../auth-forms";
import { AuthFooter, AuthHeading, authLink } from "../auth-ui";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/home";
  return (
    <>
      <AuthHeading title="Create your account" description="Officers register their chapter next. Members accept their invitation right after." />
      <SignUpForm next={next} />
      <AuthFooter>
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className={authLink}>Sign in</Link>
      </AuthFooter>
    </>
  );
}
