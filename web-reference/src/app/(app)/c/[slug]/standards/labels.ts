import type { Tone } from "@/components/ui";

export const POLICY_CATEGORY: Record<string, string> = {
  general: "General",
  risk: "Risk management",
  housing: "Housing",
  finance: "Finance",
  standards: "Standards",
  bylaws: "Bylaws",
};

export const INCIDENT_CATEGORY: Record<string, string> = {
  safety: "Safety concern",
  hazing: "Hazing",
  harassment: "Harassment",
  property: "Property damage",
  alcohol: "Alcohol or substances",
  housing: "Housing",
  other: "Other",
};

export const INCIDENT_STATUS = {
  submitted: { label: "Submitted", tone: "warning" },
  under_review: { label: "Under review", tone: "info" },
  resolved: { label: "Resolved", tone: "positive" },
  closed: { label: "Closed", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const CLASS_LABEL: Record<string, string> = { new_member: "New members", active: "Active members", associate: "Associates", alumni: "Alumni" };
