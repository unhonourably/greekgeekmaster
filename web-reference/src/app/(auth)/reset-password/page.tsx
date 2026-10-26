import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "../auth-forms";
import { AuthHeading } from "../auth-ui";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await requireUser("/reset-password");
  return (
    <>
      <AuthHeading title="Choose a new password" description={<>For <span className="text-ink">{user.email}</span>. You&apos;ll stay signed in after saving.</>} />
      <ResetPasswordForm />
    </>
  );
}
