const LABELS: Record<string, string> = {
  "membership.updated": "Changed membership",
  "role.assigned": "Assigned a role",
  "role.ended": "Removed a role",
  "role.created": "Created a role",
  "role.updated": "Edited a role",
  "role.deleted": "Deleted a role",
  "invitation.created": "Sent an invitation",
  "invitation.accepted": "Accepted an invitation",
  "invitation.revoked": "Revoked an invitation",
  "chapter.ownership_transferred": "Granted administrator access",
  "chapter.status_changed": "Chapter status changed",
  "chapter.verified": "Chapter verified",
  "agreement.accepted": "Accepted the platform agreement",
  "assessment.issued": "Issued an assessment",
  "assessment.voided": "Voided a charge",
  "credit.issued": "Issued a credit",
  "payment.offline_recorded": "Recorded an offline payment",
  "refund.requested": "Requested a refund",
  "installment_plan.created": "Created an installment plan",
  "installment_plan.canceled": "Canceled an installment plan",
  "message.moderated": "Moderated a message",
  "policy.published": "Published a policy",
};

export function auditLabel(action: string): string {
  return LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export const ACTOR_KIND_LABEL: Record<string, string> = {
  user: "Member",
  platform_staff: "Platform staff",
  system: "System",
  stripe: "Stripe",
};
