import type { Db } from "./db";

let counter = 0;

function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}${Math.random().toString(36).slice(2, 7)}`;
}

export async function createUniversity(db: Db, name = "State University", domains = ["state.edu"]): Promise<string> {
  const slug = unique("uni-");
  const r = await db.pg.query<{ id: string }>(
    "insert into public.universities (name, slug, email_domains) values ($1, $2, $3) returning id",
    [name, slug, domains],
  );
  return r.rows[0].id;
}

export async function createReviewer(db: Db): Promise<string> {
  const id = await db.createUser(`${unique("reviewer")}@platform.test`, "Platform Reviewer");
  await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'reviewer')", [id]);
  return id;
}

export type ChapterFixture = {
  chapterId: string;
  slug: string;
  ownerId: string;
  ownerMembershipId: string;
  applicationId: string;
  reviewerId: string;
};

export async function createApplication(
  db: Db,
  applicantId: string,
  universityId: string,
  organizationName: string,
  designation: string,
): Promise<string> {
  return db.asUser(applicantId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.chapter_applications
        (applicant_id, applicant_full_name, intended_role, university_id, organization_name, designation, verification_method, national_contact_name, national_contact_email)
       values ($1, 'Avery Treasurer', 'treasurer', $2, $3, $4, 'national_organization', 'Pat Advisor', 'pat@national.test')
       returning id`,
      [applicantId, universityId, organizationName, designation],
    );
    return r.rows[0].id;
  });
}

export async function createVerifiedChapter(
  db: Db,
  options: { universityId?: string; organizationName?: string; designation?: string; reviewerId?: string } = {},
): Promise<ChapterFixture> {
  const universityId = options.universityId ?? (await createUniversity(db));
  const reviewerId = options.reviewerId ?? (await createReviewer(db));
  const ownerId = await db.createUser(`${unique("owner")}@state.edu`, "Avery Treasurer");
  const organizationName = options.organizationName ?? `Sigma ${unique("Org")}`;
  const applicationId = await createApplication(db, ownerId, universityId, organizationName, options.designation ?? "Alpha Beta");
  await db.rpc("authenticated", ownerId, "submit_chapter_application", { p_application: applicationId });
  const chapterId = await db.rpc<string>("authenticated", reviewerId, "review_chapter_application", {
    p_application: applicationId,
    p_decision: "verified",
    p_message: "Verified with national headquarters.",
  });
  const info = await db.pg.query<{ slug: string; membership: string }>(
    "select c.slug, m.id as membership from public.chapters c join public.memberships m on m.chapter_id = c.id and m.user_id = $2 where c.id = $1",
    [chapterId, ownerId],
  );
  return { chapterId, slug: info.rows[0].slug, ownerId, ownerMembershipId: info.rows[0].membership, applicationId, reviewerId };
}

export async function setSubscription(db: Db, chapter: ChapterFixture, status: string): Promise<void> {
  const sub = `sub_${chapter.chapterId.replace(/-/g, "").slice(0, 20)}`;
  await db.rpc("service_role", null, "service_sync_subscription", {
    p_chapter: chapter.chapterId,
    p_subscription: sub,
    p_customer: `cus_${chapter.chapterId.replace(/-/g, "").slice(0, 20)}`,
    p_status: status,
    p_plan_code: "chapter_monthly",
    p_unit_amount: 3_000,
    p_interval: "month",
    p_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    p_cancel_at_period_end: false,
  });
}

export async function enablePayments(db: Db, chapter: ChapterFixture, options: { subscribe?: boolean } = {}): Promise<string> {
  if (options.subscribe !== false) await setSubscription(db, chapter, "active");
  const terms = await db.pg.query<{ id: string }>(
    "select id from public.terms_documents where kind = 'chapter_agreement' and published_at is not null order by published_at desc limit 1",
  );
  await db.rpc("authenticated", chapter.ownerId, "accept_chapter_agreement", {
    p_chapter: chapter.chapterId,
    p_terms: terms.rows[0].id,
    p_signer_name: "Avery Treasurer",
    p_signer_title: "Treasurer",
    p_ip: "203.0.113.5",
    p_user_agent: "vitest",
  });
  const account = `acct_${unique("T").replace(/[^A-Za-z0-9]/g, "")}`;
  await db.rpc("service_role", null, "service_upsert_connected_account", {
    p_chapter: chapter.chapterId,
    p_account: account,
    p_livemode: false,
    p_card_status: "pending",
    p_ach_status: null,
    p_payouts_status: "pending",
    p_requirements_due: ["business_profile.url"],
    p_requirements_past_due: [],
    p_disabled_reason: null,
    p_created_by: chapter.ownerId,
  });
  await db.rpc("service_role", null, "service_upsert_connected_account", {
    p_chapter: chapter.chapterId,
    p_account: account,
    p_livemode: false,
    p_card_status: "active",
    p_ach_status: "active",
    p_payouts_status: "active",
    p_requirements_due: [],
    p_requirements_past_due: [],
    p_disabled_reason: null,
    p_created_by: null,
  });
  return account;
}

export async function addMember(db: Db, chapter: ChapterFixture, name = "Jordan Member", roleKeys: string[] = []): Promise<{ userId: string; membershipId: string; email: string }> {
  const email = `${unique("member")}@state.edu`;
  const userId = await db.createUser(email, name);
  const token = unique("tok");
  await db.rpc("authenticated", chapter.ownerId, "create_chapter_invitation", {
    p_chapter: chapter.chapterId,
    p_email: email,
    p_full_name: name,
    p_member_class: "active",
    p_role_keys: roleKeys,
    p_token_hash: token,
  });
  await db.rpc("authenticated", userId, "accept_chapter_invitation", { p_token_hash: token });
  const m = await db.pg.query<{ id: string }>("select id from public.memberships where chapter_id = $1 and user_id = $2", [chapter.chapterId, userId]);
  return { userId, membershipId: m.rows[0].id, email };
}

export async function createAssessment(
  db: Db,
  chapter: ChapterFixture,
  membershipIds: string[],
  amountCents = 45_000,
  title = "Fall 2026 dues",
): Promise<{ assessmentId: string; memberAssessmentIds: Record<string, string> }> {
  const assessmentId = await db.asUser(chapter.ownerId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "insert into public.dues_assessments (chapter_id, title, default_amount_cents, due_date, created_by, allow_installments, max_installments) values ($1, $2, $3, current_date + 30, $4, true, 4) returning id",
      [chapter.chapterId, title, amountCents, chapter.ownerId],
    );
    return r.rows[0].id;
  });
  await db.rpc("authenticated", chapter.ownerId, "issue_dues_assessment", { p_assessment: assessmentId, p_memberships: membershipIds });
  const rows = await db.pg.query<{ id: string; membership_id: string }>(
    "select id, membership_id from public.member_assessments where assessment_id = $1",
    [assessmentId],
  );
  return { assessmentId, memberAssessmentIds: Object.fromEntries(rows.rows.map((r) => [r.membership_id, r.id])) };
}

export type PendingPayment = { id: string; amount_cents: number; platform_fee_cents: number; stripe_account_id: string };

export async function startPayment(db: Db, userId: string, memberAssessmentId: string, amount: number | null = null): Promise<PendingPayment> {
  return db.asUser(userId, async (tx) => {
    const r = await tx.query<PendingPayment>(
      "select id, amount_cents::int, platform_fee_cents::int, stripe_account_id from public.create_pending_payment($1, null, $2)",
      [memberAssessmentId, amount],
    );
    return r.rows[0];
  });
}

export async function succeedPayment(
  db: Db,
  payment: PendingPayment,
  overrides: Partial<{ amount: number; fee: number; processing: number | null; event: string; charge: string }> = {},
): Promise<boolean> {
  const suffix = payment.id.replace(/-/g, "").slice(0, 16);
  return db.rpc<boolean>("service_role", null, "service_record_payment_succeeded", {
    p_payment: payment.id,
    p_payment_intent: `pi_${suffix}`,
    p_charge: overrides.charge ?? `ch_${suffix}`,
    p_method: "card",
    p_amount_received: overrides.amount ?? payment.amount_cents,
    p_application_fee_id: `fee_${suffix}`,
    p_application_fee_amount: overrides.fee ?? payment.platform_fee_cents,
    p_processing_fee: overrides.processing === undefined ? 1_335 : overrides.processing,
    p_balance_transaction: `txn_${suffix}`,
    p_event: overrides.event ?? `evt_${suffix}`,
  });
}

export async function memberBalance(db: Db, userId: string, membershipId: string): Promise<number> {
  const r = await db.asUser(userId, (tx) => tx.query<{ b: { balance_cents: number } | null }>("select public.member_balance($1) as b", [membershipId]));
  if (!r.rows[0].b) throw new Error("balance not visible");
  return Number(r.rows[0].b.balance_cents);
}

export async function unbalancedTransactions(db: Db): Promise<number> {
  const r = await db.pg.query<{ n: number }>(
    "select count(*)::int as n from (select transaction_id from public.ledger_entries group by transaction_id having sum(amount_cents) <> 0) x",
  );
  return r.rows[0].n;
}

export async function accountTotal(db: Db, chapterId: string, account: string): Promise<number> {
  const r = await db.pg.query<{ t: string }>(
    "select coalesce(sum(amount_cents), 0)::text as t from public.ledger_entries where chapter_id = $1 and account = $2::public.ledger_account",
    [chapterId, account],
  );
  return Number(r.rows[0].t);
}
