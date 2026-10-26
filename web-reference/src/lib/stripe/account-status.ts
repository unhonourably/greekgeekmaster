export type AccountSnapshot = {
  id: string;
  livemode: boolean;
  cardPayments: string;
  achPayments: string | null;
  payouts: string;
  requirementsDue: string[];
  requirementsPastDue: string[];
  disabledReason: string | null;
};

type CapabilityLike = { status?: string | null } | null | undefined;

type RequirementEntryLike = {
  description?: string | null;
  awaiting_action_from?: string | null;
  minimum_deadline?: { status?: string | null } | null;
};

export type V2AccountLike = {
  id: string;
  livemode?: boolean | null;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: CapabilityLike;
        ach_debit_payments?: CapabilityLike;
        stripe_balance?: { payouts?: CapabilityLike } | null;
      } | null;
    } | null;
  } | null;
  requirements?: { entries?: RequirementEntryLike[] | null } | null;
};

export function snapshotFromV2Account(account: V2AccountLike): AccountSnapshot {
  const caps = account.configuration?.merchant?.capabilities;
  const entries = account.requirements?.entries ?? [];
  const userEntries = entries.filter((e) => (e.awaiting_action_from ?? "user") === "user" && e.description);
  const due = userEntries.filter((e) => e.minimum_deadline?.status === "currently_due" || e.minimum_deadline?.status === "past_due");
  const pastDue = userEntries.filter((e) => e.minimum_deadline?.status === "past_due");
  const card = caps?.card_payments?.status ?? "pending";
  return {
    id: account.id,
    livemode: Boolean(account.livemode),
    cardPayments: card,
    achPayments: caps?.ach_debit_payments?.status ?? null,
    payouts: caps?.stripe_balance?.payouts?.status ?? "pending",
    requirementsDue: [...new Set(due.map((e) => e.description as string))],
    requirementsPastDue: [...new Set(pastDue.map((e) => e.description as string))],
    disabledReason: card === "restricted" || card === "rejected" || card === "unsupported" ? `card_payments_${card}` : null,
  };
}

export function describeRequirement(code: string): string {
  const known: Record<string, string> = {
    "business_profile.url": "Business website or social profile",
    "business_profile.mcc": "Business category",
    "business_profile.product_description": "Description of what the chapter collects payments for",
    "configuration.merchant.mcc": "Business category",
    "configuration.merchant.statement_descriptor.descriptor": "Text that appears on the member's bank statement",
    "configuration.merchant.support.phone": "Support phone number",
    "defaults.profile.business_url": "Business website",
    "defaults.profile.product_description": "Description of what the chapter collects payments for",
    "external_account": "Bank account for payouts",
    "identity.attestations.terms_of_service.account.date": "Acceptance of Stripe's terms",
    "identity.attestations.terms_of_service.account.ip": "Acceptance of Stripe's terms",
    "identity.entity_type": "Whether this account is a person or an organization",
    "representative.date_of_birth.day": "Date of birth of the person representing the chapter",
    "representative.date_of_birth.month": "Date of birth of the person representing the chapter",
    "representative.date_of_birth.year": "Date of birth of the person representing the chapter",
    "representative.email": "Email of the person representing the chapter",
    "representative.given_name": "First name of the person representing the chapter",
    "representative.surname": "Last name of the person representing the chapter",
    "tos_acceptance.date": "Stripe terms of service acceptance",
    "representative.verification.document": "Identity document for the account representative",
    "company.tax_id": "Employer Identification Number (EIN)",
  };
  return known[code] ?? code.replace(/[._]/g, " ");
}

export type ReadinessLabel = { tone: "positive" | "warning" | "danger" | "neutral"; label: string };

export function capabilityLabel(status: string | null | undefined): ReadinessLabel {
  switch (status) {
    case "active":
      return { tone: "positive", label: "Active" };
    case "pending":
      return { tone: "warning", label: "Pending review" };
    case "restricted":
      return { tone: "danger", label: "Restricted" };
    case "rejected":
      return { tone: "danger", label: "Rejected" };
    case "unsupported":
      return { tone: "danger", label: "Unsupported" };
    default:
      return { tone: "neutral", label: "Not started" };
  }
}
