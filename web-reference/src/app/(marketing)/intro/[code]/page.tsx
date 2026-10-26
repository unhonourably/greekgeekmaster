import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitIntro } from "./actions";
import { IntroForm } from "./intro-form";

export const metadata: Metadata = { title: "Tell us about your chapter" };

type IntroSchool = { university_name: string; city: string | null; state: string | null; image_url: string | null };

const PITCH = "Amare Carey and Owen Caldwell are building GreekGeek at the University of Missouri. If your chapter wants a look, tell us who you are and how to reach you.";

function Shell({ photo, title, place, form }: { photo: React.ReactNode; title: React.ReactNode; place: React.ReactNode; form: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-10 px-6 py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:py-20">
      <div>
        <div className="overflow-hidden rounded-lg border border-line bg-subtle">{photo}</div>
        <h1 className="mt-6 font-serif text-4xl font-semibold tracking-tight">{title}</h1>
        {place}
        <p className="mt-5 text-lg text-ink-2">{PITCH}</p>
      </div>
      <div className="rounded-lg border border-line bg-surface px-5 py-6 sm:px-6">
        <h2 className="text-lg font-semibold text-ink">Your chapter</h2>
        {form}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <Shell
      photo={<div className="aspect-[16/10] animate-pulse" />}
      title={<span className="block h-10 w-3/4 animate-pulse rounded-md bg-subtle" aria-label="Loading" />}
      place={<p className="mt-2 h-5 w-32 animate-pulse rounded bg-subtle" />}
      form={<div className="mt-5 space-y-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-md bg-subtle" />)}</div>}
    />
  );
}

async function Intro({ params }: { params: PageProps<"/intro/[code]">["params"] }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("intro_university", { p_code: code });
  const school = (Array.isArray(data) ? data[0] : data) as IntroSchool | undefined;
  if (error || !school?.university_name) notFound();
  const place = [school.city, school.state].filter(Boolean).join(", ");
  return (
    <Shell
      photo={school.image_url ? <img src={school.image_url} alt="" className="aspect-[16/10] w-full object-cover" /> : <div className="aspect-[16/10]" />}
      title={school.university_name}
      place={place ? <p className="mt-2 text-ink-3">{place}</p> : null}
      form={<IntroForm action={submitIntro.bind(null, code)} />}
    />
  );
}

export default function IntroPage({ params }: PageProps<"/intro/[code]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Intro params={params} />
    </Suspense>
  );
}
