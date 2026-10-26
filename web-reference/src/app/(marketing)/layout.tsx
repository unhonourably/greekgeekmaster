import { Suspense } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { SocialIcon } from "@/components/social-icon";
import { Avatar, personName } from "@/components/people";
import { ButtonLink } from "@/components/ui";
import { brand } from "@/config/brand";
import { getMyProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

function SignInLink() {
  return (
    <Link href="/login" className="rounded-md px-3 py-2 text-ink-2 hover:text-ink">
      Sign in
    </Link>
  );
}

async function AccountLink() {
  const profile = isSupabaseConfigured() ? await getMyProfile() : null;
  if (!profile) return <SignInLink />;
  const name = personName(profile);
  return (
    <Link href="/home" aria-label={name} className="ml-1 inline-flex rounded-full outline-offset-2 hover:opacity-80">
      <Avatar name={name} path={profile.avatar_path} size="sm" />
    </Link>
  );
}

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Wordmark />
          <nav className="flex flex-wrap items-center justify-end gap-1 text-sm">
            <Link href="/features" className="rounded-md px-3 py-2 text-ink-2 hover:text-ink">
              Features
            </Link>
            <Link href="/contact" className="rounded-md px-3 py-2 text-ink-2 hover:text-ink">
              Contact
            </Link>
            <Link href="/pricing" className="rounded-md px-3 py-2 text-ink-2 hover:text-ink">
              Pricing
            </Link>
            <Suspense fallback={<SignInLink />}>
              <AccountLink />
            </Suspense>
            <ButtonLink href="/signup" size="sm" className="ml-2">
              Register a chapter
            </ButtonLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-ink-3">
          <p>
            {brand.legalName}. Payments are processed by Stripe. {brand.name} never stores card or bank numbers.
          </p>
          <nav className="flex gap-4">
            <Link href="/features" className="hover:text-ink">Features</Link>
            <Link href="/contact" className="hover:text-ink">Contact</Link>
            <Link href="/pricing" className="hover:text-ink">Pricing</Link>
            <Link href="/legal/chapter-agreement" className="hover:text-ink">GreekGeek agreement</Link>
            <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
          <nav aria-label="Social" className="flex gap-4">
            {brand.socials.map((social) => (
              <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                <SocialIcon name={social.name} />
                {social.name}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
