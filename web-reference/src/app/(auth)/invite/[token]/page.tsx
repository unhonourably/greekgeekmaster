import type { Metadata } from "next";
import { ButtonLink, Notice } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitationHash } from "@/lib/invitations";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/env";
import { requestTime } from "@/lib/format";
import { SubmitButton } from "@/components/forms";
import { signOut } from "../../actions";
import { acceptInvitation } from "./actions";
import { AcceptForm, type RecruiterOption } from "./accept-form";
import { createClient } from "@/lib/supabase/server";
import { MailX } from "lucide-react";
import { AuthHeading, AuthStatus } from "../../auth-ui";

const BIG = "h-11! w-full rounded-lg! text-[15px]!";

export const metadata: Metadata = { title: "Chapter invitation", robots: { index: false } };

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  if (!isSupabaseConfigured() || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return <Invalid />;
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("chapter_invitations")
    .select("email, full_name, member_class, status, expires_at, chapter:chapters(organization_name, designation, status, university:universities(name))")
    .eq("token_hash", invitationHash(token))
    .maybeSingle();
  if (!inv) return <Invalid />;
  const chapter = inv.chapter as unknown as { organization_name: string; designation: string | null; status: string; university: { name: string } | null } | null;
  const chapterName = [chapter?.organization_name, chapter?.designation].filter(Boolean).join(", ");
  const expired = inv.status === "expired" || (inv.status === "pending" && new Date(inv.expires_at as string).getTime() < requestTime());
  const user = await getSessionUser();
  const next = `/invite/${token}`;
  const emailMatches = user ? user.email.toLowerCase() === (inv.email as string).toLowerCase() : false;

  return (
    <>
      <AuthHeading
        eyebrow="You're invited to join"
        title={chapterName || "a chapter"}
        description={
          <>
            {chapter?.university ? <span className="block text-ink">{chapter.university.name}</span> : null}
            As {MEMBER_CLASS_LABEL[inv.member_class as MemberClass].toLowerCase() === "active" ? "an active member" : `a ${MEMBER_CLASS_LABEL[inv.member_class as MemberClass].toLowerCase()}`}. Sent to {user && emailMatches ? (inv.email as string) : maskEmail(inv.email as string)}.
          </>
        }
      />
      <div className="space-y-4">
        {inv.status === "accepted" ? (
          <>
            <Notice tone="info">This invitation has already been accepted.</Notice>
            <ButtonLink href="/home" className={BIG}>Go to your chapters</ButtonLink>
          </>
        ) : inv.status === "revoked" ? (
          <Notice tone="warning">This invitation was withdrawn. Ask a chapter officer for a new one.</Notice>
        ) : expired ? (
          <Notice tone="warning">This invitation has expired. Ask a chapter officer to send a new one.</Notice>
        ) : !user ? (
          <>
            <p className="text-sm text-ink-2">Create an account or sign in with the email address the invitation was sent to.</p>
            <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} className={BIG}>Create an account</ButtonLink>
            <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="secondary" className={BIG}>Sign in</ButtonLink>
          </>
        ) : !emailMatches ? (
          <>
            <Notice tone="warning" title="Different account">
              You are signed in as {user.email}. This invitation was sent to another address. Sign out and sign in with the invited email.
            </Notice>
            <form action={signOut}>
              <input type="hidden" name="next" value={next} />
              <SubmitButton variant="secondary" className={BIG}>Sign out and switch accounts</SubmitButton>
            </form>
          </>
        ) : (
          <AcceptForm action={acceptInvitation.bind(null, token)} recruiters={await recruiterOptions(token)} />
        )}
      </div>
    </>
  );
}

async function recruiterOptions(token: string): Promise<RecruiterOption[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invitation_recruiter_options", { p_token_hash: invitationHash(token) });
  if (error) return null;
  return ((data ?? []) as Array<{ membership_id: string; name: string; recruitment_role: boolean }>).map((r) => ({ id: r.membership_id, name: r.name, chair: r.recruitment_role }));
}

function Invalid() {
  return (
    <AuthStatus icon={MailX} tone="danger" title="Invitation not found">
      The link may be incomplete. Open it again from your email, or ask a chapter officer to resend it.
    </AuthStatus>
  );
}