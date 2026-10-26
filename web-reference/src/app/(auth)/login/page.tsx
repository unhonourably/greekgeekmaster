import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { SignInForm } from "../auth-forms";
import { AuthFooter, AuthHeading, authLink } from "../auth-ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") && sp.next !== "/login" ? sp.next : "/home";
  if (await getSessionUser()) redirect(next);
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to your chapter." />
      {error ? <Notice tone="danger" className="mb-5">That link is invalid or has expired. Sign in, or request a new link.</Notice> : null}
      {sp.deleted === "1" ? <Notice tone="positive" className="mb-5">Your account and personal data have been deleted.</Notice> : null}
      <SignInForm next={next} />
      <AuthFooter>
        New to GreekGeek? <Link href={`/signup?next=${encodeURIComponent(next)}`} className={authLink}>Create an account</Link>
      </AuthFooter>
    </>
  );
}
