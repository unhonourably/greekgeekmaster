import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("pledge role and in-house directory", () => {
  let db: Db;
  let chapter: ChapterFixture;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
  });

  it("marks actives in house or out of house, and hides housing from pledges", async () => {
    const role = await db.pg.query<{ id: string }>("select id from public.roles where chapter_id = $1 and key = 'pledge'", [chapter.chapterId]);
    expect(role.rows).toHaveLength(1);
    await db.pg.query(
      "insert into public.role_assignments (chapter_id, membership_id, role_id, assigned_by) values ($1, $2, $3, $4)",
      [chapter.chapterId, chapter.ownerMembershipId, role.rows[0].id, chapter.ownerId],
    );
    expect(await db.rpc<boolean>("authenticated", chapter.ownerId, "am_pledge", { p_chapter: chapter.chapterId })).toBe(false);

    const housed = await addMember(db, chapter, "In House Active");
    const away = await addMember(db, chapter, "Out of House Active");
    const pledge = await addMember(db, chapter, "New Pledge");
    await db.pg.query(
      "insert into public.role_assignments (chapter_id, membership_id, role_id, assigned_by) values ($1, $2, $3, $4)",
      [chapter.chapterId, pledge.membershipId, role.rows[0].id, chapter.ownerId],
    );
    const room = await db.pg.query<{ id: string }>(
      "insert into public.housing_rooms (chapter_id, name, created_by) values ($1, '201', $2) returning id",
      [chapter.chapterId, chapter.ownerId],
    );
    await db.pg.query(
      "insert into public.room_assignments (chapter_id, room_id, membership_id, starts_on, assigned_by) values ($1, $2, $3, current_date, $4)",
      [chapter.chapterId, room.rows[0].id, housed.membershipId, chapter.ownerId],
    );

    const rows = await db.asUser(chapter.ownerId, async (tx) => {
      const result = await tx.query<{ user_id: string; member_class: string; in_house: boolean | null }>(
        "select user_id, member_class::text, in_house from public.chapter_directory($1, null, 'active', null, null, 50, 0)",
        [chapter.chapterId],
      );
      return result.rows;
    });
    const byUser = new Map(rows.map((row) => [row.user_id, row.in_house]));
    expect(byUser.get(housed.userId)).toBe(true);
    expect(byUser.get(away.userId)).toBe(false);

    const onlyIn = await db.asUser(chapter.ownerId, async (tx) => {
      const result = await tx.query<{ user_id: string }>(
        "select user_id from public.chapter_directory($1, null, null, null, null, 50, 0, 'in')",
        [chapter.chapterId],
      );
      return result.rows.map((row) => row.user_id);
    });
    expect(onlyIn).toEqual([housed.userId]);

    expect(await db.rpc<boolean>("authenticated", pledge.userId, "am_pledge", { p_chapter: chapter.chapterId })).toBe(true);
    const hidden = await db.asUser(pledge.userId, async (tx) => {
      const result = await tx.query<{ in_house: boolean | null }>(
        "select in_house from public.chapter_directory($1, null, 'active', null, null, 50, 0)",
        [chapter.chapterId],
      );
      return result.rows;
    });
    expect(hidden.every((row) => row.in_house === null)).toBe(true);
    const rooms = await db.asUser(pledge.userId, async (tx) => {
      const result = await tx.query("select id from public.housing_rooms where chapter_id = $1", [chapter.chapterId]);
      return result.rows;
    });
    expect(rooms).toHaveLength(0);
    const visible = await db.asUser(chapter.ownerId, async (tx) => {
      const result = await tx.query("select id from public.housing_rooms where chapter_id = $1", [chapter.chapterId]);
      return result.rows;
    });
    expect(visible).toHaveLength(1);
  });
});
