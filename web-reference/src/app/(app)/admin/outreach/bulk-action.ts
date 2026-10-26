"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deliverBulk, OFF_BULK, queueOutreach, refreshOutreach } from "./send";
import { newContactIds, queueNewContacts, stateSchoolIds } from "./state-contacts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refreshBulk() {
  refreshOutreach();
  revalidatePath("/admin/outreach/schools/[id]", "page");
  revalidatePath("/admin/outreach/contacts/[id]", "page");
}

export async function setBulk(formData: FormData): Promise<void> {
  await requireStaff([]);
  const ids = [...new Set(formData.getAll("contact_id").map(String).filter((id) => UUID.test(id)))].slice(0, 2000);
  if (ids.length === 0) return;
  const supabase = await createClient();
  if (formData.get("on") === "1") {
    const adding = supabase.from("outreach_contacts").update({ bulk_added_at: new Date().toISOString() }).in("id", ids).eq("do_not_contact", false).is("bulk_added_at", null);
    await (ids.length > 1 ? adding.eq("emails_sent", 0) : adding);
  } else {
    await supabase.from("outreach_contacts").update(OFF_BULK).in("id", ids);
  }
  refreshBulk();
}

export async function addStateToBulk(state: string): Promise<void> {
  await requireStaff([]);
  if (!/^[A-Z]{2}$/.test(state)) return;
  const supabase = await createClient();
  await queueNewContacts(supabase, await newContactIds(supabase, await stateSchoolIds(supabase, state)));
  refreshBulk();
}

export async function saveBulkDraft(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff([]);
  const id = String(formData.get("contact_id") ?? "");
  if (!UUID.test(id)) return { error: "This email is no longer on the list." };
  if (formData.get("intent") === "template") {
    const supabase = await createClient();
    await supabase.from("outreach_contacts").update({ bulk_subject: null, bulk_body: null }).eq("id", id);
    refreshBulk();
    return { ok: true, message: "Back to the preset letter." };
  }
  const result = await queueOutreach(id, formData);
  return result.ok ? { ok: true, message: "Saved." } : result;
}

export async function clearBulk(): Promise<void> {
  await requireStaff([]);
  const supabase = await createClient();
  await supabase.from("outreach_contacts").update(OFF_BULK).not("bulk_added_at", "is", null);
  refreshBulk();
}

export async function sendBulk(_: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireStaff([]);
  return deliverBulk(user.id, formData.get("include_form") === "on");
}
