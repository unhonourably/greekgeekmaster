import { describe, expect, it } from "vitest";
import { createDb } from "../support/db";
import { addMember, createVerifiedChapter } from "../support/fixtures";

describe("member profile links", () => {
  it("opens the profile of every member listed as new", async () => {
    const db = await createDb();
    const chapter = await createVerifiedChapter(db);
    const viewer = await addMember(db, chapter, "Viewer");
    const fresh = await addMember(db, chapter, "Fresh Face");
    const o = await db.rpc<{ chapter: { newest: Array<{ user_id: string }> } }>("authenticated", viewer.userId, "member_overview", { p_chapter: chapter.chapterId });
    expect(o.chapter.newest.map((n) => n.user_id)).toContain(fresh.userId);
    for (const n of o.chapter.newest) {
      const p = await db.rpc<{ user_id: string } | null>("authenticated", viewer.userId, "member_profile", { p_chapter: chapter.chapterId, p_user: n.user_id });
      expect(p?.user_id).toBe(n.user_id);
    }
  });
});
