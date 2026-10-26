import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

type Option = { membership_id: string; name: string; recruitment_role: boolean };
type Dashboard = {
  members: { active: number; officers: number; joined_30d: number; pending_invitations: number; by_class: Record<string, number> };
  growth: Array<{ month: string; joined: number }>;
  recruitment: { credited_30d: number; top_recruiters: Array<{ membership_id: string; name: string; count: number }> };
  finance: { billed_cents: number } | null;
};

describe("recruiter credit and officer insights", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let chair: { userId: string; membershipId: string };
  let regular: { userId: string; membershipId: string };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    chair = await addMember(db, chapter, "Riley Rush", ["recruitment_chair"]);
    regular = await addMember(db, chapter, "Sam Regular");
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

  it("lets the invitee pick a rush chair and records it for officers only", async () => {
    await invite("pledge.one@state.edu", "e".repeat(64));
    const pledge = await db.createUser("pledge.one@state.edu", "Pledge One");
    const options = await db.as("authenticated", pledge, (tx) =>
      tx.query<Option>("select * from public.invitation_recruiter_options($1)", ["e".repeat(64)]),
    );
    expect(options.rows[0]).toMatchObject({ membership_id: chair.membershipId, recruitment_role: true });
    expect(options.rows.find((o) => o.membership_id === regular.membershipId)?.recruitment_role).toBe(false);
    const stranger = await db.createUser("stranger@state.edu", "Stranger");
    await expectDenied(db.as("authenticated", stranger, (tx) => tx.query("select * from public.invitation_recruiter_options($1)", ["e".repeat(64)])), /not authorized/);

    await db.rpc("authenticated", pledge, "accept_chapter_invitation", { p_token_hash: "e".repeat(64), p_recruited_by: chair.membershipId });
    const asOwner = await db.asUser(chapter.ownerId, (tx) => tx.query<{ recruiter_membership_id: string; source: string }>("select recruiter_membership_id, source from public.membership_recruiters"));
    expect(asOwner.rows).toEqual([{ recruiter_membership_id: chair.membershipId, source: "self_reported" }]);
    const asRegular = await db.asUser(regular.userId, (tx) => tx.query("select 1 from public.membership_recruiters"));
    expect(asRegular.rows).toHaveLength(0);
    const asPledge = await db.asUser(pledge, (tx) => tx.query("select 1 from public.membership_recruiters"));
    expect(asPledge.rows).toHaveLength(0);
  });

  it("rejects a recruiter from another chapter and accepts an unsure answer", async () => {
    const uni = await db.pg.query<{ university_id: string }>("select university_id from public.chapters where id = $1", [chapter.chapterId]);
    const other = await createVerifiedChapter(db, { universityId: uni.rows[0].university_id, reviewerId: chapter.reviewerId });
    await invite("pledge.two@state.edu", "f".repeat(64));
    const pledge = await db.createUser("pledge.two@state.edu", "Pledge Two");
    await expectDenied(
      db.rpc("authenticated", pledge, "accept_chapter_invitation", { p_token_hash: "f".repeat(64), p_recruited_by: other.ownerMembershipId }),
      /current member/,
    );
    const notJoined = await db.pg.query("select 1 from public.memberships where chapter_id = $1 and user_id = $2", [chapter.chapterId, pledge]);
    expect(notJoined.rows).toHaveLength(0);
    await db.rpc("authenticated", pledge, "accept_chapter_invitation", { p_token_hash: "f".repeat(64), p_recruiter_answered: true });
    const row = await db.pg.query("select recruiter_membership_id from public.membership_recruiters mr join public.memberships m on m.id = mr.membership_id where m.user_id = $1", [pledge]);
    expect(row.rows).toEqual([{ recruiter_membership_id: null }]);
  });

  it("lets officers correct the recruiter but not regular members", async () => {
    const m = await db.pg.query<{ id: string }>("select m.id from public.memberships m join public.profiles p on p.id = m.user_id where p.full_name = 'Pledge Two'");
    await expectDenied(db.rpc("authenticated", regular.userId, "set_member_recruiter", { p_membership: m.rows[0].id, p_recruiter: chair.membershipId }), /not authorized/);
    await db.rpc("authenticated", chapter.ownerId, "set_member_recruiter", { p_membership: m.rows[0].id, p_recruiter: chair.membershipId });
    const row = await db.pg.query("select recruiter_membership_id, source from public.membership_recruiters where membership_id = $1", [m.rows[0].id]);
    expect(row.rows).toEqual([{ recruiter_membership_id: chair.membershipId, source: "officer" }]);
  });

  it("summarizes the chapter for officers only", async () => {
    const d = await db.rpc<Dashboard>("authenticated", chapter.ownerId, "chapter_officer_dashboard", { p_chapter: chapter.chapterId });
    expect(d.members.active).toBe(5);
    expect(d.members.by_class.new_member).toBe(2);
    expect(d.members.joined_30d).toBe(5);
    expect(d.members.officers).toBeGreaterThanOrEqual(2);
    expect(d.growth).toHaveLength(6);
    expect(d.growth.at(-1)?.joined).toBe(5);
    expect(d.recruitment.credited_30d).toBe(2);
    expect(d.recruitment.top_recruiters[0]).toMatchObject({ membership_id: chair.membershipId, name: "Riley Rush", count: 2 });
    await expectDenied(db.rpc("authenticated", regular.userId, "chapter_officer_dashboard", { p_chapter: chapter.chapterId }), /not authorized/);
  });
});
