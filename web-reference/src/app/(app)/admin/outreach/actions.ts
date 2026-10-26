"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireStaff } from "@/lib/auth";
import { parseContacts, zonedInputToIso } from "@/lib/outreach";
import { photoSlot, usablePhoto, wikipediaPhoto } from "@/lib/university-photo";
import { createClient } from "@/lib/supabase/server";
import { gatherSchool } from "./gather";
import { deliverOutreach, introCode, randomCode, refreshOutreach } from "./send";

const contactSchema = z.object({
  university: z.string().trim().min(2, "Enter the university.").max(160),
  organization: z.string().trim().min(2, "Enter the council or office.").max(120),
  role: z.string().trim().min(2, "Enter the role.").max(80),
  full_name: z.string().trim().max(120).transform((value) => (value.length >= 2 ? value : null)),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  source_url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), "Links must start with http:// or https://.")
    .transform((value) => value || null),
  notes: z.string().trim().max(4000).transform((value) => value || null),
});

function readContact(formData: FormData) {
  return contactSchema.safeParse({
    university: String(formData.get("university") ?? ""),
    organization: String(formData.get("organization") ?? ""),
    role: String(formData.get("role") ?? ""),
    full_name: String(formData.get("full_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    source_url: String(formData.get("source_url") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

function duplicate(message: string | undefined): boolean {
  return /duplicate|unique/i.test(message ?? "");
}

function refresh(id?: string, schoolId?: string | null) {
  refreshOutreach(id, schoolId);
}

export async function addContact(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  const parsed = readContact(formData);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_contacts").insert({ ...parsed.data, created_by: user.id });
  if (error) return { error: duplicate(error.message) ? "That email is already in your contacts." : "The contact could not be saved." };
  refresh();
  return { ok: true, message: `${parsed.data.email} added.` };
}

export async function importContacts(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  const { contacts, skipped } = parseContacts(String(formData.get("rows") ?? ""));
  if (contacts.length === 0) return { error: "No usable rows. Each line needs at least a university and an email." };
  if (contacts.length > 2000) return { error: "Import at most 2,000 rows at a time." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_contacts")
    .upsert(contacts.map((contact) => ({ ...contact, created_by: user.id })), { onConflict: "email_normalized", ignoreDuplicates: true })
    .select("id");
  if (error) return { error: "The import could not be saved." };
  const added = data?.length ?? 0;
  const existing = contacts.length - added;
  refresh();
  const parts = [`${added} added`];
  if (existing > 0) parts.push(`${existing} already in your contacts`);
  if (skipped.length > 0) parts.push(`skipped line${skipped.length === 1 ? "" : "s"} ${skipped.slice(0, 12).join(", ")}${skipped.length > 12 ? "…" : ""}`);
  return { ok: true, message: `${parts.join(", ")}.` };
}

export async function updateContact(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff([]);
  const parsed = readContact(formData);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_contacts").update(parsed.data).eq("id", id);
  if (error) return { error: duplicate(error.message) ? "Another contact already uses that email." : "The contact could not be saved." };
  refresh(id);
  return { ok: true, message: "Contact saved." };
}

export async function setDoNotContact(id: string, value: boolean): Promise<void> {
  await requireStaff([]);
  const supabase = await createClient();
  await supabase.from("outreach_contacts").update({ do_not_contact: value }).eq("id", id);
  refresh(id);
}

export async function deleteContact(id: string): Promise<void> {
  await requireStaff([]);
  const supabase = await createClient();
  await supabase.from("outreach_contacts").delete().eq("id", id);
  refresh();
  redirect("/admin/outreach");
}

export async function sendOutreach(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  return deliverOutreach(user.id, id, formData);
}

export async function logReply(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  const at = zonedInputToIso(String(formData.get("occurred_at") ?? ""));
  const body = String(formData.get("body") ?? "").trim();
  if (!at) return { error: "Pick when the reply came in." };
  if (new Date(at).getTime() > Date.now() + 5 * 60 * 1000) return { error: "That time is in the future." };
  const supabase = await createClient();
  const { error } = await supabase.from("outreach_emails").insert({
    contact_id: id,
    direction: "reply",
    status: "received",
    subject: String(formData.get("subject") ?? "").trim().slice(0, 300),
    body: body || "Reply logged by hand. No text was pasted.",
    logged_by_hand: true,
    sent_by: user.id,
    occurred_at: at,
    read_at: new Date().toISOString(),
  });
  if (error) return { error: "The reply could not be saved." };
  refresh(id);
  return { ok: true, message: "Reply logged." };
}

export async function ensureIntroCode(universityId: string): Promise<string> {
  await requireStaff([]);
  return introCode(await createClient(), universityId);
}

export async function createIntroForm(universityId: string): Promise<void> {
  await requireStaff([]);
  await introCode(await createClient(), universityId);
  revalidatePath("/admin/outreach/forms/links");
}

export async function loadSchoolPhoto(universityId: string): Promise<string | null> {
  await requireStaff([]);
  const supabase = await createClient();
  const { data: saved } = await supabase.from("university_outreach").select("image_url, image_checked_at").eq("university_id", universityId).maybeSingle();
  const fresh = saved?.image_checked_at && Date.now() - new Date(saved.image_checked_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  if (fresh && saved.image_url && !saved.image_url.includes("/640px-")) return saved.image_url;
  if (fresh && !saved.image_url) return null;
  const { data: school } = await supabase.from("universities").select("name, city").eq("id", universityId).maybeSingle();
  if (!school) return null;
  let photo: { url: string; page: string } | null = null;
  try {
    photo = await photoSlot(async () => {
      const found = await wikipediaPhoto(school.name, school.city);
      if (!found || !(await usablePhoto(found.url))) return null;
      return found;
    });
  } catch {
    return saved?.image_url && !saved.image_url.includes("/640px-") ? saved.image_url : null;
  }
  const patch = { image_url: photo?.url ?? null, image_page: photo?.page ?? null, image_checked_at: new Date().toISOString() };
  if (saved) await supabase.from("university_outreach").update(patch).eq("university_id", universityId);
  else await supabase.from("university_outreach").insert({ university_id: universityId, intro_code: randomCode(), ...patch });
  return photo?.url ?? null;
}

export async function gatherUniversity(universityId: string): Promise<void> {
  await requireStaff([]);
  const summary = await gatherSchool(await createClient(), universityId);
  redirect(summary.status === "missing" ? "/admin/outreach" : `/admin/outreach/schools/${universityId}`);
}

export async function deleteLoggedReply(contactId: string, emailId: string): Promise<void> {
  await requireStaff([]);
  const supabase = await createClient();
  await supabase.from("outreach_emails").delete().eq("id", emailId).eq("contact_id", contactId).eq("logged_by_hand", true);
  refresh(contactId);
}
