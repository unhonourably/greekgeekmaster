import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "../auth-forms";
import { AuthFooter, AuthHeading, authLink } from "../auth-ui";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Reset your password" description="Enter the email on your account and we'll send you a link to choose a new password." />
      <ForgotPasswordForm />
      <AuthFooter>
        Remembered it? <Link href="/login" className={authLink}>Back to sign in</Link>
      </AuthFooter>
    </>
  );
}
