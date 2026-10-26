import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("platform admin", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let member: { userId: string };
  let support: string;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    member = await addMember(db, chapter, "Alex Member");
    support = await db.createUser("support@platform.test", "Support Staff");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'support')", [support]);
  });

  it("limits internal application notes to reviewers and hides them from applicants", async () => {
    await expectDenied(db.rpc("authenticated", member.userId, "add_application_note", { p_application: chapter.applicationId, p_note: "x" }));
    await expectDenied(db.rpc("authenticated", support, "add_application_note", { p_application: chapter.applicationId, p_note: "x" }));
    await expectDenied(db.rpc("authenticated", chapter.reviewerId, "add_application_note", { p_application: chapter.applicationId, p_note: "  " }), /note/);
    await db.rpc("authenticated", chapter.reviewerId, "add_application_note", { p_application: chapter.applicationId, p_note: "Called the FSL office to confirm." });
    const seenByApplicant = await db.asUser(chapter.ownerId, (tx) => tx.query("select 1 from public.verification_events where kind = 'note'"));
    expect(seenByApplicant.rows).toHaveLength(0);
    const seenByReviewer = await db.asUser(chapter.reviewerId, (tx) => tx.query<{ message: string }>("select message from public.verification_events where kind = 'note'"));
    expect(seenByReviewer.rows.map((r) => r.message)).toContain("Called the FSL office to confirm.");
  });

  it("shows the chapter overview to staff only", async () => {
    await expectDenied(db.as("authenticated", member.userId, (tx) => tx.query("select * from public.platform_chapter_overview(null, null, 10, 0)")));
    const rows = await db.as("authenticated", support, (tx) =>
      tx.query<{ slug: string; status: string; active_members: string; payments_enabled: boolean; total_count: string }>("select slug, status::text, active_members::text, payments_enabled, total_count::text from public.platform_chapter_overview(null, null, 10, 0)"),
    );
    expect(rows.rows).toEqual([{ slug: chapter.slug, status: "verified", active_members: "2", payments_enabled: false, total_count: "1" }]);
  });

  it("lets only platform admins change chapter status, with a reason", async () => {
    await expectDenied(db.rpc("authenticated", support, "platform_set_chapter_status", { p_chapter: chapter.chapterId, p_status: "suspended", p_reason: "Fraud" }));
    const admin = await db.createUser("admin@platform.test", "Platform Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    await expectDenied(db.rpc("authenticated", admin, "platform_set_chapter_status", { p_chapter: chapter.chapterId, p_status: "suspended", p_reason: "" }), /reason/);
    await db.rpc("authenticated", admin, "platform_set_chapter_status", { p_chapter: chapter.chapterId, p_status: "suspended", p_reason: "Misrepresented officer status" });
    const audit = await db.pg.query<{ action: string }>("select action from public.audit_logs where chapter_id = $1 and action = 'chapter.status_changed'", [chapter.chapterId]);
    expect(audit.rows).toHaveLength(1);
  });
});
