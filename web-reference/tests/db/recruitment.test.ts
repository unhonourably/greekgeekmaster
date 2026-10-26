import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("recruitment", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let chair: { userId: string; membershipId: string };
  let recruiter: { userId: string; membershipId: string };
  let other: { userId: string; membershipId: string };
  let member: { userId: string; membershipId: string };
  let prospect: string;
  let stages: Array<{ id: string; outcome: string }>;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    chair = await addMember(db, chapter, "Riley Chair", ["recruitment_chair"]);
    recruiter = await addMember(db, chapter, "Taylor Recruiter", ["recruitment_team"]);
    other = await addMember(db, chapter, "Morgan Recruiter", ["recruitment_team"]);
    member = await addMember(db, chapter, "Pat Member");
    await expectDenied(db.rpc("authenticated", recruiter.userId, "ensure_recruitment_stages", { p_chapter: chapter.chapterId }));
    await db.rpc("authenticated", chair.userId, "ensure_recruitment_stages", { p_chapter: chapter.chapterId });
    await db.rpc("authenticated", chair.userId, "ensure_recruitment_stages", { p_chapter: chapter.chapterId });
    stages = (await db.pg.query<{ id: string; outcome: string }>("select id, outcome from public.recruitment_stages where chapter_id = $1 order by position", [chapter.chapterId])).rows;
    const r = await db.as("authenticated", recruiter.userId, (tx) =>
      tx.query<{ id: string }>(
        "insert into public.prospects (chapter_id, full_name, email, stage_id, owner_membership_id, created_by) values ($1, 'Jamie Prospect', 'jamie@state.edu', $2, $3, $4) returning id",
        [chapter.chapterId, stages[0].id, recruiter.membershipId, recruiter.userId],
      ),
    );
    prospect = r.rows[0].id;
  });

  it("seeds the default pipeline once", () => {
    expect(stages.map((s) => s.outcome)).toEqual(["open", "open", "open", "offered", "joined", "closed"]);
  });

  it("hides prospects from members without recruitment access and from platform staff", async () => {
    const seenByMember = await db.asUser(member.userId, (tx) => tx.query("select 1 from public.prospects"));
    expect(seenByMember.rows).toHaveLength(0);
    const admin = await db.createUser("staff@platform.test", "Platform Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    const seenByStaff = await db.asUser(admin, (tx) => tx.query("select 1 from public.prospects union all select 1 from public.prospect_notes"));
    expect(seenByStaff.rows).toHaveLength(0);
  });

  it("lets only the assigned recruiter or the chair edit and records stage history", async () => {
    const byOther = await db.asUser(other.userId, (tx) => tx.query("update public.prospects set stage_id = $1 where id = $2", [stages[1].id, prospect]));
    expect(byOther.affectedRows).toBe(0);
    await db.asUser(recruiter.userId, (tx) => tx.query("update public.prospects set stage_id = $1 where id = $2", [stages[1].id, prospect]));
    await db.asUser(chair.userId, (tx) => tx.query("update public.prospects set stage_id = $1 where id = $2", [stages[3].id, prospect]));
    const history = await db.pg.query<{ from_stage: string | null; to_stage: string; changed_by: string }>(
      "select from_stage, to_stage, changed_by from public.prospect_stage_history where prospect_id = $1 order by id",
      [prospect],
    );
    expect(history.rows).toEqual([
      { from_stage: null, to_stage: stages[0].id, changed_by: recruiter.userId },
      { from_stage: stages[0].id, to_stage: stages[1].id, changed_by: recruiter.userId },
      { from_stage: stages[1].id, to_stage: stages[3].id, changed_by: chair.userId },
    ]);
  });

  it("limits restricted notes to the author and the chair", async () => {
    const add = (userId: string, body: string, restricted: boolean) =>
      db.asUser(userId, (tx) => tx.query("insert into public.prospect_notes (chapter_id, prospect_id, author_id, body, restricted) values ($1, $2, $3, $4, $5)", [chapter.chapterId, prospect, userId, body, restricted]));
    await add(recruiter.userId, "Great conversation at info night", false);
    await add(recruiter.userId, "Sensitive context", true);
    const read = async (userId: string) => (await db.asUser(userId, (tx) => tx.query<{ body: string }>("select body from public.prospect_notes order by created_at"))).rows.map((r) => r.body);
    expect(await read(recruiter.userId)).toHaveLength(2);
    expect(await read(chair.userId)).toHaveLength(2);
    expect(await read(other.userId)).toEqual(["Great conversation at info night"]);
    await expectDenied(add(member.userId, "Not allowed", false));
  });

  it("rejects duplicate active prospects by email", async () => {
    await expectDenied(
      db.asUser(chair.userId, (tx) =>
        tx.query("insert into public.prospects (chapter_id, full_name, email, stage_id, created_by) values ($1, 'Jamie Again', 'JAMIE@state.edu', $2, $3)", [chapter.chapterId, stages[0].id, chair.userId]),
      ),
      /duplicate|unique/,
    );
  });
});
