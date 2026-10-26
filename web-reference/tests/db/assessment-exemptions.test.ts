import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("assessment exemptions", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let other: ChapterFixture;
  let alex: { userId: string; membershipId: string };
  let blair: { userId: string; membershipId: string };
  let outsider: { userId: string; membershipId: string };

  const draft = async (owner: ChapterFixture, title: string) =>
    db.asUser(owner.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "insert into public.dues_assessments (chapter_id, title, default_amount_cents, due_date, created_by) values ($1, $2, 45000, current_date + 30, $3) returning id",
        [owner.chapterId, title, owner.ownerId],
      );
      return r.rows[0].id;
    });

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    other = await createVerifiedChapter(db);
    alex = await addMember(db, chapter, "Alex Member");
    blair = await addMember(db, chapter, "Blair Member");
    outsider = await addMember(db, other, "Other Member");
  });

  it("records exemptions and lets the treasurer charge everyone else", async () => {
    const id = await draft(chapter, "Spring dues");
    expect(await db.rpc<number>("authenticated", chapter.ownerId, "set_assessment_exemptions", { p_assessment: id, p_memberships: [blair.membershipId] })).toBe(1);
    expect(await db.rpc<number>("authenticated", chapter.ownerId, "issue_dues_assessment", { p_assessment: id, p_memberships: [alex.membershipId], p_amount_overrides: {} })).toBe(1);
    const exempt = await db.asUser(chapter.ownerId, async (tx) => (await tx.query<{ membership_id: string }>("select membership_id from public.assessment_exemptions where assessment_id = $1", [id])).rows);
    expect(exempt.map((e) => e.membership_id)).toEqual([blair.membershipId]);
    await expectDenied(
      db.rpc("authenticated", chapter.ownerId, "set_assessment_exemptions", { p_assessment: id, p_memberships: [alex.membershipId] }),
      /already been charged/,
    );
    expect(await db.rpc<number>("authenticated", chapter.ownerId, "set_assessment_exemptions", { p_assessment: id, p_memberships: [] })).toBe(0);
  });

  it("is limited to treasurers of the same chapter", async () => {
    const id = await draft(chapter, "Fall dues");
    await expectDenied(db.rpc("authenticated", alex.userId, "set_assessment_exemptions", { p_assessment: id, p_memberships: [blair.membershipId] }), /not authorized/);
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "set_assessment_exemptions", { p_assessment: id, p_memberships: [outsider.membershipId] }), /not in this chapter/);
    const visible = await db.asUser(alex.userId, async (tx) => (await tx.query("select 1 from public.assessment_exemptions")).rows.length);
    expect(visible).toBe(0);
    await expectDenied(
      db.asUser(chapter.ownerId, (tx) =>
        tx.query("insert into public.assessment_exemptions (chapter_id, assessment_id, membership_id, created_by) values ($1, $2, $3, $4)", [chapter.chapterId, id, blair.membershipId, chapter.ownerId]),
      ),
    );
  });
});
