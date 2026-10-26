import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createUniversity, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("platform admin verification bypass", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createDb();
  });

  it("creates the chapter immediately when an administrator submits, without a verification method", async () => {
    const uni = await createUniversity(db);
    const admin = await db.createUser("bypass-admin@platform.test", "Bypass Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    const app = await db.asUser(admin, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.chapter_applications (applicant_id, applicant_full_name, intended_role, university_id, organization_name, designation)
         values ($1, 'Bypass Admin', 'president', $2, 'Admin House', 'Alpha') returning id`,
        [admin, uni],
      );
      return r.rows[0].id;
    });
    const status = await db.rpc<string>("authenticated", admin, "submit_chapter_application", { p_application: app });
    expect(status).toBe("verified");
    const row = await db.pg.query<{ status: string; slug: string }>(
      `select a.status::text, c.slug from public.chapter_applications a
       join public.chapters c on c.id = a.created_chapter_id where a.id = $1`,
      [app],
    );
    expect(row.rows[0].status).toBe("verified");
    expect(row.rows[0].slug.length).toBeGreaterThan(2);
    const member = await db.pg.query("select 1 from public.memberships where user_id = $1 and status = 'active'", [admin]);
    expect(member.rows).toHaveLength(1);
  });

  it("still requires verification from everyone else", async () => {
    const uni = await createUniversity(db);
    const applicant = await db.createUser("plain@state.edu", "Plain Applicant");
    const app = await db.asUser(applicant, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.chapter_applications (applicant_id, applicant_full_name, intended_role, university_id, organization_name, designation)
         values ($1, 'Plain Applicant', 'president', $2, 'Plain House', 'Beta') returning id`,
        [applicant, uni],
      );
      return r.rows[0].id;
    });
    await expectDenied(db.rpc("authenticated", applicant, "submit_chapter_application", { p_application: app }), /verification method/);
  });
});

describe("removing a member", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let member: { userId: string; membershipId: string };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    member = await addMember(db, chapter, "Removable Member");
  });

  it("lets an officer end the membership, roles, and chat access, and tells the member", async () => {
    const main = (await db.pg.query<{ id: string }>("select id from public.conversations where chapter_id = $1 and kind = 'chapter_main'", [chapter.chapterId])).rows[0].id;
    await db.asUser(member.userId, (tx) =>
      tx.query("select public.send_message(p_conversation => $1, p_body => 'hello', p_parent => null, p_mentions => '{}'::uuid[], p_mention_roles => '{}'::uuid[], p_mention_all => false, p_attachments => '[]'::jsonb)", [main]),
    );
    await expectDenied(db.rpc("authenticated", member.userId, "remove_chapter_member", { p_membership: chapter.ownerMembershipId, p_reason: "coup" }));
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "remove_chapter_member", { p_membership: chapter.ownerMembershipId, p_reason: "leaving" }), /yourself/);
    await db.rpc("authenticated", chapter.ownerId, "remove_chapter_member", { p_membership: member.membershipId, p_reason: "No longer enrolled" });
    const status = await db.pg.query<{ status: string; end_reason: string }>("select status::text, end_reason from public.memberships where id = $1", [member.membershipId]);
    expect(status.rows[0]).toEqual({ status: "ended", end_reason: "No longer enrolled" });
    const roles = await db.pg.query("select 1 from public.role_assignments where membership_id = $1 and ends_at is null", [member.membershipId]);
    expect(roles.rows).toHaveLength(0);
    const chat = await db.pg.query("select 1 from public.conversation_members where user_id = $1 and chapter_id = $2 and removed_at is null", [member.userId, chapter.chapterId]);
    expect(chat.rows).toHaveLength(0);
    const note = await db.pg.query("select 1 from public.notifications where user_id = $1 and kind = 'membership_removed'", [member.userId]);
    expect(note.rows).toHaveLength(1);
    await expectDenied(
      db.asUser(member.userId, (tx) => tx.query("select public.send_message(p_conversation => $1, p_body => 'still here', p_parent => null, p_mentions => '{}'::uuid[], p_mention_roles => '{}'::uuid[], p_mention_all => false, p_attachments => '[]'::jsonb)", [main])),
      /not authorized/,
    );
  });
});

describe("account erasure", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let member: { userId: string; membershipId: string; email: string };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    member = await addMember(db, chapter, "Leaving Member");
  });

  it("refuses the only chapter administrator and a wrong confirmation", async () => {
    const email = (await db.pg.query<{ email: string }>("select email from auth.users where id = $1", [chapter.ownerId])).rows[0].email;
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "erase_my_account", { p_confirmation: email }), /transfer chapter ownership/);
    await expectDenied(db.rpc("authenticated", member.userId, "erase_my_account", { p_confirmation: "nope@state.edu" }), /email address/);
  });

  it("exports personal data, then erases it while keeping the membership row", async () => {
    const main = (await db.pg.query<{ id: string }>("select id from public.conversations where chapter_id = $1 and kind = 'chapter_main'", [chapter.chapterId])).rows[0].id;
    await db.asUser(member.userId, (tx) =>
      tx.query("select public.send_message(p_conversation => $1, p_body => 'my private note', p_parent => null, p_mentions => '{}'::uuid[], p_mention_roles => '{}'::uuid[], p_mention_all => false, p_attachments => '[]'::jsonb)", [main]),
    );
    const exported = await db.rpc<{ email: string; messages: Array<{ body: string }> }>("authenticated", member.userId, "export_my_data");
    expect(exported.email).toBe(member.email);
    expect(exported.messages.some((m) => m.body === "my private note")).toBe(true);

    await db.rpc("authenticated", member.userId, "erase_my_account", { p_confirmation: member.email });

    const profile = await db.pg.query<{ display_name: string; full_name: string; erased_at: string | null }>("select display_name, full_name, erased_at from public.profiles where id = $1", [member.userId]);
    expect(profile.rows[0].display_name).toBe("Deleted member");
    expect(profile.rows[0].full_name).toBe("");
    expect(profile.rows[0].erased_at).not.toBeNull();
    const auth = await db.pg.query<{ email: string }>("select email from auth.users where id = $1", [member.userId]);
    expect(auth.rows[0].email).toBe(`deleted-${member.userId}@deleted.invalid`);
    const body = await db.pg.query<{ body: string; deleted_at: string | null }>("select body, deleted_at from public.messages where sender_id = $1", [member.userId]);
    expect(body.rows.every((m) => m.body === "" && m.deleted_at)).toBe(true);
    const membership = await db.pg.query<{ status: string }>("select status::text from public.memberships where id = $1", [member.membershipId]);
    expect(membership.rows[0].status).toBe("ended");
    await expectDenied(db.asUser(member.userId, (tx) => tx.query("update public.profiles set display_name = 'Back' where id = $1", [member.userId])), /deleted/);
    await expectDenied(db.rpc("authenticated", member.userId, "erase_my_account", { p_confirmation: auth.rows[0].email }), /already been deleted/);
  });
});
