import type { Tone } from "@/components/ui";

export const PRIORITY = {
  low: { label: "Low", tone: "neutral" },
  normal: { label: "Normal", tone: "info" },
  high: { label: "High", tone: "warning" },
  urgent: { label: "Urgent", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const MAINTENANCE_STATUS = {
  open: { label: "Open", tone: "warning" },
  in_progress: { label: "In progress", tone: "info" },
  resolved: { label: "Resolved", tone: "positive" },
  closed: { label: "Closed", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const SUPPLY_STATUS = {
  requested: { label: "Requested", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  fulfilled: { label: "Fulfilled", tone: "positive" },
  declined: { label: "Declined", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const REQUEST_STATUS = {
  submitted: { label: "Submitted", tone: "info" },
  waitlisted: { label: "Waitlisted", tone: "warning" },
  placed: { label: "Placed", tone: "positive" },
  declined: { label: "Not placed", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export type Room = { id: string; name: string; floor: string | null; capacity: number; rent_cents: number | null; features: string[]; notes: string | null; archived_at: string | null };
export type Assignment = { id: string; room_id: string; membership_id: string; bed_label: string | null; starts_on: string; ends_on: string | null; end_reason: string | null };

export function isCurrent(a: Assignment, today: string): boolean {
  return a.starts_on <= today && (a.ends_on === null || a.ends_on >= today);
}

export function isUpcoming(a: Assignment, today: string): boolean {
  return a.starts_on > today;
}

export const FACILITY_KIND: Record<string, string> = {
  house: "House",
  room: "Room",
  common_area: "Common area",
  parking: "Parking",
  other: "Other",
};
