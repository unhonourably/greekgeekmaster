import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { ChapterCosts } from "@/components/chapter-costs";
import { Badge, Card, CardBody, CardHeader, Money, Notice, Table, Td, Th, TextLink, Tr, cx } from "@/components/ui";
import { ExternalActionForm, ExternalSubmitButton, SubmitButton } from "@/components/forms";
import { getMyProfile, getStaffRole, requireChapter } from "@/lib/auth";
import { getChapterPricing } from "@/lib/chapter-pricing";
import { isStripeConfigured, isStripeLiveMode } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { getPublishedTerms } from "@/lib/pricing";
import { getReadiness, SUBSCRIPTION_STATUS_LABEL, subscriptionInGoodStanding } from "@/lib/readiness";
import { capabilityLabel, describeRequirement } from "@/lib/stripe/account-status";
import { createClient } from "@/lib/supabase/server";
import { acceptAgreement, openBillingPortal, refreshConnectStatus, startAdminSubscription, startConnectOnboarding, startSubscription } from "./actions";
import { ADMIN_SUBSCRIPTION_CENTS } from "@/lib/stripe/subscription";
import { AgreementForm } from "./agreement-form";

export const metadata: Metadata = { title: "Billing and payments" };

const ERRORS: Record<string, string> = {
  stripe: "Stripe is not configured on this server. Add STRIPE_SECRET_KEY to the environment.",
  agreement: "Accept the chapter agreement first.",
  verified: "The chapter must be verified before connecting Stripe.",
  portal: "There is no billing account yet. Activate the subscription first.",
};

function Step({ n, done, title, children, current }: { n: number; done: boolean; current: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="group relative flex gap-4 pb-8 last:pb-0">
      <span className="absolute left-[13px] top-8 h-[calc(100%-2rem)] w-px bg-line group-last:hidden" aria-hidden />
      <span
        className={cx(
          "relative grid size-7 shrink-0 place-items-center rounded-full border text-[12px] font-semibold",
          done ? "border-accent bg-accent text-on-accent" : current ? "border-accent bg-surface text-accent" : "border-line-strong bg-surface text-ink-3",
        )}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className={cx("text-sm font-semibold", done || current ? "text-ink" : "text-ink-3")}>{title}</h3>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  );
}

export default async function BillingPage({ params, searchParams }: PageProps<"/c/[slug]/settings/billing">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug);
  const { chapter, can } = ctx;
  const platformAdmin = (await getStaffRole()) === "admin";
  if (!can("chapter.manage") && !can("payments.configure") && !can("finance.view")) forbidden();

  const supabase = await createClient();
  const [readiness, pricing, terms, profile, { data: agreement }, { data: subscription }, { data: invoices }, { data: account }] = await Promise.all([
    getReadiness(chapter.id),
    getChapterPricing(chapter.id),
    getPublishedTerms("chapter_agreement"),
    getMyProfile(),
    supabase
      .from("chapter_agreements")
      .select("signer_name, signer_title, accepted_at, terms:terms_documents(version, title)")
      .eq("chapter_id", chapter.id)
      .is("superseded_at", null)
      .maybeSingle(),
    supabase
      .from("chapter_subscriptions")
      .select("status, unit_amount_cents, billing_interval, current_period_end, cancel_at_period_end")
      .eq("chapter_id", chapter.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("saas_invoices").select("stripe_invoice_id, amount_paid_cents, status, paid_at, created_at").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("connected_accounts").select("stripe_account_id, livemode, card_payments_status, ach_payments_status, payouts_status, requirements_due, requirements_past_due, disabled_reason, last_synced_at").eq("chapter_id", chapter.id).maybeSingle(),
  ]);

  const subStatus = readiness?.subscription ?? "none";
  const subGood = subscriptionInGoodStanding(subStatus);
  const termsAccepted = Boolean(readiness?.terms_accepted);
  const connectReady = account?.card_payments_status === "active" && account?.payouts_status === "active";
  const canCollect = Boolean(readiness?.can_collect);
  const stripeOn = isStripeConfigured();
  const fmtDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: chapter.timezone });
  const agreed = agreement as unknown as { signer_name: string; signer_title: string; accepted_at: string; terms: { version: string; title: string } | null } | null;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  const currentStep = !termsAccepted ? 2 : !subGood ? 3 : !connectReady ? 4 : 5;

  return (
    <div className="space-y-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {sp.subscription === "success" ? (
        <Notice tone="positive" title="Subscription started">
          Stripe is confirming the payment. The status below updates within a minute.
        </Notice>
      ) : null}
      {sp.subscription === "canceled" ? <Notice tone="info">Subscription checkout was canceled. Nothing was charged.</Notice> : null}
      {sp.connect === "returned" ? <Notice tone="info">Welcome back. Stripe status is refreshed below.</Notice> : null}
      {sp.connect === "sync_failed" ? <Notice tone="warning">We could not refresh your Stripe status. Try the refresh button below.</Notice> : null}
      {stripeOn && !isStripeLiveMode() ? (
        <Notice tone="warning" title="Stripe test mode">
          No real money moves. Use Stripe test cards and bank accounts.
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader
            title="Set up dues collection"
            description="Four steps before members can pay online. The other setup steps stay locked until this subscription is active."
            actions={canCollect ? <Badge tone="positive">Ready to collect</Badge> : <Badge tone="warning">Not collecting yet</Badge>}
          />
          <CardBody className="py-6">
            <ol>
              <Step n={1} done={chapter.status === "verified"} current={false} title="Chapter verified">
                <p className="text-[13px] text-ink-2">{chapter.status === "verified" ? "A platform reviewer verified this chapter." : "Verification is pending."}</p>
              </Step>

              <Step n={2} done={termsAccepted} current={currentStep === 2} title="Accept the chapter agreement">
                {termsAccepted && agreed ? (
                  <p className="text-[13px] text-ink-2">
                    Accepted by {agreed.signer_name}, {agreed.signer_title}, on {fmtDate.format(new Date(agreed.accepted_at))}
                    {agreed.terms ? ` (version ${agreed.terms.version})` : ""}. <TextLink href="/legal/chapter-agreement" target="_blank">Read agreement</TextLink>
                  </p>
                ) : !terms ? (
                  <p className="text-[13px] text-ink-2">The agreement has not been published yet. Apply the database migrations to seed it.</p>
                ) : can("chapter.ownership") ? (
                  <div className="space-y-3">
                    <p className="text-[13px] text-ink-2">
                      Read the <TextLink href="/legal/chapter-agreement" target="_blank">{terms.title}</TextLink> (version {terms.version}). Only a chapter administrator can accept it.
                    </p>
                    <AgreementForm action={acceptAgreement.bind(null, chapter.slug)} termsId={terms.id} summary={terms.summary} defaultName={profile?.full_name ?? ""} />
                  </div>
                ) : (
                  <p className="text-[13px] text-ink-2">A chapter administrator needs to accept the agreement.</p>
                )}
              </Step>

              <Step n={3} done={subGood} current={currentStep === 3} title={`Activate the ${formatCents(pricing.plan.priceCents)} monthly subscription`}>
                {subscription && subStatus !== "none" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                      <Badge tone={subGood ? (subStatus === "past_due" ? "warning" : "positive") : "danger"}>{SUBSCRIPTION_STATUS_LABEL[subStatus] ?? subStatus}</Badge>
                      <span className="tnum">
                        {formatCents(Number(subscription.unit_amount_cents ?? pricing.plan.priceCents))} per {subscription.billing_interval ?? "month"}
                      </span>
                      {subscription.current_period_end ? (
                        <span>
                          · {subscription.cancel_at_period_end ? "Ends" : "Renews"} {fmtDate.format(new Date(subscription.current_period_end))}
                        </span>
                      ) : null}
                    </div>
                    {subStatus === "past_due" ? (
                      <p className="text-[13px] text-warning">The last subscription payment failed. Update the card to keep online dues collection running.</p>
                    ) : null}
                    {!subGood ? <p className="text-[13px] text-danger">Online dues collection is paused until the subscription is active.</p> : null}
                    {can("chapter.manage") ? (
                      <div className="flex flex-wrap gap-2">
                        <ExternalActionForm action={openBillingPortal.bind(null, chapter.slug)}>
                          <ExternalSubmitButton variant="secondary" size="sm" pendingLabel="Opening">
                            Manage billing
                            <ExternalLink className="size-3.5" aria-hidden />
                          </ExternalSubmitButton>
                        </ExternalActionForm>
                        {!subGood ? (
                          <ExternalActionForm action={startSubscription.bind(null, chapter.slug)}>
                            <ExternalSubmitButton size="sm" pendingLabel="Opening checkout" disabled={!termsAccepted || !stripeOn}>
                              Restart subscription
                            </ExternalSubmitButton>
                          </ExternalActionForm>
                        ) : null}
                        {platformAdmin && !subGood ? (
                          <ExternalActionForm action={startAdminSubscription.bind(null, chapter.slug)}>
                            <ExternalSubmitButton variant="secondary" size="sm" pendingLabel="Opening checkout" disabled={!termsAccepted || !stripeOn}>
                              Admin subscription · {formatCents(ADMIN_SUBSCRIPTION_CENTS)}
                            </ExternalSubmitButton>
                          </ExternalActionForm>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[13px] text-ink-2">
                      {formatCents(pricing.plan.priceCents)} per month, billed to the chapter. It covers every member and every feature. Cancel any time from the billing portal.
                    </p>
                    {can("chapter.manage") ? (
                      <div className="flex flex-wrap gap-2">
                        <ExternalActionForm action={startSubscription.bind(null, chapter.slug)}>
                          <ExternalSubmitButton size="sm" pendingLabel="Opening checkout" disabled={!termsAccepted || !stripeOn}>
                            Activate for {formatCents(pricing.plan.priceCents)} per month
                          </ExternalSubmitButton>
                        </ExternalActionForm>
                        {platformAdmin ? (
                          <ExternalActionForm action={startAdminSubscription.bind(null, chapter.slug)}>
                            <ExternalSubmitButton variant="secondary" size="sm" pendingLabel="Opening checkout" disabled={!termsAccepted || !stripeOn}>
                              Admin subscription · {formatCents(ADMIN_SUBSCRIPTION_CENTS)}
                            </ExternalSubmitButton>
                          </ExternalActionForm>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[13px] text-ink-3">A chapter administrator can activate the subscription.</p>
                    )}
                    {!termsAccepted ? <p className="text-[12px] text-ink-3">Accept the agreement first.</p> : null}
                  </div>
                )}
              </Step>

              <Step n={4} done={connectReady} current={currentStep === 4} title="Connect Stripe to receive dues">
                <div className="space-y-3">
                  <p className="text-[13px] text-ink-2">
                    Stripe holds dues in your chapter&apos;s own account and pays out to its bank account. We never see bank or card numbers.
                  </p>
                  {account ? (
                    <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
                      {[
                        ["Card payments", account.card_payments_status],
                        ["Bank payments", account.ach_payments_status ?? "not_requested"],
                        ["Payouts", account.payouts_status],
                      ].map(([label, value]) => {
                        const l = capabilityLabel(value);
                        return (
                          <div key={label} className="rounded-md border border-line px-3 py-2">
                            <dt className="text-ink-3">{label}</dt>
                            <dd className="mt-0.5"><Badge tone={l.tone}>{l.label}</Badge></dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}
                  {account && (account.requirements_due?.length || account.requirements_past_due?.length) ? (
                    <Notice tone={account.requirements_past_due?.length ? "danger" : "warning"} title="Stripe needs more information">
                      <ul className="list-disc pl-4">
                        {[...new Set([...(account.requirements_past_due ?? []), ...(account.requirements_due ?? [])].map((r: string) => describeRequirement(r)))].map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </Notice>
                  ) : null}
                  {can("payments.configure") ? (
                    <div className="flex flex-wrap gap-2">
                      {!connectReady ? (
                        <ExternalActionForm action={startConnectOnboarding.bind(null, chapter.slug)}>
                          <ExternalSubmitButton size="sm" pendingLabel="Opening Stripe" disabled={!termsAccepted || !stripeOn || chapter.status !== "verified"}>
                            {account ? "Continue Stripe setup" : "Set up Stripe"}
                          </ExternalSubmitButton>
                        </ExternalActionForm>
                      ) : null}
                      {account ? (
                        <form action={refreshConnectStatus.bind(null, chapter.slug)}>
                          <SubmitButton variant="secondary" size="sm" pendingLabel="Refreshing" disabled={!stripeOn}>Refresh status</SubmitButton>
                        </form>
                      ) : null}
                      {account ? (
                        <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 px-2 text-[13px] text-ink-2 hover:text-ink">
                          Stripe Dashboard
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-3">The treasurer or a chapter administrator can connect Stripe.</p>
                  )}
                </div>
              </Step>

              <Step n={5} done={canCollect} current={currentStep === 5 && !canCollect} title="Collect dues online">
                <p className="text-[13px] text-ink-2">
                  {canCollect ? (
                    <>Members can pay from <TextLink href={`/c/${chapter.slug}/dues`}>My dues</TextLink>. Create assessments under <TextLink href={`/c/${chapter.slug}/finances/assessments`}>Finances</TextLink>.</>
                  ) : (
                    "Online payments turn on automatically once the steps above are complete. You can still record cash and check payments."
                  )}
                </p>
              </Step>
            </ol>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <ChapterCosts
            plan={pricing.plan}
            rule={pricing.rule}
            subscriptionStatus={SUBSCRIPTION_STATUS_LABEL[subStatus] ?? subStatus}
            subscriptionTone={subGood ? (subStatus === "past_due" ? "warning" : "positive") : "neutral"}
            footer={pricing.agreed ? `Your agreement locks in ${pricing.ruleName}. Changes require a new agreement.` : "Rates are set when your administrator accepts the agreement."}
          />
          {(invoices ?? []).length > 0 ? (
            <Card>
              <CardHeader title="Subscription invoices" />
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).map((inv) => (
                    <Tr key={inv.stripe_invoice_id}>
                      <Td>{fmtDate.format(new Date(inv.paid_at ?? inv.created_at))}</Td>
                      <Td><Badge tone={inv.status === "paid" ? "positive" : inv.status === "open" ? "warning" : "neutral"}>{inv.status}</Badge></Td>
                      <Td align="right"><Money cents={Number(inv.amount_paid_cents)} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
