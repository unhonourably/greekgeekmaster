import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

const REASON = "The chapter is closing at the end of this semester.";

describe("chapter closure", () => {
  let db: Db;
  let chapter: ChapterFixture;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
  });

  it("lets a president request closure and only a platform admin can accept it", async () => {
    const member = await addMember(db, chapter);
    const president = await addMember(db, chapter, "Pat President", ["president"]);
    await expectDenied(db.rpc("authenticated", member.userId, "request_chapter_closure", { p_chapter: chapter.chapterId, p_reason: REASON }));
    await expectDenied(
      db.rpc("authenticated", president.userId, "request_chapter_closure", { p_chapter: chapter.chapterId, p_reason: "too short" }),
      /20/,
    );
    const requestId = await db.rpc<string>("authenticated", president.userId, "request_chapter_closure", {
      p_chapter: chapter.chapterId,
      p_reason: REASON,
    });
    await expectDenied(db.rpc("authenticated", president.userId, "request_chapter_closure", { p_chapter: chapter.chapterId, p_reason: REASON }));
    await expectDenied(db.rpc("authenticated", chapter.reviewerId, "review_chapter_closure", { p_request: requestId, p_decision: "accepted", p_note: "Approved." }));
    const admin = await db.createUser("closure-admin@platform.test", "Closure Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    await db.rpc("authenticated", admin, "review_chapter_closure", { p_request: requestId, p_decision: "accepted", p_note: "Accepted." });
    const status = await db.pg.query<{ status: string }>("select status::text as status from public.chapters where id = $1", [chapter.chapterId]);
    expect(status.rows[0].status).toBe("closed");
    const emails = await db.rpc<string[]>("service_role", null, "chapter_manager_emails", { p_chapter: chapter.chapterId });
    expect(emails).toEqual(expect.arrayContaining([president.email]));
    const admins = await db.rpc<string[]>("service_role", null, "platform_admin_emails");
    expect(admins).toContain("closure-admin@platform.test");
  });

  it("keeps the chapter open when an administrator declines", async () => {
    const other = await createVerifiedChapter(db);
    const requestId = await db.rpc<string>("authenticated", other.ownerId, "request_chapter_closure", {
      p_chapter: other.chapterId,
      p_reason: REASON,
    });
    const admin = await db.createUser("closure-admin-2@platform.test", "Closure Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    await db.rpc("authenticated", admin, "review_chapter_closure", { p_request: requestId, p_decision: "declined", p_note: "Not enough detail." });
    const status = await db.pg.query<{ status: string }>("select status::text as status from public.chapters where id = $1", [other.chapterId]);
    expect(status.rows[0].status).toBe("verified");
    const row = await db.pg.query<{ status: string }>("select status from public.chapter_closure_requests where id = $1", [requestId]);
    expect(row.rows[0].status).toBe("declined");
  });

  it("hides account verification codes from the signed-in user", async () => {
    const userId = chapter.ownerId;
    await db.asService(async (tx) => {
      await tx.query(
        `insert into public.account_challenges (user_id, purpose, email, code_hash, expires_at)
         values ($1, 'password_change', 'owner@state.edu', 'hash', now() + interval '10 minutes')`,
        [userId],
      );
    });
    const seen = await db.asUser(userId, async (tx) => {
      const result = await tx.query("select code_hash from public.account_challenges where user_id = $1", [userId]);
      return result.rows;
    });
    expect(seen).toHaveLength(0);
    const taken = await db.rpc<boolean>("service_role", null, "email_is_taken", { p_email: "closure-admin@platform.test" });
    expect(taken).toBe(true);
  });
});
