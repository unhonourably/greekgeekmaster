import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { BATCH_LIMIT, pause, sendEmail, sendEmailBatch, type OutgoingEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { outreachEmail, withFormLink, type OutreachDraft } from "@/lib/outreach";
import { pickCampus } from "@/lib/recommended-schools";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function refreshOutreach(id?: string, schoolId?: string | null) {
  revalidatePath("/admin/outreach");
  revalidatePath("/admin/outreach/sent");
  revalidatePath("/admin/outreach/emails");
  revalidatePath("/admin/outreach/bulk");
  revalidatePath("/admin/outreach/bulk/history");
  revalidatePath("/admin/outreach/stats");
  revalidatePath("/admin/outreach/forms");
  revalidatePath("/admin/outreach/forms/[id]", "page");
  if (id) revalidatePath(`/admin/outreach/contacts/${id}`);
  if (schoolId) revalidatePath(`/admin/outreach/schools/${schoolId}`);
}

export async function contactForResponse(supabase: Supabase, userId: string, responseId: string): Promise<{ id: string } | { error: string }> {
  const { data: response } = await supabase
    .from("intro_responses")
    .select("id, contact_id, full_name, role, organization, email, university_id, university:universities(name)")
    .eq("id", responseId)
    .maybeSingle();
  if (!response) return { error: "This form submission no longer exists." };
  if (response.contact_id) return { id: response.contact_id as string };
  const email = String(response.email).trim().toLowerCase();
  const school = response.university as unknown as { name: string } | null;
  const { data: existing } = await supabase.from("outreach_contacts").select("id").eq("email_normalized", email).maybeSingle();
  let contactId = existing?.id as string | undefined;
  if (!contactId) {
    const { data: created } = await supabase
      .from("outreach_contacts")
      .insert({
        university: (school?.name ?? "Unknown school").slice(0, 160),
        university_id: response.university_id,
        organization: String(response.organization).slice(0, 120),
        role: String(response.role).slice(0, 80),
        full_name: response.full_name,
        email,
        notes: "Added from their interest form.",
        created_by: userId,
      })
      .select("id")
      .single();
    contactId = created?.id as string | undefined;
    if (!contactId) {
      const { data: again } = await supabase.from("outreach_contacts").select("id").eq("email_normalized", email).maybeSingle();
      contactId = again?.id as string | undefined;
    }
  }
  if (!contactId) return { error: "A contact could not be made for this email." };
  await supabase.from("intro_responses").update({ contact_id: contactId }).eq("id", responseId);
  return { id: contactId };
}

export function randomCode(): string {
  return randomBytes(9).toString("base64url");
}

export async function introCode(supabase: Supabase, universityId: string): Promise<string> {
  const { data } = await supabase.from("university_outreach").select("intro_code").eq("university_id", universityId).maybeSingle();
  if (data?.intro_code) return data.intro_code;
  const code = randomCode();
  if (!data) {
    const { error } = await supabase.from("university_outreach").insert({ university_id: universityId, intro_code: code });
    if (!error) return code;
  }
  const again = await supabase.from("university_outreach").select("intro_code").eq("university_id", universityId).maybeSingle();
  if (again.data?.intro_code) return again.data.intro_code;
  await supabase.from("university_outreach").update({ intro_code: code }).eq("university_id", universityId).is("intro_code", null);
  return code;
}

function replyAddress(): string {
  const replyTo = serverEnv.outreachReplyTo();
  return replyTo.match(/<([^>]+)>/)?.[1] ?? replyTo;
}

function outreachMessage(to: string, subject: string, body: string, idempotencyKey: string): OutgoingEmail {
  return {
    to,
    from: serverEnv.outreachFrom(),
    replyTo: serverEnv.outreachReplyTo(),
    subject,
    text: body,
    idempotencyKey,
    headers: { "List-Unsubscribe": `<mailto:${replyAddress()}?subject=unsubscribe>` },
  };
}

export async function deliverOutreach(userId: string, id: string, formData: FormData): Promise<ActionState> {
  const letter = readLetter(formData);
  if ("error" in letter) return { error: letter.error };
  if (!serverEnv.resendApiKey()) return { error: "Sending is off because RESEND_API_KEY is not set on the server." };
  const supabase = await createClient();
  const { data: contact } = await supabase.from("outreach_contacts").select("id, email, do_not_contact, university_id").eq("id", id).maybeSingle();
  if (!contact) return { error: "This contact no longer exists." };
  if (contact.do_not_contact) return { error: "This contact is marked do not contact." };
  const includeForm = formData.get("include_form") === "on";
  const link = includeForm ? (await formLinks(supabase, [contact], true)).get(contact.id) ?? null : null;
  const subject = letter.subject;
  const body = withFormLink(letter.body, link);
  const formNote = includeForm ? (link ? " The form link was included." : " No school matched their email, so it went without a form link.") : " No form link included.";
  const { data: row, error } = await supabase
    .from("outreach_emails")
    .insert({ contact_id: id, direction: "sent", status: "sending", subject, body, to_email: contact.email, sent_by: userId })
    .select("id")
    .single();
  if (error || !row) return { error: "The email could not be recorded, so it was not sent." };
  try {
    const result = await sendEmail(outreachMessage(contact.email, subject, body, row.id));
    if (!result.delivered) throw new Error("Email delivery is not configured.");
    await supabase.from("outreach_emails").update({ status: "sent", provider_id: result.id, occurred_at: new Date().toISOString() }).eq("id", row.id);
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "Send failed";
    await supabase.from("outreach_emails").update({ status: "failed", error: message.slice(0, 500) }).eq("id", row.id);
    refreshOutreach(id, contact.university_id);
    return { error: `Not sent: ${message}` };
  }
  refreshOutreach(id, contact.university_id);
  return { ok: true, message: `Sent to ${contact.email}.${formNote}` };
}

export const BULK_COLUMNS = "id, full_name, organization, role, email, university, university_id, do_not_contact, emails_sent, replies, bulk_added_at, bulk_subject, bulk_body";

export const OFF_BULK = { bulk_added_at: null, bulk_subject: null, bulk_body: null };

export function readLetter(formData: FormData): { subject: string; body: string } | { error: string } {
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 2 || subject.length > 300) return { error: "Add a subject line." };
  if (body.length < 20 || body.length > 50000) return { error: "The email body is empty or too long." };
  return { subject, body };
}

export async function queueOutreach(id: string, formData: FormData): Promise<ActionState> {
  const letter = readLetter(formData);
  if ("error" in letter) return { error: letter.error };
  const supabase = await createClient();
  const { data: contact } = await supabase.from("outreach_contacts").select("id, email, do_not_contact, university_id, bulk_added_at").eq("id", id).maybeSingle();
  if (!contact) return { error: "This contact no longer exists." };
  if (contact.do_not_contact) return { error: "This contact is marked do not contact." };
  const { error } = await supabase
    .from("outreach_contacts")
    .update({ bulk_subject: letter.subject, bulk_body: letter.body, bulk_added_at: contact.bulk_added_at ?? new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: /bulk_subject|schema cache/i.test(error.message) ? "The bulk mail migration is not on this database yet. Run npx supabase db push." : "The email could not be added to the bulk list." };
  refreshOutreach(id, contact.university_id);
  revalidatePath("/admin/outreach/schools/[id]", "page");
  return { ok: true, message: contact.bulk_added_at ? `Updated the queued email to ${contact.email}.` : `Queued for ${contact.email}. Nothing has been sent yet.`, values: { intent: "queue" } };
}

export type BulkContact = {
  id: string;
  full_name: string | null;
  organization: string;
  role: string;
  email: string;
  university: string;
  university_id: string | null;
  do_not_contact: boolean;
  emails_sent: number;
  replies: number;
  bulk_added_at: string;
  bulk_subject: string | null;
  bulk_body: string | null;
};

type SchoolRow = { id: string; name: string; email_domains: string[] | null };

function domainSuffixes(email: string): string[] {
  const labels = (email.split("@")[1] ?? "").toLowerCase().split(".");
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join(".")).filter((domain) => domain.includes("."));
}

export async function matchSchools(supabase: Supabase, emails: string[]): Promise<Map<string, { id: string; name: string }>> {
  const candidates = [...new Set(emails.flatMap(domainSuffixes))];
  const found = new Map<string, { id: string; name: string }>();
  if (candidates.length === 0) return found;
  const { data } = await supabase.from("universities").select("id, name, email_domains").eq("source", "ipeds").overlaps("email_domains", candidates);
  const schools = (data ?? []) as SchoolRow[];
  for (const email of emails) {
    const school = domainSuffixes(email).map((domain) => pickCampus(schools, { domain })).find(Boolean);
    if (school) found.set(email.toLowerCase(), { id: school.id, name: school.name });
  }
  return found;
}

export async function formLinks(supabase: Supabase, contacts: Array<{ id: string; email: string; university_id: string | null }>, save = false): Promise<Map<string, string | null>> {
  const unmatched = contacts.filter((contact) => !contact.university_id);
  const matched = await matchSchools(supabase, unmatched.map((contact) => contact.email));
  const schoolFor = new Map(contacts.map((contact) => [contact.id, contact.university_id ?? matched.get(contact.email.toLowerCase())?.id ?? null]));
  if (save) {
    for (const contact of unmatched) {
      const schoolId = schoolFor.get(contact.id);
      if (schoolId) await supabase.from("outreach_contacts").update({ university_id: schoolId }).eq("id", contact.id).is("university_id", null);
    }
  }
  const schoolIds = [...new Set([...schoolFor.values()].filter((id): id is string => Boolean(id)))];
  const codes = new Map<string, string>();
  if (schoolIds.length > 0) {
    const { data } = await supabase.from("university_outreach").select("university_id, intro_code").in("university_id", schoolIds);
    for (const row of data ?? []) if (row.intro_code) codes.set(row.university_id, row.intro_code);
    for (const schoolId of schoolIds) if (!codes.has(schoolId)) codes.set(schoolId, await introCode(supabase, schoolId));
  }
  const site = serverEnv.outreachSiteUrl();
  return new Map(contacts.map((contact) => {
    const schoolId = schoolFor.get(contact.id);
    const code = schoolId ? codes.get(schoolId) : null;
    return [contact.id, code ? `${site}/intro/${code}` : null];
  }));
}

export async function bulkDrafts(supabase: Supabase, contacts: BulkContact[], save = false): Promise<{ drafts: Map<string, OutreachDraft>; links: Map<string, string | null> }> {
  const links = await formLinks(supabase, contacts, save);
  const drafts = new Map(
    contacts.map((contact) => {
      const link = links.get(contact.id) ?? null;
      if (contact.bulk_subject && contact.bulk_body) return [contact.id, { subject: contact.bulk_subject, body: withFormLink(contact.bulk_body, link) }];
      return [contact.id, outreachEmail(contact, link)];
    }),
  );
  return { drafts, links };
}

const BULK_PER_PRESS = 500;
const BULK_BUDGET_MS = 40_000;
const SINGLE_GAP_MS = 250;
const BATCH_GAP_MS = 600;

type Outcome = { rowId: string; contactId: string; providerId: string | null; error: string | null };

async function recordOutcomes(supabase: Supabase, outcomes: Outcome[]) {
  const now = new Date().toISOString();
  for (let index = 0; index < outcomes.length; index += 10) {
    await Promise.all(
      outcomes.slice(index, index + 10).map((outcome) =>
        outcome.error
          ? supabase.from("outreach_emails").update({ status: "failed", error: outcome.error.slice(0, 500) }).eq("id", outcome.rowId)
          : supabase.from("outreach_emails").update({ status: "sent", provider_id: outcome.providerId, occurred_at: now }).eq("id", outcome.rowId),
      ),
    );
  }
  const delivered = outcomes.filter((outcome) => !outcome.error).map((outcome) => outcome.contactId);
  if (delivered.length > 0) await supabase.from("outreach_contacts").update(OFF_BULK).in("id", delivered);
}

export async function deliverBulk(userId: string, includeForm: boolean, client?: Supabase): Promise<ActionState> {
  if (!serverEnv.resendApiKey()) return { error: "Sending is off because RESEND_API_KEY is not set on the server." };
  const supabase = client ?? await createClient();
  const { data, error } = await supabase.from("outreach_contacts").select(BULK_COLUMNS).not("bulk_added_at", "is", null).order("bulk_added_at").order("id");
  if (error) return { error: "The bulk list could not be loaded." };
  const listed = (data ?? []) as BulkContact[];
  const blocked = listed.filter((contact) => contact.do_not_contact);
  if (blocked.length > 0) await supabase.from("outreach_contacts").update(OFF_BULK).in("id", blocked.map((contact) => contact.id));
  const ready = listed.filter((contact) => !contact.do_not_contact);
  if (ready.length === 0) {
    refreshOutreach();
    return { error: blocked.length > 0 ? "Everyone left on the list is marked do not contact, so they were taken off." : "The bulk list is empty." };
  }
  const queue = ready.slice(0, BULK_PER_PRESS);
  const prepared = await bulkDrafts(supabase, queue, true);
  const drafts = new Map(queue.map((contact) => {
    const draft = prepared.drafts.get(contact.id)!;
    return [contact.id, { subject: draft.subject, body: withFormLink(draft.body, includeForm ? prepared.links.get(contact.id) ?? null : null) }];
  }));
  const noForm = includeForm ? queue.filter((contact) => !prepared.links.get(contact.id)).length : 0;
  const { data: run } = await supabase.from("outreach_bulk_runs").insert({ sent_by: userId, queued: ready.length, skipped: blocked.length }).select("id").single();
  const runId = (run?.id as string | undefined) ?? null;
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  let handled = 0;
  let stopped: string | null = null;

  for (let index = 0; index < queue.length; index += BATCH_LIMIT) {
    if (index > 0 && Date.now() - started > BULK_BUDGET_MS) break;
    const chunk = queue.slice(index, index + BATCH_LIMIT);
    const { data: rows, error: insertError } = await supabase
      .from("outreach_emails")
      .insert(chunk.map((contact) => ({ contact_id: contact.id, direction: "sent", status: "sending", subject: drafts.get(contact.id)!.subject, body: drafts.get(contact.id)!.body, to_email: contact.email, sent_by: userId, ...(runId ? { bulk_run_id: runId } : {}) })))
      .select("id, contact_id");
    if (insertError || !rows || rows.length !== chunk.length) {
      stopped = "The emails could not be recorded, so they were not sent.";
      break;
    }
    const rowFor = new Map(rows.map((row) => [row.contact_id as string, row.id as string]));
    const messages = chunk.map((contact) => outreachMessage(contact.email, drafts.get(contact.id)!.subject, drafts.get(contact.id)!.body, rowFor.get(contact.id)!));
    const batchKey = `bulk-${createHash("sha256").update(rows.map((row) => row.id).sort().join(",")).digest("hex").slice(0, 48)}`;
    const result = await sendEmailBatch(messages, batchKey);

    if (!result.ok && result.stop) {
      await supabase.from("outreach_emails").delete().in("id", rows.map((row) => row.id)).eq("status", "sending");
      stopped = result.error;
      break;
    }

    const outcomes: Outcome[] = [];
    if (result.ok) {
      chunk.forEach((contact, position) => outcomes.push({ rowId: rowFor.get(contact.id)!, contactId: contact.id, providerId: result.ids[position], error: null }));
    } else {
      for (const [position, contact] of chunk.entries()) {
        try {
          const single = await sendEmail(messages[position]);
          outcomes.push({ rowId: rowFor.get(contact.id)!, contactId: contact.id, providerId: single.id, error: single.delivered ? null : "Email delivery is not configured." });
        } catch (sendError) {
          outcomes.push({ rowId: rowFor.get(contact.id)!, contactId: contact.id, providerId: null, error: sendError instanceof Error ? sendError.message : "Send failed" });
        }
        await pause(SINGLE_GAP_MS);
      }
    }
    await recordOutcomes(supabase, outcomes);
    sent += outcomes.filter((outcome) => !outcome.error).length;
    failed += outcomes.filter((outcome) => outcome.error).length;
    handled += chunk.length;
    if (index + BATCH_LIMIT < queue.length) await pause(Math.max(BATCH_GAP_MS, result.ok ? result.waitMs : 0));
  }

  const waiting = ready.length - handled;
  if (runId) {
    await supabase
      .from("outreach_bulk_runs")
      .update({ finished_at: new Date().toISOString(), sent, failed, left_waiting: waiting, stopped_reason: stopped?.slice(0, 500) ?? null })
      .eq("id", runId);
  }
  refreshOutreach();
  revalidatePath("/admin/outreach/schools/[id]", "page");
  const parts = [`Sent ${sent} email${sent === 1 ? "" : "s"}.`];
  parts.push(includeForm ? (noForm > 0 ? `School form link included, except ${noForm} with no matching school.` : "School form link included.") : "No form link included.");
  if (failed > 0) parts.push(`${failed} failed and stayed on the list.`);
  if (blocked.length > 0) parts.push(`${blocked.length} marked do not contact were taken off.`);
  if (stopped) parts.push(`Stopped early: ${stopped}`);
  if (waiting > 0) parts.push(`${waiting} still waiting on the list. Press send again to continue.`);
  if (sent === 0) return { error: parts.join(" ") };
  return { ok: true, message: parts.join(" "), values: runId ? { run: runId } : undefined };
}
