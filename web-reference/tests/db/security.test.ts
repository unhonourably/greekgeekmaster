import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, expectNoEffect, type Db } from "../support/db";
import {
  addMember,
  createApplication,
  createAssessment,
  createReviewer,
  createUniversity,
  createVerifiedChapter,
  enablePayments,
  memberBalance,
  startPayment,
  succeedPayment,
  type ChapterFixture,
} from "../support/fixtures";

type Member = { userId: string; membershipId: string; email: string };

describe("tenant isolation and authorization", () => {
  let db: Db;
  let a: ChapterFixture;
  let b: ChapterFixture;
  let memberA1: Member;
  let memberA2: Member;
  let memberB1: Member;
  let paymentA1: string;

  beforeAll(async () => {
    db = await createDb();
    a = await createVerifiedChapter(db, { organizationName: "Sigma Chi" });
    b = await createVerifiedChapter(db, { organizationName: "Kappa Delta" });
    await enablePayments(db, a);
    await enablePayments(db, b);
    memberA1 = await addMember(db, a, "Morgan Alpha");
    memberA2 = await addMember(db, a, "Casey Alpha");
    memberB1 = await addMember(db, b, "Drew Beta");
    const { memberAssessmentIds } = await createAssessment(db, a, [memberA1.membershipId, memberA2.membershipId]);
    const p = await startPayment(db, memberA1.userId, memberAssessmentIds[memberA1.membershipId]);
    await succeedPayment(db, p);
    paymentA1 = p.id;
    await createAssessment(db, b, [memberB1.membershipId], 30_000);
  });

  it("hides another chapter's members, payments, ledger, and audit log", async () => {
    await db.asUser(b.ownerId, async (tx) => {
      expect((await tx.query("select 1 from public.memberships where chapter_id = $1", [a.chapterId])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.payments where chapter_id = $1", [a.chapterId])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.ledger_entries where chapter_id = $1", [a.chapterId])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.member_assessments where chapter_id = $1", [a.chapterId])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.audit_logs where chapter_id = $1", [a.chapterId])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.conversations where chapter_id = $1", [a.chapterId])).rows).toHaveLength(0);
    });
    await expectDenied(db.rpc("authenticated", b.ownerId, "chapter_financial_summary", { p_chapter: a.chapterId, p_from: "2000-01-01", p_to: "2100-01-01" }), /not authorized/);
  });

  it("hides one member's balance and payments from another member", async () => {
    await expect(memberBalance(db, memberA2.userId, memberA1.membershipId)).rejects.toThrow(/not visible/);
    await db.asUser(memberA2.userId, async (tx) => {
      expect((await tx.query("select 1 from public.payments where id = $1", [paymentA1])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.receipts where payment_id = $1", [paymentA1])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.ledger_entries where membership_id = $1", [memberA1.membershipId])).rows).toHaveLength(0);
    });
    expect(await memberBalance(db, memberA1.userId, memberA1.membershipId)).toBe(0);
    expect(await memberBalance(db, memberA2.userId, memberA2.membershipId)).toBe(45_000);
  });

  it("rejects browser-side payment status, amount, and ledger tampering", async () => {
    const { memberAssessmentIds } = await createAssessment(db, a, [memberA2.membershipId], 12_000, "Formal");
    const pending = await startPayment(db, memberA2.userId, memberAssessmentIds[memberA2.membershipId]);
    await expectNoEffect(db.asUser(memberA2.userId, (tx) => tx.query("update public.payments set status = 'succeeded' where id = $1", [pending.id])));
    await expectNoEffect(db.asUser(memberA2.userId, (tx) => tx.query("update public.payments set amount_cents = 50 where id = $1", [pending.id])));
    const stored = await db.pg.query<{ status: string; amount_cents: string }>("select status::text, amount_cents::text from public.payments where id = $1", [pending.id]);
    expect(stored.rows[0]).toEqual({ status: "pending", amount_cents: "12000" });
    await expectDenied(
      db.asUser(memberA2.userId, (tx) =>
        tx.query(
          "insert into public.payments (chapter_id, membership_id, member_assessment_id, kind, status, amount_cents, idempotency_key) values ($1, $2, $3, 'stripe', 'succeeded', 12000, 'forged')",
          [a.chapterId, memberA2.membershipId, memberAssessmentIds[memberA2.membershipId]],
        ),
      ),
    );
    await expectDenied(
      db.asUser(a.ownerId, (tx) =>
        tx.query("insert into public.ledger_transactions (chapter_id, kind, description, idempotency_key) values ($1, 'credit', 'forged', 'forged-1')", [a.chapterId]),
      ),
    );
    const before = await db.pg.query<{ n: number }>("select count(*)::int as n from public.ledger_entries where chapter_id = $1", [a.chapterId]);
    await expectNoEffect(db.asUser(a.ownerId, (tx) => tx.query("delete from public.ledger_entries where chapter_id = $1", [a.chapterId])));
    await expectNoEffect(db.asUser(a.ownerId, (tx) => tx.query("update public.ledger_entries set amount_cents = 1 where chapter_id = $1", [a.chapterId])));
    const after = await db.pg.query<{ n: number }>("select count(*)::int as n from public.ledger_entries where chapter_id = $1", [a.chapterId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await expectDenied(db.pg.query("delete from public.ledger_entries where chapter_id = $1", [a.chapterId]), /append-only|cannot/i);
  });

  it("prevents members and officers from calling service-only webhook functions", async () => {
    await expectDenied(
      db.rpc("authenticated", memberA2.userId, "service_record_payment_succeeded", {
        p_payment: paymentA1, p_payment_intent: "pi_x", p_charge: "ch_x", p_method: "card", p_amount_received: 45_000,
        p_application_fee_id: "fee_x", p_application_fee_amount: 0, p_processing_fee: 0, p_balance_transaction: "txn_x", p_event: "evt_x",
      }),
      /permission denied/,
    );
    await expectDenied(db.rpc("authenticated", a.ownerId, "service_claim_stripe_event", { p_id: "evt_1", p_type: "x", p_account: null, p_livemode: false, p_api_version: null, p_created: null }), /permission denied/);
    await expectDenied(db.rpc("anon", null, "service_apply_late_fees"), /permission denied/);
  });

  it("blocks self-promotion and granting permissions the granter lacks", async () => {
    const treasurerRole = await db.pg.query<{ id: string }>("select id from public.roles where chapter_id = $1 and key = 'treasurer'", [a.chapterId]);
    await expectDenied(
      db.asUser(memberA1.userId, (tx) =>
        tx.query("insert into public.role_assignments (chapter_id, membership_id, role_id) values ($1, $2, $3)", [a.chapterId, memberA1.membershipId, treasurerRole.rows[0].id]),
      ),
    );
    const secretary = await addMember(db, a, "Sam Secretary", ["secretary"]);
    const roleMgr = await db.pg.query<{ id: string }>("select id from public.roles where chapter_id = $1 and key = 'president'", [a.chapterId]);
    await expectDenied(
      db.asUser(secretary.userId, (tx) =>
        tx.query("insert into public.role_assignments (chapter_id, membership_id, role_id, assigned_by) values ($1, $2, $3, $4)", [a.chapterId, memberA2.membershipId, roleMgr.rows[0].id, secretary.userId]),
      ),
    );
    await expectNoEffect(db.asUser(memberA1.userId, (tx) => tx.query("update public.memberships set member_class = 'alumni' where id = $1", [memberA1.membershipId])));
    const cls = await db.pg.query<{ member_class: string }>("select member_class::text from public.memberships where id = $1", [memberA1.membershipId]);
    expect(cls.rows[0].member_class).toBe("active");
    await expectNoEffect(db.asUser(a.ownerId, (tx) => tx.query("update public.chapters set pricing_rule_id = null where id = $1", [a.chapterId])));
    const rule = await db.pg.query<{ pricing_rule_id: string | null }>("select pricing_rule_id from public.chapters where id = $1", [a.chapterId]);
    expect(rule.rows[0].pricing_rule_id).not.toBeNull();
  });

  it("keeps the last chapter administrator from being removed", async () => {
    const adminAssignment = await db.pg.query<{ id: string }>(
      "select ra.id from public.role_assignments ra join public.roles r on r.id = ra.role_id where ra.membership_id = $1 and r.key = 'chapter_admin' and ra.ends_at is null",
      [a.ownerMembershipId],
    );
    await expectDenied(db.asUser(a.ownerId, (tx) => tx.query("update public.role_assignments set ends_at = now() where id = $1", [adminAssignment.rows[0].id])), /owner|administrator/i);
  });

  it("rejects cross-chapter references in assessments", async () => {
    const assessmentB = await db.asUser(b.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "insert into public.dues_assessments (chapter_id, title, default_amount_cents, due_date, created_by) values ($1, 'Cross', 1000, current_date + 1, $2) returning id",
        [b.chapterId, b.ownerId],
      );
      return r.rows[0].id;
    });
    await expectDenied(db.rpc("authenticated", b.ownerId, "issue_dues_assessment", { p_assessment: assessmentB, p_memberships: [memberA1.membershipId] }), /not in this chapter/);
    await expectDenied(
      db.asUser(b.ownerId, (tx) =>
        tx.query("insert into public.dues_assessments (chapter_id, title, default_amount_cents, due_date, created_by) values ($1, 'Foreign', 1000, current_date + 1, $2)", [a.chapterId, b.ownerId]),
      ),
    );
  });

  it("keeps direct messages private from other members and platform staff", async () => {
    const dm = await db.rpc<string>("authenticated", memberA1.userId, "start_direct_conversation", { p_chapter: a.chapterId, p_other: memberA2.userId });
    await db.asUser(memberA1.userId, (tx) => tx.query("select (public.send_message($1, 'private hello', null, '{}', '{}', false, '[]'::jsonb)).id", [dm]));
    const count = async (userId: string) =>
      db.asUser(userId, async (tx) => (await tx.query("select 1 from public.messages where conversation_id = $1", [dm])).rows.length);
    expect(await count(memberA2.userId)).toBe(1);
    expect(await count(a.ownerId)).toBe(0);
    expect(await count(a.reviewerId)).toBe(0);
    await expectDenied(db.asUser(a.ownerId, (tx) => tx.query("select public.send_message($1, 'intrude', null, '{}', '{}', false, '[]'::jsonb)", [dm])));
  });

  it("cuts off chat and chapter data when a membership ends", async () => {
    const leaving = await addMember(db, a, "Quinn Leaving");
    const general = await db.pg.query<{ id: string }>("select id from public.conversations where chapter_id = $1 and kind = 'chapter_main'", [a.chapterId]);
    const before = await db.asUser(leaving.userId, async (tx) => (await tx.query("select 1 from public.conversations where id = $1", [general.rows[0].id])).rows.length);
    expect(before).toBe(1);
    await db.rpc("authenticated", a.ownerId, "update_membership", { p_membership: leaving.membershipId, p_member_class: "active", p_status: "ended", p_reason: "Resigned" });
    await db.asUser(leaving.userId, async (tx) => {
      expect((await tx.query("select 1 from public.conversations where id = $1", [general.rows[0].id])).rows).toHaveLength(0);
      expect((await tx.query("select 1 from public.memberships where chapter_id = $1 and user_id <> $2", [a.chapterId, leaving.userId])).rows).toHaveLength(0);
    });
    await expectDenied(db.asUser(leaving.userId, (tx) => tx.query("select public.send_message($1, 'still here?', null, '{}', '{}', false, '[]'::jsonb)", [general.rows[0].id])));
  });

  it("hides restricted recruitment notes from the recruitment team", async () => {
    const chair = await addMember(db, a, "Rory Chair", ["recruitment_chair"]);
    const team = await addMember(db, a, "Toby Team", ["recruitment_team"]);
    await db.rpc("authenticated", chair.userId, "ensure_recruitment_stages", { p_chapter: a.chapterId });
    const prospect = await db.asUser(chair.userId, async (tx) => {
      const stage = await tx.query<{ id: string }>("select id from public.recruitment_stages where chapter_id = $1 order by position limit 1", [a.chapterId]);
      const r = await tx.query<{ id: string }>(
        "insert into public.prospects (chapter_id, full_name, stage_id, created_by) values ($1, 'Pat Prospect', $2, $3) returning id",
        [a.chapterId, stage.rows[0].id, chair.userId],
      );
      await tx.query("insert into public.prospect_notes (chapter_id, prospect_id, author_id, body, restricted) values ($1, $2, $3, 'open note', false), ($1, $2, $3, 'restricted note', true)", [a.chapterId, r.rows[0].id, chair.userId]);
      return r.rows[0].id;
    });
    const notes = await db.asUser(team.userId, (tx) => tx.query<{ body: string }>("select body from public.prospect_notes where prospect_id = $1", [prospect]));
    expect(notes.rows.map((n) => n.body)).toEqual(["open note"]);
    const plain = await db.asUser(memberA2.userId, (tx) => tx.query("select 1 from public.prospects where id = $1", [prospect]));
    expect(plain.rows).toHaveLength(0);
    const staff = await db.asUser(a.reviewerId, (tx) => tx.query("select 1 from public.prospect_notes where prospect_id = $1", [prospect]));
    expect(staff.rows).toHaveLength(0);
  });
});

describe("chapter verification controls", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createDb();
  });

  it("lets applicants edit drafts but never approve or change status themselves", async () => {
    const uni = await createUniversity(db);
    const applicant = await db.createUser("applicant@state.edu", "Applicant");
    const app = await createApplication(db, applicant, uni, "Phi Delta", "Gamma");
    await expectDenied(db.asUser(applicant, (tx) => tx.query("update public.chapter_applications set status = 'verified' where id = $1", [app])), /protected/);
    await expectDenied(db.rpc("authenticated", applicant, "review_chapter_application", { p_application: app, p_decision: "verified", p_message: "self" }), /not authorized/);
    await db.rpc("authenticated", applicant, "submit_chapter_application", { p_application: app });
    await expectNoEffect(db.asUser(applicant, (tx) => tx.query("update public.chapter_applications set organization_name = 'Changed' where id = $1", [app])));
    const stored = await db.pg.query<{ organization_name: string; status: string }>("select organization_name, status::text from public.chapter_applications where id = $1", [app]);
    expect(stored.rows[0]).toEqual({ organization_name: "Phi Delta", status: "pending_verification" });
    const memberships = await db.pg.query("select 1 from public.memberships where user_id = $1", [applicant]);
    expect(memberships.rows).toHaveLength(0);
  });

  it("blocks a reviewer from approving their own application", async () => {
    const uni = await createUniversity(db);
    const reviewer = await createReviewer(db);
    const app = await createApplication(db, reviewer, uni, "Theta Xi", "Omega");
    await db.rpc("authenticated", reviewer, "submit_chapter_application", { p_application: app });
    await expectDenied(db.rpc("authenticated", reviewer, "review_chapter_application", { p_application: app, p_decision: "verified", p_message: "ok" }), /own application/);
  });

  it("flags duplicate chapters and refuses to create a second copy", async () => {
    const uni = await createUniversity(db);
    const reviewer = await createReviewer(db);
    await createVerifiedChapter(db, { universityId: uni, reviewerId: reviewer, organizationName: "Sigma Nu", designation: "Beta Eta" });
    const second = await db.createUser("second@state.edu", "Second Applicant");
    const app = await createApplication(db, second, uni, "The Sigma Nu Fraternity", "Beta Eta Chapter");
    await db.rpc("authenticated", second, "submit_chapter_application", { p_application: app });
    const flagged = await db.pg.query<{ duplicate_candidates: Array<{ type: string }> }>("select duplicate_candidates from public.chapter_applications where id = $1", [app]);
    expect(flagged.rows[0].duplicate_candidates.length).toBeGreaterThan(0);
    await expectDenied(db.rpc("authenticated", reviewer, "review_chapter_application", { p_application: app, p_decision: "verified", p_message: "ok" }), /already exists/);
    const applicantView = await db.asUser(second, (tx) => tx.query<{ kind: string }>("select kind from public.verification_events where application_id = $1", [app]));
    expect(applicantView.rows.map((r) => r.kind)).not.toContain("duplicate_flagged");
  });

  it("requires a reason to reject and lets the applicant appeal at most twice", async () => {
    const uni = await createUniversity(db);
    const reviewer = await createReviewer(db);
    const applicant = await db.createUser("appeal@state.edu", "Appealing Applicant");
    const app = await createApplication(db, applicant, uni, "Delta Upsilon", "Iota");
    await db.rpc("authenticated", applicant, "submit_chapter_application", { p_application: app });
    await expectDenied(db.rpc("authenticated", reviewer, "review_chapter_application", { p_application: app, p_decision: "rejected", p_message: "" }), /explain/);
    for (let i = 0; i < 2; i += 1) {
      await db.rpc("authenticated", reviewer, "review_chapter_application", { p_application: app, p_decision: "rejected", p_message: "Could not confirm officers." });
      await db.rpc("authenticated", applicant, "respond_to_application", { p_application: app, p_message: "Here is our national letter." });
    }
    await db.rpc("authenticated", reviewer, "review_chapter_application", { p_application: app, p_decision: "rejected", p_message: "Still unconfirmed." });
    await expectDenied(db.rpc("authenticated", applicant, "respond_to_application", { p_application: app, p_message: "Again" }), /appeal limit/);
  });

  it("does not let an unverified chapter use officer permissions", async () => {
    const chapter = await createVerifiedChapter(db);
    const admin = await db.createUser("admin@platform.test", "Platform Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    await db.rpc("authenticated", admin, "platform_set_chapter_status", { p_chapter: chapter.chapterId, p_status: "suspended", p_reason: "Under investigation" });
    const perms = await db.rpc<string[]>("authenticated", chapter.ownerId, "my_permissions", { p_chapter: chapter.chapterId });
    expect(perms ?? []).toHaveLength(0);
  });
});
