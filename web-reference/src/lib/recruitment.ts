export type StageOutcome = "open" | "offered" | "joined" | "closed";
export const OUTCOME_LABEL: Record<StageOutcome, string> = { open: "In progress", offered: "Offer extended", joined: "Joined", closed: "Closed" };
export const OUTCOME_TONE: Record<StageOutcome, "neutral" | "accent" | "positive" | "danger"> = { open: "neutral", offered: "accent", joined: "positive", closed: "danger" };

export type Stage = { id: string; name: string; position: number; outcome: StageOutcome };

export const ACTIVITY_KINDS = ["event", "meeting", "call", "message", "other"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABEL: Record<ActivityKind, string> = { event: "Attended an event", meeting: "Met in person", call: "Phone call", message: "Message", other: "Other" };

export type Prospect = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  class_year: number | null;
  major: string | null;
  hometown: string | null;
  source: string | null;
  interests: string[];
  stage_id: string;
  owner_membership_id: string | null;
  status: "active" | "archived";
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export const PROSPECT_COLUMNS = "id, full_name, preferred_name, email, phone, class_year, major, hometown, source, interests, stage_id, owner_membership_id, status, next_follow_up_at, created_at, updated_at";

export function parseInterests(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0 && s.length <= 40))].slice(0, 12);
}
