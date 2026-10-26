import type { Metadata } from "next";
import { Avatar, personName } from "@/components/people";
import { Card, CardBody, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { changeEmail, changePassword, deleteAccount, removeAvatar, saveNotificationPreferences, saveProfile, uploadAvatar } from "./actions";
import { AvatarForm, DeleteAccountForm, EmailForm, NotificationForm, PasswordForm, ProfileForm, type ProfileInitial } from "./account-forms";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [{ data: profile }, { data: details }, { data: kinds }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("display_name, full_name, avatar_path, graduation_year, created_at").eq("id", user.id).single(),
    supabase.from("profile_details").select("pronouns, major, hometown, bio, interests, social_links, phone, visibility").eq("user_id", user.id).maybeSingle(),
    supabase.from("notification_kinds").select("kind, label, description, default_in_app, default_email, required").order("label"),
    supabase.from("notification_preferences").select("kind, in_app, email").eq("user_id", user.id),
  ]);
  const prefByKind = new Map((prefs ?? []).map((p) => [p.kind as string, p]));
  const initial: ProfileInitial = {
    display_name: (profile?.display_name as string) ?? "",
    full_name: (profile?.full_name as string) ?? "",
    graduation_year: (profile?.graduation_year as number | null) ?? null,
    pronouns: details?.pronouns ?? null,
    major: details?.major ?? null,
    hometown: details?.hometown ?? null,
    bio: details?.bio ?? null,
    interests: (details?.interests as string[]) ?? [],
    social_links: (details?.social_links as Record<string, string>) ?? {},
    phone: details?.phone ?? null,
    visibility: (details?.visibility as Record<string, string>) ?? {},
  };
  const name = personName(profile ?? {});
  const { data: challenges } = await createAdminClient()
    .from("account_challenges")
    .select("purpose, email, new_email, expires_at")
    .eq("user_id", user.id)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const open = (challenges ?? []) as Array<{ purpose: string; new_email: string | null }>;
  const emailChallenge = open.find((row) => row.purpose === "email_current" || row.purpose === "email_new");
  const emailStep = emailChallenge?.purpose === "email_new" ? "next" : emailChallenge?.purpose === "email_current" ? "current" : "start";
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader title="Account settings" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" description="Your profile is shared with the chapters you belong to." />
            <CardBody>
              <ProfileForm action={saveProfile} initial={initial} />
            </CardBody>
          </Card>
          <Card id="notifications" className="scroll-mt-20">
            <CardHeader title="Notifications" description="In app covers the bell and banners on your phone. Chat alerts show who wrote, not the message. Payment receipts and verification updates stay on." />
            <CardBody>
              <NotificationForm
                action={saveNotificationPreferences}
                kinds={(kinds ?? []).map((k) => {
                  const p = prefByKind.get(k.kind as string);
                  return {
                    kind: k.kind as string,
                    label: k.label as string,
                    description: k.description as string,
                    required: Boolean(k.required),
                    in_app: p ? Boolean(p.in_app) : Boolean(k.default_in_app),
                    email: p ? Boolean(p.email) || (Boolean(k.required) && Boolean(k.default_email)) : Boolean(k.default_email),
                  };
                })}
              />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Photo" />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={name} path={profile?.avatar_path as string | null} size="lg" />
                {profile?.avatar_path ? (
                  <form action={removeAvatar}>
                    <ConfirmSubmit message="Remove your photo?" variant="ghost">Remove</ConfirmSubmit>
                  </form>
                ) : null}
              </div>
              <AvatarForm action={uploadAvatar} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sign-in" />
            <CardBody className="space-y-5">
              {sp.password === "changed" ? <Notice tone="positive">Password changed.</Notice> : null}
              <EmailForm action={changeEmail} email={user.email} step={emailStep} pendingEmail={emailChallenge?.new_email ?? null} />
              <PasswordForm action={changePassword} codeSent={open.some((row) => row.purpose === "password_change")} />
            </CardBody>
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Your data" description="Download a copy of your personal information, or delete your account." />
          <CardBody className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm text-ink-2">The file includes your profile, memberships, messages, and chapter applications. Financial records stay with your chapter and are not a full ledger export.</p>
              <a href="/api/account/export" className={buttonClass("secondary")}>Download my data</a>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-ink-2">
                Deletion removes your profile, photo, messages, and verification documents, and signs you out. Chapter payment records and an anonymized membership history are kept, because the chapter and tax rules require them. If you are the only administrator of a chapter, transfer that role first.
              </p>
              <DeleteAccountForm action={deleteAccount} email={user.email} />
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
