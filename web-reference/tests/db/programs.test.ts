import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

type Member = { userId: string; membershipId: string };

describe("program modules", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let houseManager: Member;
  let standards: Member;
  let board: Member;
  let scholarship: Member;
  let philanthropy: Member;
  let member: Member;
  let other: Member;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    houseManager = await addMember(db, chapter, "Hayden House", ["house_manager"]);
    standards = await addMember(db, chapter, "Sam Standards", ["risk_management_chair"]);
    board = await addMember(db, chapter, "Bo Board", ["standards_board"]);
    scholarship = await addMember(db, chapter, "Sky Scholar", ["scholarship_chair"]);
    philanthropy = await addMember(db, chapter, "Phil Anthropy", ["philanthropy_chair"]);
    member = await addMember(db, chapter, "Pat Member");
    other = await addMember(db, chapter, "Ori Other");
  });

  const notifications = async (userId: string, kind: string) =>
    (await db.pg.query<{ title: string; link: string }>("select title, link from public.notifications where user_id = $1 and kind = $2 order by created_at", [userId, kind])).rows;

  describe("chores", () => {
    let chore: string;

    beforeAll(async () => {
      const r = await db.asUser(houseManager.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.chores (chapter_id, title, assigned_membership_id, due_on, created_by) values ($1, 'Kitchen cleanup', $2, current_date + 2, $3) returning id", [
          chapter.chapterId,
          member.membershipId,
          houseManager.userId,
        ]),
      );
      chore = r.rows[0].id;
    });

    it("notifies the assignee with a link to housing", async () => {
      const rows = await notifications(member.userId, "task_assigned");
      expect(rows).toEqual([{ title: "Chore assigned: Kitchen cleanup", link: `/c/${chapter.slug}/housing` }]);
    });

    it("hides chores from members who are not assigned", async () => {
      const seen = await db.asUser(other.userId, (tx) => tx.query("select 1 from public.chores where id = $1", [chore]));
      expect(seen.rows).toHaveLength(0);
    });

    it("lets the assignee only mark the chore done, not edit it", async () => {
      await expectDenied(db.asUser(member.userId, (tx) => tx.query("update public.chores set due_on = current_date + 30 where id = $1", [chore])));
      await expectDenied(db.asUser(member.userId, (tx) => tx.query("update public.chores set assigned_membership_id = $1 where id = $2", [other.membershipId, chore])));
      await expectDenied(db.asUser(member.userId, (tx) => tx.query("update public.chores set status = 'missed' where id = $1", [chore])));
      await db.asUser(member.userId, (tx) => tx.query("update public.chores set status = 'done', completed_at = '2000-01-01' where id = $1", [chore]));
      const row = (await db.pg.query<{ status: string; completed_at: Date }>("select status, completed_at from public.chores where id = $1", [chore])).rows[0];
      expect(row.status).toBe("done");
      expect(row.completed_at.getFullYear()).toBeGreaterThan(2000);
      await expectDenied(db.asUser(member.userId, (tx) => tx.query("update public.chores set status = 'pending' where id = $1", [chore])));
    });

    it("lets the house manager reassign and notifies the new assignee", async () => {
      await db.asUser(houseManager.userId, (tx) => tx.query("update public.chores set status = 'pending', assigned_membership_id = $1 where id = $2", [other.membershipId, chore]));
      const row = (await db.pg.query<{ completed_at: Date | null }>("select completed_at from public.chores where id = $1", [chore])).rows[0];
      expect(row.completed_at).toBeNull();
      expect(await notifications(other.userId, "task_assigned")).toHaveLength(1);
    });
  });

  describe("reservations", () => {
    let room: string;

    beforeAll(async () => {
      const r = await db.asUser(houseManager.userId, (tx) => tx.query<{ id: string }>("insert into public.facilities (chapter_id, name, reservable) values ($1, 'Study room', true) returning id", [chapter.chapterId]));
      room = r.rows[0].id;
    });

    const reserve = (userId: string, from: string, to: string) =>
      db.asUser(userId, (tx) =>
        tx.query("insert into public.facility_reservations (chapter_id, facility_id, user_id, starts_at, ends_at) values ($1, $2, $3, $4, $5)", [chapter.chapterId, room, userId, from, to]),
      );

    it("rejects overlapping reservations but allows back-to-back ones", async () => {
      await reserve(member.userId, "2030-01-10T18:00:00Z", "2030-01-10T20:00:00Z");
      await expectDenied(reserve(other.userId, "2030-01-10T19:00:00Z", "2030-01-10T21:00:00Z"), /already reserved/);
      await reserve(other.userId, "2030-01-10T20:00:00Z", "2030-01-10T21:00:00Z");
    });

    it("only lets the reserver or the house manager cancel", async () => {
      const res = await db.pg.query<{ id: string }>("select id from public.facility_reservations where user_id = $1", [member.userId]);
      const byOther = await db.asUser(other.userId, (tx) => tx.query("update public.facility_reservations set status = 'cancelled' where id = $1", [res.rows[0].id]));
      expect(byOther.affectedRows).toBe(0);
      const byOwner = await db.asUser(member.userId, (tx) => tx.query("update public.facility_reservations set status = 'cancelled' where id = $1", [res.rows[0].id]));
      expect(byOwner.affectedRows).toBe(1);
    });
  });

  describe("maintenance", () => {
    it("notifies the member a request is assigned to", async () => {
      const r = await db.asUser(member.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.maintenance_requests (chapter_id, title, submitted_by) values ($1, 'Leaking sink', $2) returning id", [chapter.chapterId, member.userId]),
      );
      const before = (await notifications(other.userId, "task_assigned")).length;
      const byMember = await db.asUser(member.userId, (tx) => tx.query("update public.maintenance_requests set status = 'resolved' where id = $1", [r.rows[0].id]));
      expect(byMember.affectedRows).toBe(0);
      await db.asUser(houseManager.userId, (tx) => tx.query("update public.maintenance_requests set assigned_membership_id = $1, status = 'in_progress' where id = $2", [other.membershipId, r.rows[0].id]));
      const after = await notifications(other.userId, "task_assigned");
      expect(after).toHaveLength(before + 1);
      expect(after.at(-1)?.title).toBe("Maintenance assigned: Leaking sink");
      const seenByAssignee = await db.asUser(other.userId, (tx) => tx.query("select 1 from public.maintenance_requests where id = $1", [r.rows[0].id]));
      expect(seenByAssignee.rows).toHaveLength(1);
    });
  });

  describe("policies", () => {
    let policy: string;

    beforeAll(async () => {
      const r = await db.asUser(standards.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.policy_documents (chapter_id, title, created_by) values ($1, 'Risk policy', $2) returning id", [chapter.chapterId, standards.userId]),
      );
      policy = r.rows[0].id;
      await db.rpc("authenticated", standards.userId, "publish_policy_version", { p_policy: policy, p_body: "Version one text", p_summary: "Initial version" });
    });

    it("blocks members from publishing", async () => {
      await expectDenied(db.rpc("authenticated", member.userId, "publish_policy_version", { p_policy: policy, p_body: "Mine", p_summary: "x" }));
    });

    it("notifies active members except the publisher on each version", async () => {
      expect(await notifications(member.userId, "policy_update")).toEqual([{ title: "New policy: Risk policy", link: `/c/${chapter.slug}/standards` }]);
      expect(await notifications(standards.userId, "policy_update")).toHaveLength(0);
      await db.rpc("authenticated", standards.userId, "publish_policy_version", { p_policy: policy, p_body: "Version two text", p_summary: "Clarified guests" });
      const rows = await notifications(member.userId, "policy_update");
      expect(rows.map((r) => r.title)).toEqual(["New policy: Risk policy", "Policy revised: Risk policy"]);
    });

    it("keeps published versions immutable", async () => {
      await expectDenied(db.pg.query("update public.policy_versions set body = 'changed' where policy_id = $1", [policy]));
    });

    it("lets members acknowledge only for themselves", async () => {
      const v = await db.pg.query<{ id: string }>("select id from public.policy_versions where policy_id = $1 and version = 2", [policy]);
      await expectDenied(
        db.asUser(member.userId, (tx) => tx.query("insert into public.policy_acknowledgments (policy_version_id, chapter_id, user_id) values ($1, $2, $3)", [v.rows[0].id, chapter.chapterId, other.userId])),
      );
      await db.asUser(member.userId, (tx) => tx.query("insert into public.policy_acknowledgments (policy_version_id, chapter_id, user_id) values ($1, $2, $3)", [v.rows[0].id, chapter.chapterId, member.userId]));
      const seenByOther = await db.asUser(other.userId, (tx) => tx.query("select 1 from public.policy_acknowledgments"));
      expect(seenByOther.rows).toHaveLength(0);
      const seenByBoard = await db.asUser(board.userId, (tx) => tx.query("select 1 from public.policy_acknowledgments"));
      expect(seenByBoard.rows).toHaveLength(1);
    });
  });

  describe("incident reports", () => {
    it("hides confidential reporters and keeps reports from members and platform staff", async () => {
      await db.asUser(member.userId, (tx) =>
        tx.query("insert into public.incident_reports (chapter_id, reporter_id, category, description) values ($1, $2, 'safety', 'Broken railing on the back stairs')", [chapter.chapterId, member.userId]),
      );
      await db.asUser(other.userId, (tx) =>
        tx.query("insert into public.incident_reports (chapter_id, reporter_id, confidential_reporter, category, description) values ($1, $2, false, 'property', 'Window broken after the event')", [
          chapter.chapterId,
          other.userId,
        ]),
      );
      const list = await db.as("authenticated", standards.userId, (tx) =>
        tx.query<{ category: string; reporter_name: string | null }>("select category, reporter_name from public.list_incident_reports($1) order by category", [chapter.chapterId]),
      );
      expect(list.rows).toEqual([
        { category: "property", reporter_name: "Ori Other" },
        { category: "safety", reporter_name: null },
      ]);
      await expectDenied(db.as("authenticated", member.userId, (tx) => tx.query("select * from public.list_incident_reports($1)", [chapter.chapterId])));
      await expectDenied(db.as("authenticated", board.userId, (tx) => tx.query("select * from public.list_incident_reports($1)", [chapter.chapterId])));
      const ownOnly = await db.asUser(member.userId, (tx) => tx.query("select 1 from public.incident_reports"));
      expect(ownOnly.rows).toHaveLength(1);
      const admin = await db.createUser("staff-programs@platform.test", "Platform Admin");
      await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
      const byStaff = await db.asUser(admin, (tx) => tx.query("select 1 from public.incident_reports union all select 1 from public.incident_case_notes"));
      expect(byStaff.rows).toHaveLength(0);
      const audit = await db.pg.query("select 1 from public.audit_logs where chapter_id = $1 and action = 'incident.list_viewed'", [chapter.chapterId]);
      expect(audit.rows.length).toBeGreaterThan(0);
    });
  });

  describe("service hours", () => {
    it("blocks self-approval and members approving others", async () => {
      const mine = await db.asUser(philanthropy.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.service_hours (chapter_id, user_id, organization, hours, served_on) values ($1, $2, 'Food bank', 3, current_date) returning id", [chapter.chapterId, philanthropy.userId]),
      );
      const self = await db.asUser(philanthropy.userId, (tx) => tx.query("update public.service_hours set status = 'approved' where id = $1", [mine.rows[0].id]));
      expect(self.affectedRows).toBe(0);
      await expectDenied(
        db.asUser(member.userId, (tx) =>
          tx.query("insert into public.service_hours (chapter_id, user_id, organization, hours, served_on, status) values ($1, $2, 'Food bank', 3, current_date, 'approved')", [chapter.chapterId, member.userId]),
        ),
      );
      const theirs = await db.asUser(member.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.service_hours (chapter_id, user_id, organization, hours, served_on) values ($1, $2, 'Shelter', 2.5, current_date) returning id", [chapter.chapterId, member.userId]),
      );
      const byPeer = await db.asUser(other.userId, (tx) => tx.query("update public.service_hours set status = 'approved' where id = $1", [theirs.rows[0].id]));
      expect(byPeer.affectedRows).toBe(0);
      const byChair = await db.asUser(philanthropy.userId, (tx) => tx.query("update public.service_hours set status = 'approved', reviewed_by = $1 where id = $2", [philanthropy.userId, theirs.rows[0].id]));
      expect(byChair.affectedRows).toBe(1);
    });

    it("enforces volunteer shift capacity", async () => {
      const ev = await db.asUser(philanthropy.userId, (tx) =>
        tx.query<{ id: string }>(
          "insert into public.events (chapter_id, title, category, starts_at, ends_at, timezone, created_by) values ($1, 'Park cleanup', 'philanthropy', now() + interval '2 days', now() + interval '2 days 3 hours', 'UTC', $2) returning id",
          [chapter.chapterId, philanthropy.userId],
        ),
      );
      const shift = await db.asUser(philanthropy.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.volunteer_shifts (chapter_id, event_id, name, starts_at, ends_at, slots) values ($1, $2, 'Morning', now() + interval '2 days', now() + interval '2 days 1 hour', 1) returning id", [
          chapter.chapterId,
          ev.rows[0].id,
        ]),
      );
      await db.rpc("authenticated", member.userId, "signup_volunteer_shift", { p_shift: shift.rows[0].id, p_join: true });
      await db.rpc("authenticated", member.userId, "signup_volunteer_shift", { p_shift: shift.rows[0].id, p_join: true });
      await expectDenied(db.rpc("authenticated", other.userId, "signup_volunteer_shift", { p_shift: shift.rows[0].id, p_join: true }), /full/);
      const ended = await db.asUser(philanthropy.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.volunteer_shifts (chapter_id, event_id, name, starts_at, ends_at, slots) values ($1, $2, 'Already over', now() - interval '2 hours', now() - interval '1 hour', 4) returning id", [
          chapter.chapterId,
          ev.rows[0].id,
        ]),
      );
      await expectDenied(db.rpc("authenticated", member.userId, "signup_volunteer_shift", { p_shift: ended.rows[0].id, p_join: true }), /ended/);
      await db.rpc("authenticated", member.userId, "signup_volunteer_shift", { p_shift: shift.rows[0].id, p_join: false });
      await db.rpc("authenticated", other.userId, "signup_volunteer_shift", { p_shift: shift.rows[0].id, p_join: true });
    });
  });

  describe("reimbursements", () => {
    it("requires another finance officer and notifies the requester at each step", async () => {
      const treasurer = await addMember(db, chapter, "Tess Treasurer", ["treasurer"]);
      const own = await db.asUser(treasurer.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.reimbursement_requests (chapter_id, user_id, description, amount_cents, spent_on) values ($1, $2, 'Printer paper', 1999, current_date) returning id", [chapter.chapterId, treasurer.userId]),
      );
      await expectDenied(db.rpc("authenticated", treasurer.userId, "review_reimbursement", { p_request: own.rows[0].id, p_status: "approved", p_note: "", p_paid_reference: "" }), /another officer/);
      const r = await db.asUser(member.userId, (tx) =>
        tx.query<{ id: string }>("insert into public.reimbursement_requests (chapter_id, user_id, description, amount_cents, spent_on) values ($1, $2, 'Table supplies', 4250, current_date) returning id", [chapter.chapterId, member.userId]),
      );
      await expectDenied(db.rpc("authenticated", other.userId, "review_reimbursement", { p_request: r.rows[0].id, p_status: "approved", p_note: "", p_paid_reference: "" }));
      await expectDenied(db.rpc("authenticated", treasurer.userId, "review_reimbursement", { p_request: r.rows[0].id, p_status: "paid", p_note: "", p_paid_reference: "Check 1" }), /invalid status/);
      await db.rpc("authenticated", treasurer.userId, "review_reimbursement", { p_request: r.rows[0].id, p_status: "approved", p_note: "", p_paid_reference: "" });
      await db.rpc("authenticated", treasurer.userId, "review_reimbursement", { p_request: r.rows[0].id, p_status: "paid", p_note: "", p_paid_reference: "Check 1042" });
      const titles = (await notifications(member.userId, "reimbursement_update")).map((n) => n.title);
      expect(titles).toEqual(["Reimbursement approved: $42.50", "Reimbursement paid: $42.50"]);
      const seenByPeer = await db.asUser(other.userId, (tx) => tx.query("select 1 from public.reimbursement_requests"));
      expect(seenByPeer.rows).toHaveLength(0);
    });
  });

  describe("academics", () => {
    it("keeps goals private unless shared with the scholarship chair", async () => {
      await db.asUser(member.userId, (tx) =>
        tx.query("insert into public.academic_goals (chapter_id, user_id, title, share_with_scholarship) values ($1, $2, 'Private goal', false), ($1, $2, 'Shared goal', true)", [chapter.chapterId, member.userId]),
      );
      const byChair = await db.asUser(scholarship.userId, (tx) => tx.query<{ title: string }>("select title from public.academic_goals"));
      expect(byChair.rows.map((r) => r.title)).toEqual(["Shared goal"]);
      const byPeer = await db.asUser(other.userId, (tx) => tx.query("select 1 from public.academic_goals"));
      expect(byPeer.rows).toHaveLength(0);
    });

    it("limits mentorship visibility to the pair and the scholarship chair", async () => {
      await expectDenied(
        db.asUser(member.userId, (tx) =>
          tx.query("insert into public.mentorship_pairs (chapter_id, mentor_membership_id, mentee_membership_id, created_by) values ($1, $2, $3, $4)", [chapter.chapterId, member.membershipId, other.membershipId, member.userId]),
        ),
      );
      await db.asUser(scholarship.userId, (tx) =>
        tx.query("insert into public.mentorship_pairs (chapter_id, mentor_membership_id, mentee_membership_id, created_by) values ($1, $2, $3, $4)", [chapter.chapterId, member.membershipId, other.membershipId, scholarship.userId]),
      );
      expect((await db.asUser(other.userId, (tx) => tx.query("select 1 from public.mentorship_pairs"))).rows).toHaveLength(1);
      expect((await db.asUser(houseManager.userId, (tx) => tx.query("select 1 from public.mentorship_pairs"))).rows).toHaveLength(0);
    });
  });
});
