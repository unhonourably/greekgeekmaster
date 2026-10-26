export const EVENT_CATEGORIES = ["chapter", "meeting", "social", "philanthropy", "recruitment", "academic", "brotherhood_sisterhood", "other"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  chapter: "Chapter",
  meeting: "Meeting",
  social: "Social",
  philanthropy: "Philanthropy",
  recruitment: "Recruitment",
  academic: "Academic",
  brotherhood_sisterhood: "Brotherhood / sisterhood",
  other: "Other",
};

export type RsvpStatus = "going" | "maybe" | "not_going";
export const RSVP_LABEL: Record<RsvpStatus, string> = { going: "Going", maybe: "Maybe", not_going: "Not going" };

export type AttendanceStatus = "present" | "late" | "excused" | "absent";
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };
export const ATTENDANCE_TONE: Record<AttendanceStatus, "positive" | "warning" | "info" | "danger"> = { present: "positive", late: "warning", excused: "info", absent: "danger" };

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  starts_at: string;
  ends_at: string;
  timezone: string;
  visibility: "chapter" | "officers";
  attendance_required: boolean;
  required_classes: string[];
  capacity: number | null;
  rsvp_deadline: string | null;
  cancelled_at: string | null;
  created_by: string;
  image_paths: string[];
};

export const EVENT_COLUMNS = "id, title, description, location, category, starts_at, ends_at, timezone, visibility, attendance_required, required_classes, capacity, rsvp_deadline, cancelled_at, created_by, image_paths";

export function checkInOpen(e: Pick<EventRow, "starts_at" | "ends_at" | "cancelled_at">, now: number): boolean {
  if (e.cancelled_at) return false;
  return now >= new Date(e.starts_at).getTime() - 60 * 60_000 && now <= new Date(e.ends_at).getTime() + 30 * 60_000;
}
