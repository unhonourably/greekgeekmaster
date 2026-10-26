import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

type Overview = {
  membership: { id: string; member_class: string };
  roles: Array<{ name: string }>;
  attendance: { required: number; attended: number; excused: number; missed: number };
  events_attended_90d: number;
  rsvps: Record<string, string>;
  acks: Array<{ id: string; title: string }>;
  tasks: Array<{ title: string }>;
  open_tasks: number;
  chores: Array<{ title: string }>;
  service: { approved_hours: number; pending_hours: number };
  badges: { count: number; recent: Array<{ name: string }> };
  mentorship: { mentors: Array<{ name: string }>; mentees: Array<{ name: string }> };
  chapter: { active_members: number; joined_30d: number; events_7d: number; newest: Array<{ name: string }> };
};

describe("member overview", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let sam: { userId: string; membershipId: string };
  let alex: { userId: string; membershipId: string };
  let upcoming: string;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    sam = await addMember(db, chapter, "Sam Member");
    alex = await addMember(db, chapter, "Alex Mentor");
    const c = chapter.chapterId;
    const owner = chapter.ownerId;
    await db.pg.query("update public.memberships set joined_at = now() - interval '60 days' where id = $1", [sam.membershipId]);
    const ev = async (title: string, startOffset: string, required: boolean, visibility = "chapter") => {
      const r = await db.pg.query<{ id: string }>(
        `insert into public.events (chapter_id, title, starts_at, ends_at, attendance_required, visibility, created_by)
         values ($1, $2, now() + $3::interval, now() + $3::interval + interval '1 hour', $4, $5, $6) returning id`,
        [c, title, startOffset, required, visibility, owner],
      );
      return r.rows[0].id;
    };
    const attended = await ev("Chapter meeting", "-10 days", true);
    const excused = await ev("Ritual", "-20 days", true);
    await ev("Missed meeting", "-30 days", true);
    await ev("Before joining", "-80 days", true);
    await ev("Officer retreat", "-5 days", true, "officers");
    upcoming = await ev("Formal", "3 days", false);
    await db.pg.query(
      "insert into public.event_attendance (event_id, chapter_id, membership_id, status, method) values ($1, $3, $4, 'present', 'qr'), ($2, $3, $4, 'excused', 'manual')",
      [attended, excused, c, sam.membershipId],
    );
    await db.pg.query("insert into public.event_rsvps (event_id, chapter_id, user_id, status) values ($1, $2, $3, 'going')", [upcoming, c, sam.userId]);
    await db.pg.query(
      `insert into public.announcements (chapter_id, author_id, title, body, requires_ack, audience)
       values ($1, $2, 'Read the risk policy', 'Body', true, 'all'), ($1, $2, 'Officer only ack', 'Body', true, 'officers'), ($1, $2, 'No ack needed', 'Body', false, 'all')`,
      [c, owner],
    );
    await db.pg.query(
      "insert into public.tasks (chapter_id, title, assignee_membership_id, status, created_by) values ($1, 'Bring the banner', $2, 'open', $3), ($1, 'Done already', $2, 'done', $3), ($1, 'Someone else', $4, 'open', $3)",
      [c, sam.membershipId, owner, alex.membershipId],
    );
    await db.pg.query(
      "insert into public.chores (chapter_id, title, assigned_membership_id, due_on, created_by) values ($1, 'Kitchen', $2, current_date + 2, $3), ($1, 'Far future', $2, current_date + 30, $3)",
      [c, sam.membershipId, owner],
    );
    await db.pg.query(
      "insert into public.service_hours (chapter_id, user_id, organization, hours, served_on, status) values ($1, $2, 'Food bank', 3, current_date, 'approved'), ($1, $2, 'Shelter', 2, current_date, 'submitted')",
      [c, sam.userId],
    );
    const badge = await db.pg.query<{ id: string }>("insert into public.achievement_badges (chapter_id, name) values ($1, 'Scholar') returning id", [c]);
    await db.pg.query("insert into public.member_achievements (chapter_id, membership_id, badge_id, awarded_by) values ($1, $2, $3, $4)", [c, sam.membershipId, badge.rows[0].id, owner]);
    await db.pg.query("insert into public.mentorship_pairs (chapter_id, mentor_membership_id, mentee_membership_id, created_by) values ($1, $2, $3, $4)", [c, alex.membershipId, sam.membershipId, owner]);
  });

  it("summarizes only the caller's own obligations and activity", async () => {
    const o = await db.rpc<Overview>("authenticated", sam.userId, "member_overview", { p_chapter: chapter.chapterId });
    expect(o.membership.id).toBe(sam.membershipId);
    expect(o.attendance).toEqual({ required: 3, attended: 1, excused: 1, missed: 1 });
    expect(o.events_attended_90d).toBe(1);
    expect(o.rsvps[upcoming]).toBe("going");
    expect(o.acks.map((a) => a.title)).toEqual(["Read the risk policy"]);
    expect(o.tasks.map((t) => t.title)).toEqual(["Bring the banner"]);
    expect(o.open_tasks).toBe(1);
    expect(o.chores.map((ch) => ch.title)).toEqual(["Kitchen"]);
    expect(Number(o.service.approved_hours)).toBe(3);
    expect(Number(o.service.pending_hours)).toBe(2);
    expect(o.badges.count).toBe(1);
    expect(o.badges.recent[0].name).toBe("Scholar");
    expect(o.mentorship.mentors.map((m) => m.name)).toEqual(["Alex Mentor"]);
    expect(o.chapter.events_7d).toBe(1);
    expect(o.chapter.newest.map((m) => m.name)).not.toContain("Sam Member");
  });

  it("shows the mentor side and officer-only items to the right people", async () => {
    const a = await db.rpc<Overview>("authenticated", alex.userId, "member_overview", { p_chapter: chapter.chapterId });
    expect(a.mentorship.mentees.map((m) => m.name)).toEqual(["Sam Member"]);
    expect(a.tasks.map((t) => t.title)).toEqual(["Someone else"]);
    const owner = await db.rpc<Overview>("authenticated", chapter.ownerId, "member_overview", { p_chapter: chapter.chapterId });
    expect(owner.acks.map((x) => x.title).sort()).toEqual(["Officer only ack", "Read the risk policy"]);
  });

  it("delivers announcement notifications with an anchor link", async () => {
    const n = await db.pg.query<{ link: string }>("select link from public.notifications where user_id = $1 and kind = 'announcement'", [sam.userId]);
    expect(n.rows.length).toBeGreaterThan(0);
    expect(n.rows[0].link).toMatch(/^\/c\/[^/]+\/announcements#[0-9a-f-]{36}$/);
  });

  it("refuses people outside the chapter", async () => {
    const stranger = await db.createUser("stranger@state.edu", "Stranger");
    await expectDenied(db.rpc("authenticated", stranger, "member_overview", { p_chapter: chapter.chapterId }), /not authorized/);
  });
});
