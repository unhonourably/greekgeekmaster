export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "partially_refunded",
  "refunded",
  "disputed",
  "dispute_lost",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["processing", "succeeded", "failed", "canceled"],
  processing: ["succeeded", "failed", "canceled"],
  canceled: ["processing", "succeeded"],
  failed: ["succeeded"],
  succeeded: ["partially_refunded", "refunded", "disputed"],
  partially_refunded: ["refunded", "disputed"],
  disputed: ["succeeded", "partially_refunded", "refunded", "dispute_lost"],
  refunded: [],
  dispute_lost: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isCollected(status: PaymentStatus): boolean {
  return status === "succeeded" || status === "partially_refunded" || status === "disputed";
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Awaiting payment",
  processing: "Processing",
  succeeded: "Paid",
  failed: "Failed",
  canceled: "Canceled",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  disputed: "Disputed",
  dispute_lost: "Dispute lost",
};

export function paymentTone(status: string): "positive" | "info" | "danger" | "warning" | "neutral" {
  switch (status) {
    case "succeeded":
      return "positive";
    case "processing":
      return "info";
    case "failed":
    case "dispute_lost":
    case "disputed":
      return "danger";
    case "partially_refunded":
    case "refunded":
      return "warning";
    default:
      return "neutral";
  }
}

export function paymentMethodLabel(kind: string, method: string): string {
  if (kind === "offline") {
    return { cash: "Cash", check: "Check", external_app: "Other app", other: "Other" }[method] ?? "Offline";
  }
  return method === "us_bank_account" ? "Bank (ACH)" : method === "card" ? "Card" : method === "link" ? "Link" : "Online";
}
