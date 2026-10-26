import type { Tone } from "@/components/ui";

export const REIMBURSEMENT_STATUS = {
  submitted: { label: "Awaiting review", tone: "warning" },
  approved: { label: "Approved, not yet paid", tone: "info" },
  rejected: { label: "Not approved", tone: "danger" },
  paid: { label: "Paid", tone: "positive" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export type ReimbursementStatus = keyof typeof REIMBURSEMENT_STATUS;
