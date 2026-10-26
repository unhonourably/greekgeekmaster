import type { Metadata } from "next";
import { SocialIcon } from "@/components/social-icon";
import { brand } from "@/config/brand";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact" };

const people = [
  {
    name: "Amare",
    emails: [
      { label: "GreekGeek", address: "amare@greekgeek.org" },
      { label: "Student", address: "ac5vh@umsystem.edu" },
    ],
  },
  {
    name: "Owen",
    emails: [
      { label: "GreekGeek", address: "owen@greekgeek.org" },
      { label: "Student", address: "ochng@umsystem.edu" },
    ],
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Contact</h1>
          <p className="mt-5 max-w-md text-lg text-ink-2">
            GreekGeek is a student project. Amare and Owen are students at the University of Missouri, and we read every note.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {people.map((person) => (
              <li key={person.name} className="rounded-lg border border-line bg-surface px-5 py-4">
                <p className="font-medium text-ink">{person.name}</p>
                <dl className="mt-3 space-y-2">
                  {person.emails.map((email) => (
                    <div key={email.address} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <dt className="text-[13px] text-ink-3">{email.label}</dt>
                      <dd>
                        <a href={`mailto:${email.address}`} className="text-sm text-ink underline-offset-4 hover:underline">
                          {email.address}
                        </a>
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <nav aria-label="Social" className="mt-6 flex flex-wrap gap-2">
            {brand.socials.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2 hover:border-line-strong hover:text-ink"
              >
                <SocialIcon name={social.name} className="size-4" />
                {social.name}
              </a>
            ))}
          </nav>
        </div>
        <section className="rounded-lg border border-line bg-surface p-6 sm:p-8">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Send a note</h2>
          <p className="mt-2 text-sm text-ink-2">It goes to the inboxes you pick. We reply from those addresses.</p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>
      </div>
    </div>
  );
}
