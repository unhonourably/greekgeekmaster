import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("announcement comments", () => {
  let db: Db;
  let chapter: ChapterFixture;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
  });

  it("lets members comment, lets officers remove comments, and lets only the author turn comments off", async () => {
    const member = await addMember(db, chapter, "Casey Member");
    const officer = await addMember(db, chapter, "Riley Officer", ["secretary"]);
    const announcement = await db.asUser(chapter.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.announcements (chapter_id, author_id, title, body)
         values ($1, $2, 'House meeting', 'Be there at 7') returning id`,
        [chapter.chapterId, chapter.ownerId],
      );
      return r.rows[0].id;
    });
    const memberComment = await db.asUser(member.userId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.announcement_comments (announcement_id, chapter_id, author_id, body)
         values ($1, $2, $3, 'See you there') returning id`,
        [announcement, chapter.chapterId, member.userId],
      );
      return r.rows[0].id;
    });
    const officerComment = await db.asUser(officer.userId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.announcement_comments (announcement_id, chapter_id, author_id, body)
         values ($1, $2, $3, 'I will bring the agenda') returning id`,
        [announcement, chapter.chapterId, officer.userId],
      );
      return r.rows[0].id;
    });

    await expectDenied(
      db.asUser(member.userId, (tx) => tx.query(`delete from public.announcement_comments where id = $1`, [officerComment])),
      /not authorized/i,
    );
    await db.asUser(officer.userId, (tx) => tx.query(`delete from public.announcement_comments where id = $1`, [memberComment]));
    const removed = await db.pg.query("select 1 from public.announcement_comments where id = $1", [memberComment]);
    expect(removed.rows).toHaveLength(0);

    await expectDenied(
      db.asUser(officer.userId, (tx) => tx.query(`update public.announcements set comments_enabled = false where id = $1`, [announcement])),
      /author/i,
    );
    await db.asUser(chapter.ownerId, (tx) => tx.query(`update public.announcements set comments_enabled = false where id = $1`, [announcement]));
    await expectDenied(
      db.asUser(member.userId, (tx) =>
        tx.query(
          `insert into public.announcement_comments (announcement_id, chapter_id, author_id, body) values ($1, $2, $3, 'One more')`,
          [announcement, chapter.chapterId, member.userId],
        ),
      ),
      /turned off|permission|policy/i,
    );
  });

  it("rejects picture paths that are not chapter files and unknown setup skips", async () => {
    const bad = await db.pg.query<{ ok: boolean }>("select private.valid_image_paths(array['not-a-file']) as ok");
    expect(bad.rows[0].ok).toBe(false);
    const good = await db.pg.query<{ ok: boolean }>(
      "select private.valid_image_paths(array['11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png']) as ok",
    );
    expect(good.rows[0].ok).toBe(true);
    await expect(db.pg.query(`update public.chapters set setup_skipped = array['not-a-step'] where id = $1`, [chapter.chapterId])).rejects.toThrow();
  });
});
