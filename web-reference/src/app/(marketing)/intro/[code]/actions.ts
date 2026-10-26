"use server";

import type { ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

function numberOrNull(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 5000) return Number.NaN;
  return value;
}

export async function submitIntro(code: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const members = numberOrNull(formData, "member_count");
  const inHouse = numberOrNull(formData, "in_house");
  const outHouse = numberOrNull(formData, "out_of_house");
  const preferEmail = formData.get("prefer_email") === "on";
  const preferText = formData.get("prefer_text") === "on";
  const preferCall = formData.get("prefer_call") === "on";
  const phone = String(formData.get("phone") ?? "").trim();
  if (Number.isNaN(members) || Number.isNaN(inHouse) || Number.isNaN(outHouse)) return { error: "Membership numbers have to be whole numbers." };
  if (members === null) return { error: "Enter about how many members the chapter has." };
  if (!preferEmail && !preferText && !preferCall) return { error: "Choose email, text, a call, or more than one." };
  if ((preferText || preferCall) && phone.length < 7) return { error: "Add a phone number so we can text or call." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_intro", {
    p_code: code,
    p_full_name: String(formData.get("full_name") ?? ""),
    p_role: String(formData.get("role") ?? ""),
    p_organization: String(formData.get("organization") ?? ""),
    p_council: String(formData.get("council") ?? ""),
    p_member_count: members,
    p_in_house: inHouse,
    p_out_of_house: outHouse,
    p_dues: String(formData.get("dues") ?? ""),
    p_email: String(formData.get("email") ?? ""),
    p_phone: phone,
    p_prefer_email: preferEmail,
    p_prefer_text: preferText,
    p_prefer_call: preferCall,
    p_best_time: String(formData.get("best_time") ?? ""),
    p_interest: String(formData.get("interest") ?? ""),
    p_help: formData.getAll("help").map(String),
    p_notes: String(formData.get("notes") ?? ""),
  });
  if (error) {
    if (/too many/i.test(error.message)) return { error: "That email was just submitted. Give it an hour and try again." };
    if (/page not found/i.test(error.message)) return { error: "This link is no longer valid." };
    if (/check constraint|22023|null value/i.test(error.message)) return { error: "Check the name, role, organization, and email, then try again." };
    return { error: "The form could not be saved." };
  }
  return { ok: true, message: "Thank you. Amare and Owen will follow up the way you asked." };
}
