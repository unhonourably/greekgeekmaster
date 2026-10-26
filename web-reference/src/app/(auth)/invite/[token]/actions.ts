"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { invitationHash } from "@/lib/invitations";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

export async function acceptInvitation(token: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  if (!rateLimit(`accept:${user.id}`, 20, 15 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  const recruiter = String(formData.get("recruiter") ?? "");
  const recruiterArgs = z.uuid().safeParse(recruiter).success
    ? { p_recruited_by: recruiter, p_recruiter_answered: true }
    : recruiter === "unsure"
      ? { p_recruiter_answered: true }
      : {};
  const supabase = await createClient();
  const { data: chapterId, error } = await supabase.rpc("accept_chapter_invitation", { p_token_hash: invitationHash(token), ...recruiterArgs });
  if (error) return { error: dbErrorMessage(error) };
  const { data: chapter } = await supabase.from("chapters").select("slug").eq("id", chapterId as string).single();
  redirect(chapter ? `/c/${chapter.slug}?welcome=1` : "/home");
}
