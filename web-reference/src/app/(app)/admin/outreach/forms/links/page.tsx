import Link from "next/link";
import { ClipboardList, ExternalLink, Search } from "lucide-react";
import { SubmitButton } from "@/components/forms";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createIntroForm } from "../../actions";
import { CopyLink } from "../../copy-link";

type Coded = { university_id: string; intro_code: string; university: { id: string; name: string; city: string | null; state: string | null } | null };
type School = { id: string; name: string; city: string | null; state: string | null };

function place(school: { city: string | null; state: string | null }): string {
  return [school.city, school.state].filter(Boolean).join(", ");
}

export default async function FormLinksPage({ searchParams }: PageProps<"/admin/outreach/forms/links">) {
  await requireStaff([]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  const [codedQuery, responsesQuery, contactsQuery] = await Promise.all([
    supabase.from("university_outreach").select("university_id, intro_code, university:universities(id, name, city, state)").not("intro_code", "is", null).limit(5000),
    supabase.from("intro_responses").select("university_id").limit(10000),
    supabase.from("outreach_contacts").select("university_id").not("university_id", "is", null).limit(20000),
  ]);
  const tally = (rows: Array<{ university_id: string | null }> | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) if (row.university_id) counts.set(row.university_id, (counts.get(row.university_id) ?? 0) + 1);
    return counts;
  };
  const responses = tally(responsesQuery.data);
  const contacts = tally(contactsQuery.data);
  const needle = q.toLowerCase();
  const coded = ((codedQuery.data ?? []) as unknown as Coded[])
    .filter((row) => row.university && (!needle || row.university.name.toLowerCase().includes(needle)))
    .sort((a, b) =>
      (responses.get(b.university_id) ?? 0) - (responses.get(a.university_id) ?? 0)
      || Number(contacts.has(b.university_id)) - Number(contacts.has(a.university_id))
      || a.university!.name.localeCompare(b.university!.name));
  const codedIds = new Set(coded.map((row) => row.university_id));
  const extra = q.length >= 2
    ? (((await supabase.from("universities").select("id, name, city, state").eq("source", "ipeds").ilike("name", `%${q.replace(/[%_]/g, "")}%`).order("name").limit(15)).data ?? []) as School[]).filter((school) => !codedIds.has(school.id))
    : [];
  const site = serverEnv.outreachSiteUrl();
  const total = responses.size;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach/forms" className="hover:text-ink">Forms</Link>}
        title="Form links"
        description="Each school has its own chapter interest form. The link goes in outreach emails, and submissions land in Forms."
        actions={<Link href="/admin/outreach/bulk" className="text-sm text-ink-2 hover:text-ink">Bulk list</Link>}
      />

      <form className="flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Find a school" aria-label="Find a school" className="max-w-md" />
        <Button type="submit" variant="secondary"><Search className="size-4" aria-hidden />Search</Button>
        {q ? <Link href="/admin/outreach/forms/links" className="self-center text-sm text-ink-3 hover:text-ink">Clear</Link> : null}
      </form>

      {extra.length > 0 ? (
        <Card>
          <CardHeader title="No form yet" description="These schools match your search but don't have a form link. Make one and it's ready to share." />
          <ul className="divide-y divide-line">
            {extra.map((school) => (
              <li key={school.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{school.name}</p>
                  <p className="text-[13px] text-ink-3">{place(school) || "United States"}</p>
                </div>
                <form action={createIntroForm.bind(null, school.id)}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Making">Make form link</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {coded.length === 0 ? (
        <EmptyState icon={ClipboardList} title={q ? "No school forms match" : "No school forms yet"}>
          {q ? "Try another name, or make a form for a school above." : "A form is made the first time you open a school's page. Search for a school to make one now."}
        </EmptyState>
      ) : (
        <Card>
          <CardHeader title={`${coded.length} school form${coded.length === 1 ? "" : "s"}`} description={`${total} school${total === 1 ? " has" : "s have"} responses. Schools with responses come first, then schools you have contacts at.`} />
          <ul className="divide-y divide-line">
            {coded.map((row) => {
              const url = `${site}/intro/${row.intro_code}`;
              const count = responses.get(row.university_id) ?? 0;
              return (
                <li key={row.university_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/admin/outreach/schools/${row.university_id}`} className="font-medium text-ink hover:underline">{row.university!.name}</Link>
                    <p className="text-[13px] text-ink-3">{place(row.university!) || "United States"}</p>
                    <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate font-mono text-[12px] text-accent underline-offset-2 hover:underline">
                      {url}
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {contacts.get(row.university_id) ? <Badge tone="neutral">{contacts.get(row.university_id)} contact{contacts.get(row.university_id) === 1 ? "" : "s"}</Badge> : null}
                    {count > 0 ? <Badge tone="positive">{count} response{count === 1 ? "" : "s"}</Badge> : <Badge>No responses</Badge>}
                    <CopyLink url={url} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
