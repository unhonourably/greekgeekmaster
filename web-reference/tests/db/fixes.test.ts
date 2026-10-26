import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

type AddResult = { status: "added" | "already_member" | "no_account"; membership_id?: string };

describe("follow-up fixes", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let member: { userId: string; membershipId: string };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    member = await addMember(db, chapter, "Pat Member");
  });

  it("marks list_incident_reports volatile so the API can write its audit entry", async () => {
    const r = await db.pg.query<{ provolatile: string }>("select provolatile from pg_proc where proname = 'list_incident_reports'");
    expect(r.rows).toEqual([{ provolatile: "v" }]);
  });

  it("returns chapter, membership, and permissions in one call, only to members", async () => {
    type Ctx = { chapter: { id: string; slug: string; university: { name: string } | null }; membership: { id: string; status: string }; permissions: string[] } | null;
    const owner = await db.rpc<Ctx>("authenticated", chapter.ownerId, "my_chapter_context", { p_slug: chapter.slug });
    expect(owner?.chapter.id).toBe(chapter.chapterId);
    expect(owner?.chapter.university?.name).toBe("State University");
    expect(owner?.membership).toEqual({ id: chapter.ownerMembershipId, member_class: "active", status: "active" });
    const direct = await db.rpc<string[]>("authenticated", chapter.ownerId, "my_permissions", { p_chapter: chapter.chapterId });
    expect(owner?.permissions).toEqual(direct);
    expect(owner?.permissions).toContain("members.manage");
    const plain = await db.rpc<Ctx>("authenticated", member.userId, "my_chapter_context", { p_slug: chapter.slug });
    expect(plain?.permissions).not.toContain("members.manage");
    const outsider = await db.createUser("ctx-outsider@other.edu", "Ctx Outsider");
    expect(await db.rpc<Ctx>("authenticated", outsider, "my_chapter_context", { p_slug: chapter.slug })).toBeNull();
  });

  it("adds an existing account straight to the roster and notifies them", async () => {
    const userId = await db.createUser("jordan.added@state.edu", "Jordan Added");
    const result = await db.rpc<AddResult>("authenticated", chapter.ownerId, "add_existing_member", { p_chapter: chapter.chapterId, p_email: " Jordan.Added@state.edu ", p_member_class: "new_member" });
    expect(result.status).toBe("added");
    const m = await db.pg.query<{ id: string; status: string; member_class: string; invited_by: string }>("select id, status, member_class, invited_by from public.memberships where chapter_id = $1 and user_id = $2", [chapter.chapterId, userId]);
    expect(m.rows).toEqual([{ id: result.membership_id, status: "active", member_class: "new_member", invited_by: chapter.ownerId }]);
    const n = await db.pg.query<{ link: string }>("select link from public.notifications where user_id = $1 and kind = 'membership_added'", [userId]);
    expect(n.rows).toEqual([{ link: `/c/${chapter.slug}` }]);
    const audit = await db.pg.query("select 1 from public.audit_logs where chapter_id = $1 and action = 'membership.added'", [chapter.chapterId]);
    expect(audit.rows).toHaveLength(1);
    const again = await db.rpc<AddResult>("authenticated", chapter.ownerId, "add_existing_member", { p_chapter: chapter.chapterId, p_email: "jordan.added@state.edu", p_member_class: "active" });
    expect(again.status).toBe("already_member");
  });

  it("reports when no confirmed account uses the email", async () => {
    const none = await db.rpc<AddResult>("authenticated", chapter.ownerId, "add_existing_member", { p_chapter: chapter.chapterId, p_email: "nobody@state.edu", p_member_class: "active" });
    expect(none.status).toBe("no_account");
    await db.pg.query("insert into auth.users (email, raw_user_meta_data) values ('unconfirmed@state.edu', '{}')");
    const unconfirmed = await db.rpc<AddResult>("authenticated", chapter.ownerId, "add_existing_member", { p_chapter: chapter.chapterId, p_email: "unconfirmed@state.edu", p_member_class: "active" });
    expect(unconfirmed.status).toBe("no_account");
  });

  it("only lets members.manage holders add people", async () => {
    await db.createUser("riley.blocked@state.edu", "Riley Blocked");
    await expectDenied(
      db.rpc("authenticated", member.userId, "add_existing_member", { p_chapter: chapter.chapterId, p_email: "riley.blocked@state.edu", p_member_class: "active" }),
      /not authorized/,
    );
    const outsider = await db.createUser("outsider@other.edu", "Out Sider");
    await expectDenied(db.rpc("authenticated", outsider, "add_existing_member", { p_chapter: chapter.chapterId, p_email: "riley.blocked@state.edu", p_member_class: "active" }), /not authorized/);
  });

  it("reactivates a former member and revokes their pending invitation", async () => {
    const former = await addMember(db, chapter, "Fran Former");
    await db.rpc("authenticated", chapter.ownerId, "update_membership", { p_membership: former.membershipId, p_member_class: "active", p_status: "ended", p_reason: "Graduated early" });
    const email = (await db.pg.query<{ email: string }>("select email from auth.users where id = $1", [former.userId])).rows[0].email;
    await db.rpc("authenticated", chapter.ownerId, "create_chapter_invitation", {
      p_chapter: chapter.chapterId,
      p_email: email,
      p_full_name: "Fran Former",
      p_member_class: "alumni",
      p_role_keys: [],
      p_token_hash: "a".repeat(64),
      p_import_batch: null,
    });
    const result = await db.rpc<AddResult>("authenticated", chapter.ownerId, "add_existing_member", { p_chapter: chapter.chapterId, p_email: email, p_member_class: "alumni" });
    expect(result).toEqual({ status: "added", membership_id: former.membershipId });
    const m = await db.pg.query("select status, member_class, ended_at from public.memberships where id = $1", [former.membershipId]);
    expect(m.rows).toEqual([{ status: "active", member_class: "alumni", ended_at: null }]);
    const inv = await db.pg.query("select status from public.chapter_invitations where chapter_id = $1 and lower(email) = lower($2) and token_hash = $3", [chapter.chapterId, email, "a".repeat(64)]);
    expect(inv.rows).toEqual([{ status: "revoked" }]);
  });
});
