import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, expectNoEffect, type Db } from "../support/db";
import { addMember, createAssessment, createVerifiedChapter, memberBalance, type ChapterFixture } from "../support/fixtures";

type Member = { userId: string; membershipId: string; email: string };

async function day(db: Db, offset: number): Promise<string> {
  const r = await db.pg.query<{ d: string }>("select (current_date + $1::int)::text as d", [offset]);
  return r.rows[0].d;
}

describe("officer permissions", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let president: Member;
  let vp: Member;
  let treasurer: Member;
  let recruiter: Member;
  let member: Member;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    president = await addMember(db, chapter, "Pat President", ["president"]);
    vp = await addMember(db, chapter, "Vic Vice", ["vice_president"]);
    treasurer = await addMember(db, chapter, "Tia Treasurer", ["treasurer"]);
    recruiter = await addMember(db, chapter, "Rae Recruit", ["recruitment_chair"]);
    member = await addMember(db, chapter, "Sam Member");
  });

  it("gives the vice president the president's visibility without control of the chapter", async () => {
    const vpPerms = await db.rpc<string[]>("authenticated", vp.userId, "my_permissions", { p_chapter: chapter.chapterId });
    const presPerms = await db.rpc<string[]>("authenticated", president.userId, "my_permissions", { p_chapter: chapter.chapterId });
    for (const p of ["finance.view", "audit.view", "recruitment.view", "standards.view", "chat.moderate", "members.manage", "analytics.view"]) {
      expect(vpPerms).toContain(p);
    }
    for (const p of ["chapter.manage", "chapter.ownership", "roles.manage", "payments.configure", "finance.manage", "finance.refund"]) {
      expect(vpPerms).not.toContain(p);
    }
    expect(vpPerms.filter((p) => !presPerms.includes(p))).toEqual([]);
    expect(presPerms.filter((p) => !vpPerms.includes(p)).sort()).toEqual(["chapter.manage", "roles.manage"]);
  });

  it("lets the vice president suspend members but not officers who outrank them", async () => {
    await expectDenied(
      db.rpc("authenticated", vp.userId, "update_membership", { p_membership: president.membershipId, p_member_class: "active", p_status: "suspended", p_reason: "test" }),
      /permissions you do not have/,
    );
    await expectDenied(
      db.rpc("authenticated", vp.userId, "update_membership", { p_membership: treasurer.membershipId, p_member_class: "active", p_status: "inactive", p_reason: "test" }),
      /permissions you do not have/,
    );
    await db.rpc("authenticated", vp.userId, "update_membership", { p_membership: member.membershipId, p_member_class: "active", p_status: "inactive", p_reason: "Studying abroad" });
    await db.rpc("authenticated", vp.userId, "update_membership", { p_membership: member.membershipId, p_member_class: "active", p_status: "active", p_reason: "" });
    await db.rpc("authenticated", president.userId, "update_membership", { p_membership: vp.membershipId, p_member_class: "active", p_status: "inactive", p_reason: "test" });
    await db.rpc("authenticated", president.userId, "update_membership", { p_membership: vp.membershipId, p_member_class: "active", p_status: "active", p_reason: "" });
  });

  it("refuses to strip permissions the editor does not hold", async () => {
    const role = await db.pg.query<{ id: string }>("select id from public.roles where chapter_id = $1 and key = 'treasurer'", [chapter.chapterId]);
    await expectDenied(
      db.asUser(president.userId, (tx) => tx.query("delete from public.role_permissions where role_id = $1 and permission_key = 'finance.manage'", [role.rows[0].id])),
      /cannot remove permissions/,
    );
    await expectNoEffect(db.asUser(vp.userId, (tx) => tx.query("delete from public.role_permissions where role_id = $1", [role.rows[0].id])));
    const left = await db.pg.query("select 1 from public.role_permissions where role_id = $1 and permission_key = 'finance.manage'", [role.rows[0].id]);
    expect(left.rows.length).toBe(1);
  });

  it("lets the recruitment chair invite new members only", async () => {
    const invite = (args: Record<string, unknown>) =>
      db.rpc("authenticated", recruiter.userId, "create_chapter_invitation", {
        p_chapter: chapter.chapterId,
        p_email: "pnm@state.edu",
        p_full_name: "Pat Prospect",
        p_member_class: "new_member",
        p_role_keys: [],
        p_token_hash: `tok-${Math.random()}`,
        ...args,
      });
    expect(await invite({})).toBeTruthy();
    await expectDenied(invite({ p_member_class: "active" }), /not authorized/);
    await expectDenied(invite({ p_role_keys: ["recruitment_team"] }), /not authorized/);
    await expectDenied(
      db.rpc("authenticated", member.userId, "create_chapter_invitation", {
        p_chapter: chapter.chapterId, p_email: "x@state.edu", p_full_name: "X", p_member_class: "new_member", p_role_keys: [], p_token_hash: "tok-x",
      }),
      /not authorized/,
    );
  });

  it("backfills new permissions into chapters that already existed", async () => {
    const r = await db.pg.query<{ n: number }>(
      "select count(*)::int as n from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.chapter_id = $1 and r.key = 'vice_president' and rp.permission_key = 'audit.view'",
      [chapter.chapterId],
    );
    expect(r.rows[0].n).toBe(1);
  });
});

describe("charging a late joiner", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let early: Member;
  let late: Member;
  let vp: Member;
  let assessmentId: string;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    early = await addMember(db, chapter, "Early Bird");
    vp = await addMember(db, chapter, "Vic Vice", ["vice_president"]);
    ({ assessmentId } = await createAssessment(db, chapter, [early.membershipId], 40_000));
    late = await addMember(db, chapter, "Late Joiner");
  });

  it("charges one member for an assessment that already went out", async () => {
    const due = await day(db, 21);
    const id = await db.rpc<string>("authenticated", chapter.ownerId, "charge_member_assessment", {
      p_assessment: assessmentId, p_membership: late.membershipId, p_amount_cents: 20_000, p_due_date: due,
    });
    const row = await db.pg.query<{ amount_cents: string; due_date: string }>("select amount_cents::text, due_date::text from public.member_assessments where id = $1", [id]);
    expect(row.rows[0]).toEqual({ amount_cents: "20000", due_date: due });
    expect(await memberBalance(db, late.userId, late.membershipId)).toBe(20_000);
    const n = await db.pg.query("select 1 from public.notifications where user_id = $1 and kind = 'dues_assessed'", [late.userId]);
    expect(n.rows.length).toBe(1);
  });

  it("will not double charge and works after the assessment is closed", async () => {
    await expectDenied(
      db.rpc("authenticated", chapter.ownerId, "charge_member_assessment", { p_assessment: assessmentId, p_membership: early.membershipId }),
      /already has a charge/,
    );
    await db.asUser(chapter.ownerId, (tx) => tx.query("update public.dues_assessments set status = 'closed' where id = $1", [assessmentId]));
    const another = await addMember(db, chapter, "Even Later");
    await db.rpc("authenticated", chapter.ownerId, "charge_member_assessment", { p_assessment: assessmentId, p_membership: another.membershipId });
    const row = await db.pg.query<{ amount_cents: string; due_date: string; later: boolean }>(
      "select amount_cents::text, due_date::text, due_date >= current_date + 14 as later from public.member_assessments where assessment_id = $1 and membership_id = $2",
      [assessmentId, another.membershipId],
    );
    expect(row.rows[0].amount_cents).toBe("40000");
    expect(row.rows[0].later).toBe(true);
  });

  it("requires finance management", async () => {
    const someone = await addMember(db, chapter, "Someone");
    await expectDenied(
      db.rpc("authenticated", vp.userId, "charge_member_assessment", { p_assessment: assessmentId, p_membership: someone.membershipId }),
      /not authorized/,
    );
  });
});

describe("housing rooms", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let manager: Member;
  let a: Member;
  let b: Member;
  let c: Member;
  let roomA: string;
  let roomB: string;

  const save = (userId: string, args: Record<string, unknown>) =>
    db.rpc<string>("authenticated", userId, "save_housing_room", {
      p_chapter: chapter.chapterId, p_room: null, p_name: "Room", p_floor: null, p_capacity: 2, p_rent_cents: null, p_features: [], p_notes: null, ...args,
    });

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    manager = await addMember(db, chapter, "Hal House", ["house_manager"]);
    a = await addMember(db, chapter, "Ari");
    b = await addMember(db, chapter, "Bo");
    c = await addMember(db, chapter, "Cy");
    roomA = await save(manager.userId, { p_name: "204", p_floor: "Second", p_capacity: 2, p_rent_cents: 120_000, p_features: ["Private bath", " "] });
    roomB = await save(manager.userId, { p_name: "Attic single", p_capacity: 1, p_rent_cents: 90_000 });
  });

  it("only lets housing managers edit rooms", async () => {
    await expectDenied(save(a.userId, { p_name: "Mine" }), /not authorized/);
    await expectDenied(
      db.asUser(manager.userId, (tx) => tx.query("insert into public.housing_rooms (chapter_id, name, created_by) values ($1, 'Sneaky', $2)", [chapter.chapterId, manager.userId])),
    );
    const seen = await db.asUser(a.userId, (tx) => tx.query<{ name: string; features: string[] }>("select name, features from public.housing_rooms where chapter_id = $1 order by name", [chapter.chapterId]));
    expect(seen.rows.map((r) => r.name)).toEqual(["204", "Attic single"]);
    expect(seen.rows[0].features).toEqual(["Private bath"]);
  });

  it("enforces capacity, beds, and one room per member", async () => {
    const today = await day(db, 0);
    await db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomA, p_membership: a.membershipId, p_starts_on: today, p_ends_on: null, p_bed: "A" });
    await expectDenied(
      db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomA, p_membership: b.membershipId, p_starts_on: today, p_ends_on: null, p_bed: "a" }),
      /bed is already taken/,
    );
    await db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomA, p_membership: b.membershipId, p_starts_on: today, p_ends_on: null, p_bed: "B" });
    await expectDenied(
      db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomA, p_membership: c.membershipId, p_starts_on: today, p_ends_on: null, p_bed: null }),
      /full/,
    );
    await expectDenied(
      db.rpc("authenticated", manager.userId, "save_housing_room", { p_chapter: chapter.chapterId, p_room: roomA, p_name: "204", p_floor: null, p_capacity: 1, p_rent_cents: 120_000, p_features: [], p_notes: null }),
      /lowering capacity/,
    );
    await expectDenied(db.rpc("authenticated", manager.userId, "set_housing_room_archived", { p_room: roomA, p_archived: true }), /move everyone out/);
    await expectDenied(
      db.asUser(manager.userId, (tx) => tx.query("insert into public.room_assignments (chapter_id, room_id, membership_id, starts_on, assigned_by) values ($1, $2, $3, current_date, $4)", [chapter.chapterId, roomB, c.membershipId, manager.userId])),
    );
  });

  it("moves a resident by closing their old assignment", async () => {
    const later = await day(db, 10);
    await db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomB, p_membership: b.membershipId, p_starts_on: later, p_ends_on: null, p_bed: null });
    const rows = await db.pg.query<{ room_id: string; ends_on: string | null }>(
      "select room_id, ends_on::text from public.room_assignments where membership_id = $1 order by starts_on",
      [b.membershipId],
    );
    expect(rows.rows).toEqual([{ room_id: roomA, ends_on: await day(db, 9) }, { room_id: roomB, ends_on: null }]);
    const n = await db.pg.query<{ title: string }>("select title from public.notifications where user_id = $1 and kind = 'housing_update' order by created_at", [b.userId]);
    expect(n.rows.map((r) => r.title)).toContain("You are moving to Attic single");
  });

  it("ends and cancels assignments", async () => {
    const future = await day(db, 30);
    const id = await db.rpc<string>("authenticated", manager.userId, "assign_room", { p_room: roomA, p_membership: c.membershipId, p_starts_on: future, p_ends_on: null, p_bed: "C" });
    await db.rpc("authenticated", manager.userId, "end_room_assignment", { p_assignment: id, p_ends_on: await day(db, 0), p_reason: "Changed plans" });
    expect((await db.pg.query("select 1 from public.room_assignments where id = $1", [id])).rows.length).toBe(0);
    const current = await db.pg.query<{ id: string }>("select id from public.room_assignments where membership_id = $1", [a.membershipId]);
    await expectDenied(db.rpc("authenticated", a.userId, "end_room_assignment", { p_assignment: current.rows[0].id, p_ends_on: await day(db, 5), p_reason: null }), /not authorized/);
  });

  it("handles housing requests privately", async () => {
    const id = await db.rpc<string>("authenticated", c.userId, "submit_housing_request", {
      p_chapter: chapter.chapterId, p_term: "Fall 2027", p_rooms: [roomA], p_roommates: [a.membershipId], p_single: false, p_notes: "Quiet floor please",
    });
    const again = await db.rpc<string>("authenticated", c.userId, "submit_housing_request", {
      p_chapter: chapter.chapterId, p_term: "fall 2027", p_rooms: [roomB], p_roommates: [], p_single: true, p_notes: null,
    });
    expect(again).toBe(id);
    await expectDenied(
      db.rpc("authenticated", c.userId, "submit_housing_request", { p_chapter: chapter.chapterId, p_term: "Spring 2028", p_rooms: [], p_roommates: [c.membershipId], p_single: false, p_notes: null }),
      /other active members/,
    );
    const peek = await db.asUser(a.userId, (tx) => tx.query("select 1 from public.housing_requests where id = $1", [id]));
    expect(peek.rows.length).toBe(0);
    const mgr = await db.asUser(manager.userId, (tx) => tx.query<{ wants_single: boolean }>("select wants_single from public.housing_requests where id = $1", [id]));
    expect(mgr.rows[0].wants_single).toBe(true);
    await db.rpc("authenticated", manager.userId, "respond_housing_request", { p_request: id, p_status: "waitlisted", p_response: "You're first on the list." });
    const n = await db.pg.query<{ body: string }>("select body from public.notifications where user_id = $1 and kind = 'housing_update'", [c.userId]);
    expect(n.rows.map((r) => r.body)).toContain("You're first on the list.");
    await db.rpc("authenticated", c.userId, "withdraw_housing_request", { p_request: id });
  });

  it("refuses a request from someone who already has a room and lets a request be deleted", async () => {
    await expectDenied(
      db.rpc("authenticated", a.userId, "submit_housing_request", { p_chapter: chapter.chapterId, p_term: "Fall 2027", p_rooms: [], p_roommates: [], p_single: false, p_notes: null }),
      /already have a room/,
    );
    const id = await db.rpc<string>("authenticated", c.userId, "submit_housing_request", {
      p_chapter: chapter.chapterId, p_term: "Spring 2028", p_rooms: [], p_roommates: [], p_single: false, p_notes: null,
    });
    await expectDenied(
      db.rpc("authenticated", manager.userId, "respond_housing_request", { p_request: id, p_status: "placed", p_response: null }),
      /assign them a room/,
    );
    await expectDenied(db.rpc("authenticated", b.userId, "delete_housing_request", { p_request: id }), /not authorized/);
    await db.rpc("authenticated", c.userId, "delete_housing_request", { p_request: id });
    expect((await db.pg.query("select 1 from public.housing_requests where id = $1", [id])).rows).toHaveLength(0);
    const again = await db.rpc<string>("authenticated", c.userId, "submit_housing_request", {
      p_chapter: chapter.chapterId, p_term: "Spring 2028", p_rooms: [], p_roommates: [], p_single: false, p_notes: null,
    });
    await db.rpc("authenticated", manager.userId, "delete_housing_request", { p_request: again });
    expect((await db.pg.query("select 1 from public.housing_requests where id = $1", [again])).rows).toHaveLength(0);
  });

  it("replaces a same-day assignment when someone moves", async () => {
    const today = await day(db, 0);
    const until = await day(db, 9);
    const roomC = await save(manager.userId, { p_name: "103", p_capacity: 1 });
    await db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomB, p_membership: c.membershipId, p_starts_on: today, p_ends_on: until, p_bed: null });
    await db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomC, p_membership: c.membershipId, p_starts_on: today, p_ends_on: until, p_bed: null });
    const rows = await db.pg.query<{ room_id: string }>("select room_id from public.room_assignments where membership_id = $1", [c.membershipId]);
    expect(rows.rows).toEqual([{ room_id: roomC }]);
    await expectDenied(
      db.rpc("authenticated", manager.userId, "assign_room", { p_room: roomC, p_membership: c.membershipId, p_starts_on: today, p_ends_on: until, p_bed: null }),
      /already assigned to this room/,
    );
  });

  it("bills current residents their room's rent", async () => {
    const due = await day(db, 14);
    await expectDenied(db.rpc("authenticated", manager.userId, "bill_room_rent", { p_chapter: chapter.chapterId, p_title: "Rent", p_due_date: due }), /not authorized/);
    const result = await db.rpc<{ assessment_id: string; count: number }>("authenticated", chapter.ownerId, "bill_room_rent", { p_chapter: chapter.chapterId, p_title: "October rent", p_due_date: due });
    expect(result.count).toBe(2);
    const rows = await db.pg.query<{ membership_id: string; amount_cents: string }>("select membership_id, amount_cents::text from public.member_assessments where assessment_id = $1", [result.assessment_id]);
    expect(Object.fromEntries(rows.rows.map((r) => [r.membership_id, r.amount_cents]))).toEqual({ [a.membershipId]: "120000", [b.membershipId]: "120000" });
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "bill_room_rent", { p_chapter: chapter.chapterId, p_title: "october rent", p_due_date: due }), /already exists/);
  });
});
