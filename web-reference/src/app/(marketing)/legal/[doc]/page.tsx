import { notFound } from "next/navigation";
import { Notice } from "@/components/ui";
import { getPublishedTerms } from "@/lib/pricing";

const DOCS = {
  "chapter-agreement": { kind: "chapter_agreement", title: "GreekGeek Services and Pricing Agreement" },
  terms: { kind: "terms_of_service", title: "Terms of Service" },
  privacy: { kind: "privacy_policy", title: "Privacy Policy" },
} as const;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const entry = DOCS[doc as keyof typeof DOCS];
  return { title: entry?.title ?? "Legal" };
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const entry = DOCS[doc as keyof typeof DOCS];
  if (!entry) notFound();
  const terms = await getPublishedTerms(entry.kind);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{terms?.title ?? entry.title}</h1>
      {terms ? (
        <>
          <p className="mt-2 text-[13px] text-ink-3">Version {terms.version}</p>
          <p className="mt-6 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-2">{terms.summary}</p>
          <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-ink">
            {terms.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="whitespace-pre-line">{para}</p>
            ))}
          </div>
        </>
      ) : (
        <Notice tone="warning" className="mt-6" title="Not available yet">
          This document has not been published. Connect the database and run the migrations to load the current version.
        </Notice>
      )}
    </article>
  );
}
