"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deliverOutreach, matchSchools, queueOutreach } from "./send";

export async function sendOutreachLetter(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  const id = String(formData.get("contact_id") ?? "");
  return formData.get("intent") === "queue" ? queueOutreach(id, formData) : deliverOutreach(user.id, id, formData);
}

const customSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  full_name: z.string().trim().max(120).transform((value) => (value.length >= 2 ? value : null)),
  role: z.string().trim().max(80).transform((value) => (value.length >= 2 ? value : "Contact")),
  organization: z.string().trim().min(2, "Enter the council, chapter, or office.").max(120),
  university: z.string().trim().min(2, "Enter the university.").max(160),
});

const PLACEHOLDER = /\[(?:Organization|University|Name)\]/;

export async function sendCustomOutreach(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  const values = Object.fromEntries(["email", "full_name", "role", "organization", "university", "subject", "body"].map((key) => [key, String(formData.get(key) ?? "")]));
  const parsed = customSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])), values };
  }
  if (PLACEHOLDER.test(values.subject) || PLACEHOLDER.test(values.body)) {
    return { error: "The email still has a [placeholder] in it. Replace it before sending.", values };
  }
  const supabase = await createClient();
  const email = parsed.data.email.toLowerCase();
  const { data: existing } = await supabase.from("outreach_contacts").select("id, do_not_contact").eq("email_normalized", email).maybeSingle();
  let contactId = existing?.id ?? null;
  if (existing?.do_not_contact) return { error: `${parsed.data.email} is marked do not contact.`, values };
  if (!contactId) {
    const school = (await matchSchools(supabase, [email])).get(email);
    const { data: created, error } = await supabase
      .from("outreach_contacts")
      .insert({ email: parsed.data.email, full_name: parsed.data.full_name, role: parsed.data.role, organization: parsed.data.organization, university: parsed.data.university, university_id: school?.id ?? null, created_by: user.id })
      .select("id")
      .single();
    if (error || !created) return { error: "The contact could not be saved, so nothing was sent.", values };
    contactId = created.id;
  }
  const result = formData.get("intent") === "queue" ? await queueOutreach(contactId, formData) : await deliverOutreach(user.id, contactId, formData);
  return result.ok ? result : { ...result, values };
}
