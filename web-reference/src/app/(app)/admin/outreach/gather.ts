import "server-only";
import { revalidatePath } from "next/cache";
import { readGreekLife } from "@/lib/university-research";
import type { createClient } from "@/lib/supabase/server";
import { randomCode } from "./send";

type Client = Awaited<ReturnType<typeof createClient>>;

export const GATHER_BUDGET_MS = 95_000;

const RUNNING_FOR_MS = GATHER_BUDGET_MS + 30_000;

const GENERIC_ROLES = new Set(["Greek life office", "Chapter contact"]);

export type GatherSummary = {
  id: string;
  name: string;
  status: "done" | "failed" | "busy" | "missing";
  chapters: number;
  emails: number;
  newContacts: number;
  facts: number;
  sites: number;
  pages: number;
  error: string | null;
};

export async function gatherSchool(supabase: Client, universityId: string): Promise<GatherSummary> {
  const empty = { chapters: 0, emails: 0, newContacts: 0, facts: 0, sites: 0, pages: 0 };
  const { data: school } = await supabase.from("universities").select("id, name, email_domains").eq("id", universityId).maybeSingle();
  if (!school) return { id: universityId, name: "Unknown school", status: "missing", ...empty, error: "That school is not in the directory." };
  const name = String(school.name);
  const domains = ((school.email_domains ?? []) as string[]).map((domain) => domain.toLowerCase());
  const { data: existing } = await supabase.from("university_outreach").select("research_status, research_started_at, intro_code").eq("university_id", universityId).maybeSingle();
  const started = existing?.research_started_at ? new Date(existing.research_started_at).getTime() : 0;
  if (existing?.research_status === "running" && Date.now() - started < RUNNING_FOR_MS) return { id: universityId, name, status: "busy", ...empty, error: "Already being read." };
  const intro = existing?.intro_code ?? randomCode();
  const running = { intro_code: intro, research_status: "running", research_started_at: new Date().toISOString(), research_error: null };
  if (existing) await supabase.from("university_outreach").update(running).eq("university_id", universityId);
  else await supabase.from("university_outreach").insert({ university_id: universityId, ...running });

  let summary: GatherSummary;
  try {
    const result = await readGreekLife(domains, fetch, GATHER_BUDGET_MS, { schoolName: name });
    const emails = result.findings.filter((finding) => finding.kind === "email");
    const contacts = [...new Map(emails.map((email) => {
      const [role, organization, fullName] = (email.detail ?? "Greek life office · Greek life").split(" · ");
      const person = fullName?.trim() ?? "";
      return [email.title.toLowerCase(), {
        university: name.slice(0, 160),
        university_id: universityId,
        organization: (organization?.trim().length >= 2 ? organization.trim() : "Greek life").slice(0, 120),
        role: (role?.trim().length >= 2 ? role.trim() : "Greek life office").slice(0, 80),
        full_name: person.length >= 2 ? person.slice(0, 120) : null,
        email: email.title.toLowerCase(),
        source_url: /^https?:\/\//i.test(email.source_url) ? email.source_url.slice(0, 500) : null,
        notes: email.quote?.slice(0, 4000) ?? null,
      }];
    })).values()];
    const known: Array<{ id: string; email_normalized: string; role: string; organization: string; full_name: string | null; university_id: string | null }> = [];
    for (let i = 0; i < contacts.length; i += 150) {
      const { data } = await supabase.from("outreach_contacts").select("id, email_normalized, role, organization, full_name, university_id").in("email_normalized", contacts.slice(i, i + 150).map((contact) => contact.email));
      known.push(...((data ?? []) as typeof known));
    }
    const byEmail = new Map(known.map((row) => [row.email_normalized, row]));
    const fresh = contacts.filter((contact) => !byEmail.has(contact.email));
    let saveFailed = false;
    let added = 0;
    if (fresh.length > 0) {
      const inserted = await supabase.from("outreach_contacts").insert(fresh);
      if (inserted.error) {
        for (const contact of fresh) {
          const single = await supabase.from("outreach_contacts").insert(contact);
          if (single.error && single.error.code !== "23505") saveFailed = true;
          else added++;
        }
      } else {
        added = fresh.length;
      }
    }
    await Promise.all(contacts.filter((contact) => byEmail.has(contact.email)).map(async (contact) => {
      const row = byEmail.get(contact.email)!;
      const update: Record<string, string | null> = row.university_id && row.university_id !== universityId ? {} : { university: contact.university, university_id: contact.university_id, source_url: contact.source_url, notes: contact.notes };
      if (contact.full_name && !row.full_name) update.full_name = contact.full_name;
      if (GENERIC_ROLES.has(row.role) && !GENERIC_ROLES.has(contact.role)) update.role = contact.role;
      if (row.organization === "Greek life" && contact.organization !== "Greek life") update.organization = contact.organization;
      if (Object.keys(update).length === 0) return;
      const updated = await supabase.from("outreach_contacts").update(update).eq("id", row.id);
      if (updated.error) saveFailed = true;
    }));
    const chapters = result.findings.filter((finding) => finding.kind === "chapter").length;
    const facts = result.findings.filter((finding) => finding.kind !== "chapter" && finding.kind !== "email" && finding.kind !== "site").length;
    const error = saveFailed ? "Some emails were found but could not be saved as contacts." : result.error;
    await supabase.from("university_outreach").update({
      research_status: "done",
      research_finished_at: new Date().toISOString(),
      research_error: error,
      pages: result.pages,
      findings: result.findings,
      chapters_found: chapters,
      emails_found: emails.length,
      facts_found: facts,
    }).eq("university_id", universityId);
    summary = { id: universityId, name, status: "done", chapters, emails: emails.length, newContacts: added, facts, sites: result.stats.chapterSites, pages: result.pages.filter((page) => page.ok).length, error };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "The read failed.";
    await supabase.from("university_outreach").update({
      research_status: "failed",
      research_finished_at: new Date().toISOString(),
      research_error: message,
    }).eq("university_id", universityId);
    summary = { id: universityId, name, status: "failed", ...empty, error: message };
  }
  revalidatePath("/admin/outreach");
  revalidatePath(`/admin/outreach/schools/${universityId}`);
  return summary;
}
