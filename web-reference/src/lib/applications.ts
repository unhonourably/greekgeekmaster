import type { Tone } from "@/components/ui";

export type ApplicationStatus = "draft" | "pending_verification" | "info_requested" | "verified" | "rejected" | "suspended" | "withdrawn";
export type ApplicationKind = "new_chapter" | "claim_existing" | "recovery";
export type VerificationMethod = "institutional_email" | "officer_invitation" | "national_organization" | "university_fsl" | "officer_documentation" | "manual_review";

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_verification: { label: "Under review", tone: "info" },
  info_requested: { label: "Information requested", tone: "warning" },
  verified: { label: "Verified", tone: "positive" },
  rejected: { label: "Not approved", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const APPLICATION_KIND_LABEL: Record<ApplicationKind, string> = {
  new_chapter: "New chapter",
  claim_existing: "Claim a listed chapter",
  recovery: "Recover administrator access",
};

export const VERIFICATION_METHODS: Array<{ value: VerificationMethod; label: string; description: string }> = [
  { value: "institutional_email", label: "School email", description: "Confirm a code sent to your university email address. Fastest when your school's domain is on file." },
  { value: "national_organization", label: "National organization", description: "We contact your national or international headquarters to confirm you are a current officer." },
  { value: "university_fsl", label: "Fraternity and sorority life office", description: "We contact your campus FSL office to confirm the chapter and your role." },
  { value: "officer_documentation", label: "Officer documentation", description: "Upload a roster, election minutes, or a letter that shows you hold an officer position." },
  { value: "manual_review", label: "Manual review", description: "A reviewer contacts you to work out another way to confirm the chapter." },
];

export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = {
  institutional_email: "School email",
  officer_invitation: "Officer invitation",
  national_organization: "National organization",
  university_fsl: "FSL office",
  officer_documentation: "Officer documentation",
  manual_review: "Manual review",
};

export const INTENDED_ROLES = [
  { value: "president", label: "President" },
  { value: "vice_president", label: "Vice president" },
  { value: "treasurer", label: "Treasurer" },
  { value: "secretary", label: "Secretary" },
  { value: "recruitment_chair", label: "Recruitment chair" },
  { value: "risk_management_chair", label: "Risk management chair" },
  { value: "advisor", label: "Chapter advisor" },
  { value: "other_officer", label: "Other officer" },
] as const;

export const EVENT_LABEL: Record<string, string> = {
  created: "Application started",
  submitted: "Submitted for review",
  info_requested: "Reviewer requested information",
  applicant_response: "You responded",
  evidence_uploaded: "Document uploaded",
  approved: "Chapter verified",
  rejected: "Application not approved",
  suspended: "Chapter suspended",
  appealed: "Appeal submitted",
  withdrawn: "Application withdrawn",
  note: "Reviewer note",
  email_verified: "School email confirmed",
  duplicate_flagged: "Possible duplicate flagged",
  reopened: "Application reopened",
};

export function isEditable(status: ApplicationStatus): boolean {
  return status === "draft" || status === "info_requested";
}
