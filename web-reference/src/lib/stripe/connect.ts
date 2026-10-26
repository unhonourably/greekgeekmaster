import "server-only";
import { stripe } from "@/lib/stripe/client";
import { adminRpc } from "@/lib/supabase/admin";
import { snapshotFromV2Account, type AccountSnapshot, type V2AccountLike } from "@/lib/stripe/account-status";

export async function createConnectedAccount(input: {
  chapterId: string;
  displayName: string;
  contactEmail: string;
  createdBy: string;
}): Promise<string> {
  const account = await stripe().v2.core.accounts.create(
    {
      display_name: input.displayName.slice(0, 100),
      contact_email: input.contactEmail,
      identity: { country: "us" },
      dashboard: "full",
      defaults: {
        currency: "usd",
        responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
        profile: {
          business_url: "https://greekgeek.org",
          product_description: "Chapter dues, event fees, and other payments collected from members.",
        },
      },
      configuration: {
        merchant: {
          mcc: "8641",
          statement_descriptor: { descriptor: "GREEKGEEK", prefix: "GG" },
          capabilities: {
            card_payments: { requested: true },
            ach_debit_payments: { requested: true },
          },
        },
      },
      metadata: { chapter_id: input.chapterId },
      include: ["configuration.merchant", "requirements"],
    },
    { idempotencyKey: `connect-account:${input.chapterId}` },
  );
  const snap = snapshotFromV2Account(account as unknown as V2AccountLike);
  await saveSnapshot(snap, input.chapterId, input.createdBy);
  return account.id;
}

export async function retrieveAccountSnapshot(accountId: string): Promise<AccountSnapshot> {
  const account = await stripe().v2.core.accounts.retrieve(accountId, { include: ["configuration.merchant", "requirements"] });
  return snapshotFromV2Account(account as unknown as V2AccountLike);
}

export async function saveSnapshot(snap: AccountSnapshot, chapterId: string | null, createdBy: string | null = null): Promise<void> {
  await adminRpc()("service_upsert_connected_account", {
    p_chapter: chapterId,
    p_account: snap.id,
    p_livemode: snap.livemode,
    p_card_status: snap.cardPayments,
    p_ach_status: snap.achPayments,
    p_payouts_status: snap.payouts,
    p_requirements_due: snap.requirementsDue,
    p_requirements_past_due: snap.requirementsPastDue,
    p_disabled_reason: snap.disabledReason,
    p_created_by: createdBy,
  });
}

export async function syncConnectedAccount(accountId: string): Promise<AccountSnapshot> {
  const snap = await retrieveAccountSnapshot(accountId);
  await saveSnapshot(snap, null);
  return snap;
}

export async function createOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<string> {
  const link = await stripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  });
  return link.url;
}
