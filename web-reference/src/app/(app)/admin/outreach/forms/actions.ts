"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireStaff } from "@/lib/auth";
import { FORM_STATUSES, type FormStatus } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/server";
import { contactForResponse, deliverOutreach } from "../send";

function refreshForms(id: string) {
  revalidatePath("/admin/outreach/forms");
  revalidatePath(`/admin/outreach/forms/${id}`);
  revalidatePath("/admin", "layout");
}

function missingColumns(message: string | undefined): boolean {
  return /status|read_at|admin_notes|contact_id|schema cache|permission denied/i.test(message ?? "");
}

export async function markFormUnread(id: string): Promise<void> {
  await requireStaff([]);
  const supabase = await createClient();
  await supabase.from("intro_responses").update({ read_at: null }).eq("id", id);
  refreshForms(id);
}

export async function setFormStatus(id: string, status: FormStatus): Promise<void> {
  await requireStaff([]);
  if (!FORM_STATUSES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("intro_responses").update({ status, status_changed_at: new Date().toISOString() }).eq("id", id);
  refreshForms(id);
}

export async function saveFormNotes(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff([]);
  const notes = String(formData.get("admin_notes") ?? "").trim();
  if (notes.length > 4000) return { error: "Keep notes under 4,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("intro_responses").update({ admin_notes: notes || null }).eq("id", id);
  if (error) return { error: missingColumns(error.message) ? "The forms migration is not on this database yet. Run npx supabase db push." : "The notes could not be saved." };
  refreshForms(id);
  return { ok: true, message: "Notes saved." };
}

export async function replyToForm(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  const supabase = await createClient();
  const contact = await contactForResponse(supabase, user.id, id);
  if ("error" in contact) return { error: contact.error };
  const result = await deliverOutreach(user.id, contact.id, formData);
  if (result.ok) {
    await supabase.from("intro_responses").update({ status: "contacted", status_changed_at: new Date().toISOString() }).eq("id", id).eq("status", "new");
    refreshForms(id);
  }
  return result;
}
