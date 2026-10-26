"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMyProfile, requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { createAndSendInvitation, parseMemberCsv } from "@/lib/invitations";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";
import { setupLockState, setupLocked } from "@/lib/setup-access";
import type { MemberClass } from "@/lib/permissions";

const CLASSES = ["new_member", "active", "associate", "alumni"] as const;

export async function inviteMember(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireChapter(slug, "members.manage");
  const blocked = await setupLockState(ctx.chapter.id);
  if (blocked) return blocked;
  if (ctx.chapter.status !== "verified") return { error: "Only verified chapters can invite members." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const memberClass = z.enum(CLASSES).catch("active").parse(formData.get("member_class"));
  const roleKeys = formData.getAll("roles").map(String).filter((k) => /^[a-z0-9_]{2,40}$/.test(k));
  const values = { email, full_name: fullName };
  if (!z.email().safeParse(email).success) return { fieldErrors: { email: "Enter a valid email address" }, values };
  if (!rateLimit(`invite:${ctx.user.id}`, 60, 60 * 60_000)) return { error: "Too many invitations in the last hour.", values };
  const supabase = await createClient();
  const { data, error: addError } = await supabase.rpc("add_existing_member", { p_chapter: ctx.chapter.id, p_email: email, p_member_class: memberClass });
  if (addError && addError.code !== "PGRST202") return { error: dbErrorMessage(addError), values };
  const added = (data ?? null) as { status: "added" | "already_member" | "no_account"; membership_id?: string } | null;
  if (added?.status === "already_member") return { fieldErrors: { email: "This person is already an active member" }, values };
  if (added?.status === "added" && added.membership_id) {
    const skipped = await assignRoles(supabase, ctx.chapter.id, ctx.user.id, added.membership_id, roleKeys);
    revalidatePath(`/c/${slug}`, "layout");
    return { ok: true, message: `${fullName || email} already had an account and is now on the roster. They have been notified.${skipped ? ` ${skipped} role${skipped === 1 ? "" : "s"} could not be assigned; set them from the member page.` : ""}` };
  }
  const profile = await getMyProfile();
  const result = await createAndSendInvitation(supabase, ctx.chapter, profile?.full_name || "A chapter officer", { email, fullName: fullName || null, memberClass, roleKeys });
  if (!result.ok) return { error: dbErrorMessage(result.error), values };
  revalidatePath(`/c/${slug}/settings/members`);
  return {
    ok: true,
    message: result.delivered
      ? `No account uses ${email} yet, so we emailed an invitation. They join as soon as they sign up with that address. You can also send them the link below.`
      : `No account uses ${email} yet. Email is not set up on this server, so send them the link below. They join as soon as they sign up with that address.`,
    values: { link: result.link },
  };
}

async function assignRoles(supabase: Awaited<ReturnType<typeof createClient>>, chapterId: string, assignedBy: string, membershipId: string, roleKeys: string[]): Promise<number> {
  if (roleKeys.length === 0) return 0;
  const { data: roles } = await supabase.from("roles").select("id, key").eq("chapter_id", chapterId).in("key", roleKeys);
  let skipped = roleKeys.length - (roles ?? []).length;
  for (const r of roles ?? []) {
    const { error } = await supabase.from("role_assignments").insert({ chapter_id: chapterId, membership_id: membershipId, role_id: r.id, assigned_by: assignedBy });
    if (error && error.code !== "23505") skipped += 1;
  }
  return skipped;
}

export async function importMembers(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireChapter(slug, "members.manage");
  const blocked = await setupLockState(ctx.chapter.id);
  if (blocked) return blocked;
  if (ctx.chapter.status !== "verified") return { error: "Only verified chapters can invite members." };
  const file = formData.get("file");
  let text = String(formData.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 512 * 1024) return { error: "CSV files must be under 512 KB." };
    text = await file.text();
  }
  if (!text.trim()) return { error: "Paste rows or choose a CSV file." };
  const { rows, errors } = parseMemberCsv(text);
  if (rows.length === 0) return { error: errors[0] ?? "No rows found." };
  if (formData.get("confirm") !== "yes") {
    return {
      ok: false,
      message: `Ready to invite ${rows.length} ${rows.length === 1 ? "person" : "people"}.${errors.length ? ` ${errors.length} row${errors.length === 1 ? "" : "s"} will be skipped.` : ""}`,
      values: { preview: JSON.stringify({ rows: rows.slice(0, 200), errors: errors.slice(0, 50) }), csv: text },
    };
  }
  if (!rateLimit(`import:${ctx.user.id}`, 5, 60 * 60_000)) return { error: "Too many imports in the last hour." };
  const supabase = await createClient();
  const profile = await getMyProfile();
  const batch = randomUUID();
  let sent = 0;
  const failures: string[] = [...errors];
  for (const r of rows) {
    const result = await createAndSendInvitation(supabase, ctx.chapter, profile?.full_name || "A chapter officer", { email: r.email, fullName: r.fullName, memberClass: r.memberClass, roleKeys: [] }, batch);
    if (result.ok) sent += 1;
    else failures.push(`Line ${r.line}: ${dbErrorMessage(result.error)}`);
  }
  revalidatePath(`/c/${slug}/settings/members`);
  return {
    ok: true,
    message: `Sent ${sent} invitation${sent === 1 ? "" : "s"}.${failures.length ? ` ${failures.length} skipped.` : ""}`,
    values: { failures: JSON.stringify(failures.slice(0, 50)) },
  };
}

export async function revokeInvitation(slug: string, invitationId: string): Promise<void> {
  const { chapter } = await requireChapter(slug, "members.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("chapter_invitations").update({ status: "revoked" }).eq("id", invitationId).eq("chapter_id", chapter.id).eq("status", "pending");
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/c/${slug}/settings/members`);
}

export async function removeMember(slug: string, membershipId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug, "members.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { fieldErrors: { reason: "Give a reason" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_chapter_member", { p_membership: membershipId, p_reason: reason.slice(0, 300) });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/settings/members`);
}

export async function updateMember(slug: string, membershipId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug, "members.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const memberClass = z.enum(CLASSES).safeParse(formData.get("member_class"));
  const status = z.enum(["active", "inactive", "suspended", "ended"]).safeParse(formData.get("status"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!memberClass.success || !status.success) return { error: "Choose a class and status." };
  if ((status.data === "ended" || status.data === "suspended") && reason.length < 3) return { fieldErrors: { reason: "Give a reason" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_membership", { p_membership: membershipId, p_member_class: memberClass.data as MemberClass, p_status: status.data, p_reason: reason || null });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Member updated." };
}

export async function assignRole(slug: string, membershipId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireChapter(slug, "roles.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const roleId = String(formData.get("role_id") ?? "");
  if (!z.uuid().safeParse(roleId).success) return { error: "Choose a role." };
  const supabase = await createClient();
  const { error } = await supabase.from("role_assignments").insert({ chapter_id: chapter.id, membership_id: membershipId, role_id: roleId, assigned_by: user.id });
  if (error) return { error: error.code === "23505" ? "This member already holds that role." : dbErrorMessage(error) };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: "Role assigned." };
}

export async function endRole(slug: string, assignmentId: string): Promise<void> {
  const { chapter, user } = await requireChapter(slug, "roles.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("role_assignments")
    .update({ ends_at: new Date().toISOString(), ended_by: user.id, end_reason: "Removed by officer" })
    .eq("id", assignmentId)
    .eq("chapter_id", chapter.id)
    .is("ends_at", null);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/c/${slug}`, "layout");
}

export async function setRecruiter(slug: string, membershipId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireChapter(slug, "members.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const raw = String(formData.get("recruiter") ?? "");
  const recruiter = z.uuid().safeParse(raw).success ? raw : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_recruiter", { p_membership: membershipId, p_recruiter: recruiter });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/c/${slug}/settings/members`, "layout");
  revalidatePath(`/c/${slug}`);
  return { ok: true, message: recruiter ? "Recruiter saved." : "Recruiter cleared." };
}
