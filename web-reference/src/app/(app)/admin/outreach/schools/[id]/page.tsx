import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/forms";
import { Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { FORM_HELP_LABEL, FORM_INTEREST_LABEL, OUTREACH_ZONE, outreachEmail } from "@/lib/outreach";
import type { Finding } from "@/lib/page-facts";
import { createClient } from "@/lib/supabase/server";
import { ensureIntroCode, gatherUniversity, loadSchoolPhoto } from "../../actions";
import { BulkToggle } from "../../bulk-toggle";
import { CopyLink } from "../../copy-link";
import { SchoolPhoto } from "../../school-photo";
import { WriteLetters } from "../../write-dialog";

export const maxDuration = 150;

type School = { id: string; name: string; city: string | null; state: string | null; email_domains: string[] };
type Outreach = {
  image_url: string | null;
  research_status: string;
  research_finished_at: string | null;
  research_error: string | null;
  pages: Array<{ url: string; ok: boolean; title: string | null; kind?: "school" | "chapter" | "directory" }>;
  findings: Finding[];
  chapters_found: number;
  emails_found: number;
  facts_found: number;
  intro_code: string | null;
};
type Contact = { id: string; full_name: string | null; organization: string; role: string; email: string; emails_sent: number; replies: number; do_not_contact: boolean };
type ResponseRow = {
  id: string;
  full_name: string;
  role: string;
  organization: string;
  council: string | null;
  member_count: number | null;
  in_house: number | null;
  out_of_house: number | null;
  dues: string | null;
  email: string;
  phone: string | null;
  prefer_email: boolean;
  prefer_text: boolean;
  prefer_call: boolean;
  best_time: string | null;
  interest: string;
  help: string[];
  notes: string | null;
  created_at: string;
};

const GROUPS: Array<{ kind: Finding["kind"]; title: string; empty: string }> = [
  { kind: "chapter", title: "Chapters and councils", empty: "No chapter or council names were on the pages we read." },
  { kind: "members", title: "How big", empty: "No membership numbers were on the pages we read." },
  { kind: "housing", title: "In house and out of house", empty: "No housing numbers were on the pages we read." },
  { kind: "dues", title: "Dues", empty: "No dues figures were on the pages we read. Nothing here is an estimate." },
  { kind: "national", title: "National size", empty: "The school's pages did not give a national membership total." },
];

export default async function SchoolPage({ params }: PageProps<"/admin/outreach/schools/[id]">) {
  await requireStaff([]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: schoolData } = await supabase.from("universities").select("id, name, city, state, email_domains").eq("id", id).maybeSingle();
  if (!schoolData) notFound();
  const school = schoolData as School;
  const [{ data: outreachData, error: outreachError }, { data: contactData }, { data: responseData }, bulk] = await Promise.all([
    supabase.from("university_outreach").select("image_url, research_status, research_finished_at, research_error, pages, findings, chapters_found, emails_found, facts_found, intro_code").eq("university_id", id).maybeSingle(),
    supabase.from("outreach_contacts").select("id, full_name, organization, role, email, emails_sent, replies, do_not_contact").eq("university_id", id).order("organization"),
    supabase.from("intro_responses").select("id, full_name, role, organization, council, member_count, in_house, out_of_house, dues, email, phone, prefer_email, prefer_text, prefer_call, best_time, interest, help, notes, created_at").eq("university_id", id).order("created_at", { ascending: false }),
    supabase.from("outreach_contacts").select("id, bulk_subject, bulk_body").eq("university_id", id).not("bulk_added_at", "is", null),
  ]);
  const bulkReady = !bulk.error;
  const queued = new Map((bulk.data ?? []).map((row) => [row.id as string, row as { bulk_subject: string | null; bulk_body: string | null }]));
  if (outreachError && /does not exist|schema cache/i.test(outreachError.message)) {
    return <Notice tone="danger">The university outreach migration is not on this database yet. Run npx supabase db push.</Notice>;
  }
  const outreach = (outreachData ?? null) as Outreach | null;
  const contacts = (contactData ?? []) as Contact[];
  const responses = (responseData ?? []) as ResponseRow[];
  const code = outreach?.intro_code ?? await ensureIntroCode(id);
  const introUrl = `${serverEnv.outreachSiteUrl()}/intro/${code}`;
  const findings = outreach?.findings ?? [];
  const listed = new Set(contacts.map((contact) => contact.email.toLowerCase()));
  const elsewhere = [...new Set(findings.filter((finding) => finding.kind === "email").map((finding) => finding.title.toLowerCase()))].filter((email) => !listed.has(email));
  for (let i = 0; i < elsewhere.length; i += 150) {
    const chunk = elsewhere.slice(i, i + 150);
    const [{ data: shared }, sharedBulk] = await Promise.all([
      supabase.from("outreach_contacts").select("id, full_name, organization, role, email, emails_sent, replies, do_not_contact").in("email_normalized", chunk),
      bulkReady ? supabase.from("outreach_contacts").select("id, bulk_subject, bulk_body").in("email_normalized", chunk).not("bulk_added_at", "is", null) : Promise.resolve({ data: [] }),
    ]);
    contacts.push(...((shared ?? []) as Contact[]));
    for (const row of sharedBulk.data ?? []) queued.set(row.id as string, row as { bulk_subject: string | null; bulk_body: string | null });
  }
  contacts.sort((a, b) => a.organization.localeCompare(b.organization));
  const siteRows = findings.filter((finding) => finding.kind === "site");
  const sitesByChapter = [...siteRows.reduce((map, finding) => map.set(finding.title, [...(map.get(finding.title) ?? []), finding]), new Map<string, Finding[]>()).entries()]
    .sort((a, b) => Number(b[1].some((finding) => finding.detail === "Chapter website")) - Number(a[1].some((finding) => finding.detail === "Chapter website")) || a[0].localeCompare(b[0]));
  const opened = (outreach?.pages ?? []).filter((page, index, all) => all.findIndex((other) => other.url === page.url) === index);
  const chapterPages = opened.filter((page) => page.kind === "chapter" && page.ok);
  const chapterSiteCount = siteRows.filter((finding) => finding.detail === "Chapter website").length;
  const from = serverEnv.outreachFrom() ?? serverEnv.emailFrom();
  const drafts = contacts.map((contact) => {
    const mail = outreachEmail({ full_name: contact.full_name, organization: contact.organization, university: school.name }, introUrl);
    return {
      id: contact.id,
      name: contact.full_name ?? contact.organization,
      hasName: Boolean(contact.full_name),
      role: contact.role,
      organization: contact.organization,
      email: contact.email,
      emailsSent: contact.emails_sent,
      replies: contact.replies,
      blocked: contact.do_not_contact,
      subject: queued.get(contact.id)?.bulk_subject ?? mail.subject,
      body: queued.get(contact.id)?.bulk_body ?? mail.body,
      inBulk: bulkReady ? queued.has(contact.id) : null,
    };
  });
  const addable = drafts.filter((draft) => !draft.blocked && !draft.inBulk && draft.emailsSent === 0).map((draft) => draft.id);
  const alreadySent = drafts.filter((draft) => !draft.blocked && !draft.inBulk && draft.emailsSent > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Universities</Link>}
        title={school.name}
        description={[school.city, school.state].filter(Boolean).join(", ") || "United States"}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="aspect-[16/7] bg-subtle">
            <SchoolPhoto id={school.id} name={school.name} initialUrl={outreach?.image_url?.includes("/640px-") ? null : outreach?.image_url ?? null} load={loadSchoolPhoto} />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 p-4">
            <div>
              <p className="text-[13px] text-ink-3">Student email</p>
              <ul className="mt-1 space-y-0.5">
                {(school.email_domains ?? []).length === 0 ? <li className="text-sm text-ink-3">No domain on file</li> : school.email_domains.map((domain) => (
                  <li key={domain} className="font-mono text-sm text-ink">name@{domain}</li>
                ))}
              </ul>
            </div>
            <form action={gatherUniversity.bind(null, school.id)}>
              <SubmitButton pendingLabel="Reading the site">{outreach?.research_status === "done" ? "Gather again" : "Gather info"}</SubmitButton>
            </form>
          </div>
        </div>
        <Card>
          <CardHeader title="Chapter form" description="This link goes in the email. It is only for this school." />
          <CardBody className="space-y-2">
            <a href={introUrl} target="_blank" rel="noreferrer" className="break-all text-sm text-accent underline-offset-2 hover:underline">{introUrl}</a>
            <div className="flex flex-wrap items-center gap-3">
              <CopyLink url={introUrl} />
              <Link href="/admin/outreach/forms/links" className="text-[13px] text-ink-3 hover:text-ink">All form links</Link>
            </div>
            <p className="text-[13px] text-ink-3">{responses.length} response{responses.length === 1 ? "" : "s"} so far.</p>
          </CardBody>
        </Card>
      </div>

      {outreach?.research_status === "failed" ? <Notice tone="danger">{outreach.research_error ?? "The read failed."}</Notice> : null}
      {outreach?.research_status === "done" && outreach.research_error ? <Notice>{outreach.research_error}</Notice> : null}
      {outreach?.research_finished_at ? <p className="text-[13px] text-ink-3">Last read {formatDateTime(outreach.research_finished_at, OUTREACH_ZONE)} · {outreach.pages.filter((page) => page.ok).length} pages opened · {chapterSiteCount} chapter site{chapterSiteCount === 1 ? "" : "s"} · {outreach.chapters_found} chapters · {outreach.emails_found} emails · {outreach.facts_found} figures</p> : <p className="text-sm text-ink-3">Nothing has been read yet. Gather info reads the university&apos;s public site, its organization directory, and the chapter websites those pages link to. It does not invent dues or membership numbers.</p>}

      {GROUPS.map((group) => {
        const rows = findings.filter((finding) => finding.kind === group.kind);
        return (
          <Card key={group.kind}>
            <CardHeader title={group.title} />
            {rows.length === 0 ? <CardBody><p className="text-sm text-ink-3">{outreach?.research_status === "done" ? group.empty : "Not gathered yet."}</p></CardBody> : (
              <ul className="divide-y divide-line">
                {rows.map((finding, index) => (
                  <li key={`${finding.title}-${index}`} className="px-5 py-3">
                    <p className="font-medium text-ink">{finding.title}</p>
                    {finding.quote ? <p className="mt-1 text-sm text-ink-2">{finding.quote}</p> : null}
                    <a href={finding.source_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[12px] text-accent underline-offset-2 hover:underline">{finding.source_url}</a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      <Card>
        <CardHeader title="Chapter websites and social" description="Sites and accounts the school or its directory links to for each chapter. Websites that mention this school were opened and read too." />
        {sitesByChapter.length === 0 ? <CardBody><p className="text-sm text-ink-3">{outreach?.research_status === "done" ? "No chapter websites or social accounts were linked from the pages we read." : "Not gathered yet."}</p></CardBody> : (
          <ul className="divide-y divide-line">
            {sitesByChapter.map(([chapter, links]) => (
              <li key={chapter} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <p className="font-medium text-ink">{chapter}</p>
                <span className="flex flex-wrap gap-2">
                  {links.map((link) => (
                    <a key={link.source_url} href={link.source_url} target="_blank" rel="noreferrer" title={link.quote ?? link.source_url} className="rounded-sm border border-line px-2 py-0.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink">
                      {link.detail === "Chapter website" ? new URL(link.source_url).hostname.replace(/^www\./, "") : link.detail}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {opened.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface px-5 py-3 text-sm">
          <summary className="cursor-pointer text-ink-2">Pages opened ({opened.filter((page) => page.ok).length}{chapterPages.length > 0 ? `, ${chapterPages.length} on chapter sites` : ""})</summary>
          {([["School site", opened.filter((page) => (page.kind ?? "school") === "school")], ["Organization directory", opened.filter((page) => page.kind === "directory")], ["Chapter sites", chapterPages]] as const).map(([label, list]) => list.length === 0 ? null : (
            <div key={label} className="mt-3">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
              <ul className="mt-1 space-y-1">
                {list.map((page) => (
                  <li key={page.url} className="truncate">
                    <a href={page.url} target="_blank" rel="noreferrer" className={page.ok ? "text-ink-2 hover:text-ink" : "text-danger"}>{page.title || page.url}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : null}

      <Card>
        <CardHeader
          title="Emails"
          description="Addresses found on the school's Greek life pages, its organization directory, and chapter websites. Write from here, or open one for the full send history."
          actions={bulkReady && drafts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              {addable.length > 0 ? <BulkToggle ids={addable} on label={`Queue the preset letter for all ${addable.length}`} /> : null}
              {alreadySent > 0 ? <span className="text-[13px] text-ink-3">{alreadySent} already emailed, left off</span> : null}
              <Link href="/admin/outreach/bulk" className="text-sm text-ink-2 hover:text-ink">Bulk mail list</Link>
            </div>
          ) : null}
        />
        {drafts.length === 0 ? <CardBody><p className="text-sm text-ink-3">{outreach?.research_status === "done" ? "No Greek life email was on the pages we read." : "Gather info to look for emails."}</p></CardBody> : (
          <WriteLetters drafts={drafts} from={from} replyTo={serverEnv.outreachReplyTo()} canSend={Boolean(serverEnv.resendApiKey())} />
        )}
      </Card>

      <Card>
        <CardHeader title="Form responses" description="What chapters sent back from the link in the email. Open one to reply or track it." actions={<Link href="/admin/outreach/forms" className="text-sm text-ink-2 hover:text-ink">All forms</Link>} />
        {responses.length === 0 ? <CardBody><p className="text-sm text-ink-3">No one has filled out the form yet.</p></CardBody> : (
          <ul className="divide-y divide-line">
            {responses.map((response) => (
              <li key={response.id} className="space-y-1 px-5 py-4 text-sm">
                <p className="font-medium text-ink">{response.full_name} · {response.role}</p>
                <p className="text-ink-2">{response.organization}{response.council ? ` · ${response.council}` : ""} · {formatDateTime(response.created_at, OUTREACH_ZONE)}</p>
                <p className="text-ink-2">{FORM_INTEREST_LABEL[response.interest] ?? response.interest}. Members {response.member_count ?? "not given"}{response.in_house != null ? `, ${response.in_house} in house` : ""}{response.out_of_house != null ? `, ${response.out_of_house} out of house` : ""}{response.dues ? `. Dues: ${response.dues}` : ""}.</p>
                <p className="text-ink-2">
                  {response.email}
                  {response.phone ? ` · ${response.phone}` : ""}
                  {" · "}
                  {[response.prefer_email ? "email" : null, response.prefer_text ? "text" : null, response.prefer_call ? "call" : null].filter(Boolean).join(", ")}
                  {response.best_time ? ` · ${response.best_time}` : ""}
                </p>
                {response.help.length > 0 ? <p className="text-ink-3">Wants help with {response.help.map((item) => FORM_HELP_LABEL[item]?.toLowerCase() ?? item).join(", ")}.</p> : null}
                {response.notes ? <p className="whitespace-pre-wrap text-ink-2">{response.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
