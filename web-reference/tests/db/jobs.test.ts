import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createAssessment, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("scheduled jobs", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let chair: { userId: string; membershipId: string };
  let alex: { userId: string; membershipId: string };
  let blair: { userId: string; membershipId: string };

  const notes = async (userId: string, kind: string) =>
    (await db.pg.query<{ title: string; link: string; email_status: string }>("select title, link, email_status from public.notifications where user_id = $1 and kind = $2 order by created_at", [userId, kind])).rows;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    chair = await addMember(db, chapter, "Riley Chair", ["recruitment_chair"]);
    alex = await addMember(db, chapter, "Alex Member");
    blair = await addMember(db, chapter, "Blair Member");
  });

  it("can only be run by the service role", async () => {
    for (const fn of ["service_recruitment_followups", "service_event_reminders", "service_dues_reminders", "service_apply_late_fees"]) {
      await expectDenied(db.rpc("authenticated", alex.userId, fn, {}));
    }
  });

  it("reminds recruiters about due follow-ups once per day", async () => {
    await db.rpc("authenticated", chair.userId, "ensure_recruitment_stages", { p_chapter: chapter.chapterId });
    const stage = (await db.pg.query<{ id: string }>("select id from public.recruitment_stages where chapter_id = $1 order by position limit 1", [chapter.chapterId])).rows[0].id;
    await db.pg.query(
      "insert into public.prospects (chapter_id, full_name, stage_id, owner_membership_id, created_by, next_follow_up_at) values ($1, 'Jamie Prospect', $2, $3, $4, now() - interval '1 hour'), ($1, 'Later Prospect', $2, $3, $4, now() + interval '2 days')",
      [chapter.chapterId, stage, chair.membershipId, chair.userId],
    );
    expect(await db.rpc<number>("service_role", null, "service_recruitment_followups", {})).toBe(1);
    expect(await db.rpc<number>("service_role", null, "service_recruitment_followups", {})).toBe(0);
    const rows = await notes(chair.userId, "recruitment_followup");
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Follow up with Jamie Prospect");
    expect(rows[0].email_status).toBe("skipped");
  });

  it("sends event reminders to attendees and required members but not decliners", async () => {
    const event = (
      await db.pg.query<{ id: string }>(
        "insert into public.events (chapter_id, title, starts_at, ends_at, attendance_required, created_by) values ($1, 'Chapter meeting', now() + interval '3 hours', now() + interval '4 hours', true, $2) returning id",
        [chapter.chapterId, chapter.ownerId],
      )
    ).rows[0].id;
    await db.rpc("authenticated", blair.userId, "rsvp_event", { p_event: event, p_status: "not_going" });
    const queued = await db.rpc<number>("service_role", null, "service_event_reminders", {});
    expect(queued).toBe(3);
    expect(await notes(alex.userId, "event_reminder")).toHaveLength(1);
    expect(await notes(blair.userId, "event_reminder")).toHaveLength(0);
    expect(await db.rpc<number>("service_role", null, "service_event_reminders", {})).toBe(0);
  });

  it("reminds members three days before dues are due and skips voided charges", async () => {
    const { memberAssessmentIds } = await createAssessment(db, chapter, [alex.membershipId, blair.membershipId], 20_000, "Spring dues");
    await db.pg.query("update public.member_assessments set due_date = (now() at time zone 'America/New_York')::date + 3 where id = any($1::uuid[])", [Object.values(memberAssessmentIds)]);
    await db.pg.query("update public.member_assessments set status = 'voided' where id = $1", [memberAssessmentIds[blair.membershipId]]);
    expect(await db.rpc<number>("service_role", null, "service_dues_reminders", {})).toBe(1);
    const rows = await notes(alex.userId, "dues_reminder");
    expect(rows[0].title).toBe("Spring dues is due in 3 days");
    expect(rows[0].link).toBe(`/c/${chapter.slug}/dues`);
    expect(await db.rpc<number>("service_role", null, "service_dues_reminders", {})).toBe(0);
  });

  it("re-claims emails stuck in sending after the lease expires", async () => {
    const claim = async () => (await db.asService((tx) => tx.query<{ id: string; attempts: number }>("select id, attempts from public.service_claim_notification_emails(100)"))).rows;
    const first = await claim();
    expect(first.length).toBeGreaterThan(0);
    expect(await claim()).toHaveLength(0);
    await db.pg.query("update public.notifications set email_next_attempt_at = now() - interval '1 minute' where id = $1", [first[0].id]);
    const reclaimed = await claim();
    expect(reclaimed.map((r) => r.id)).toEqual([first[0].id]);
    expect(reclaimed[0].attempts).toBe(2);
  });
});
