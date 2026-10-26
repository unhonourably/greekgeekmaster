import "server-only";
import type { ActionState } from "@/lib/action-state";
import { getStaffRole } from "@/lib/auth";
import { getReadiness, subscriptionInGoodStanding } from "@/lib/readiness";

export const SETUP_LOCK_MESSAGE = "Start the chapter subscription before changing this.";

export async function setupLocked(chapterId: string): Promise<boolean> {
  if ((await getStaffRole()) === "admin") return false;
  const readiness = await getReadiness(chapterId);
  return !subscriptionInGoodStanding(readiness?.subscription ?? "none");
}

export async function setupLockState(chapterId: string): Promise<ActionState | null> {
  if (!(await setupLocked(chapterId))) return null;
  return { error: SETUP_LOCK_MESSAGE };
}
