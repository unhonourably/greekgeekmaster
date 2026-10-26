import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

type Manual = { user_id: string; email_confirmed_now: boolean; accepted: string[]; failed: { chapter: string; reason: string }[] };

describe("manual invitation acceptance", () => {
  let db: Db;
  let chapter: ChapterFixture;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
  });

  async function invite(email: string, hash: string) {
    await db.rpc("authenticated", chapter.ownerId, "create_chapter_invitation", {
      p_chapter: chapter.chapterId,
      p_email: email,
      p_full_name: null,
      p_member_class: "new_member",
      p_role_keys: [],
      p_token_hash: hash,
      p_import_batch: null,
    });
  }

  it("still accepts through the API for the invited account", async () => {
    await invite("api.invitee@state.edu", "b".repeat(64));
    const userId = await db.createUser("api.invitee@state.edu", "Api Invitee");
    const chapterId = await db.rpc<string>("authenticated", userId, "accept_chapter_invitation", { p_token_hash: "b".repeat(64) });
    expect(chapterId).toBe(chapter.chapterId);
    const other = await db.createUser("someone.else@state.edu", "Someone Else");
    await invite("third@state.edu", "c".repeat(64));
    await expectDenied(db.rpc("authenticated", other, "accept_chapter_invitation", { p_token_hash: "c".repeat(64) }), /different email/);
  });

  it("confirms the email and accepts pending invitations from the SQL editor", async () => {
    await invite("Manual.Invitee@state.edu", "d".repeat(64));
    const inserted = await db.pg.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ('manual.invitee@state.edu', '{\"full_name\":\"Manual Invitee\"}') returning id");
    const userId = inserted.rows[0].id;
    const r = await db.pg.query<{ result: Manual }>("select private.manually_accept_invitations(' manual.invitee@state.edu ') as result");
    const result = r.rows[0].result;
    expect(result.user_id).toBe(userId);
    expect(result.email_confirmed_now).toBe(true);
    expect(result.accepted).toHaveLength(1);
    expect(result.failed).toEqual([]);
    const confirmed = await db.pg.query("select 1 from auth.users where id = $1 and email_confirmed_at is not null", [userId]);
    expect(confirmed.rows).toHaveLength(1);
    const m = await db.pg.query("select status, member_class from public.memberships where chapter_id = $1 and user_id = $2", [chapter.chapterId, userId]);
    expect(m.rows).toEqual([{ status: "active", member_class: "new_member" }]);
    const inv = await db.pg.query("select status, accepted_by from public.chapter_invitations where token_hash = $1", ["d".repeat(64)]);
    expect(inv.rows).toEqual([{ status: "accepted", accepted_by: userId }]);
  });

  it("publishes GreekGeek-branded legal documents without touching accepted versions", async () => {
    const latest = await db.pg.query<{ kind: string; version: string; title: string; body: string }>(
      "select distinct on (kind) kind, version, title, body from public.terms_documents where published_at is not null order by kind, published_at desc",
    );
    expect(latest.rows.map((r) => r.version)).toEqual(["2026-10-21.1", "2026-10-21.1", "2026-10-21.1"]);
    for (const r of latest.rows) {
      expect(r.body).not.toMatch(/\bChapter\b/);
      expect(`${r.title} ${r.body}`).toMatch(/GreekGeek/);
    }
    const original = await db.pg.query<{ body: string }>("select body from public.terms_documents where kind = 'chapter_agreement' and version = '2026-10-21'");
    expect(original.rows[0].body).toMatch(/Chapter charges a platform fee/);
    const plan = await db.pg.query("select name from public.saas_plans where code = 'chapter_monthly'");
    expect(plan.rows).toEqual([{ name: "GreekGeek subscription" }]);
  });

  it("reports a missing account and is not callable through the API", async () => {
    await expect(db.pg.query("select private.manually_accept_invitations('ghost@state.edu')")).rejects.toThrow(/sign up first/);
    await expectDenied(db.rpc("authenticated", chapter.ownerId, "manually_accept_invitations", { p_email: "ghost@state.edu" }));
  });
});
