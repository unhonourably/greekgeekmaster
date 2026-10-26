import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("events and attendance", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let secretary: { userId: string; membershipId: string };
  let alex: { userId: string; membershipId: string };
  let blair: { userId: string; membershipId: string };

  const createEvent = async (opts: { startsInMin: number; durationMin?: number; capacity?: number | null; deadlineInMin?: number | null; visibility?: string }) => {
    const r = await db.as("authenticated", secretary.userId, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.events (chapter_id, title, starts_at, ends_at, capacity, rsvp_deadline, visibility, created_by)
         values ($1, 'Chapter meeting', now() + make_interval(mins => $2), now() + make_interval(mins => $2 + $3), $4, case when $5::int is null then null else now() + make_interval(mins => $5::int) end, $6, $7)
         returning id`,
        [chapter.chapterId, opts.startsInMin, opts.durationMin ?? 60, opts.capacity ?? null, opts.deadlineInMin ?? null, opts.visibility ?? "chapter", secretary.userId],
      ),
    );
    return r.rows[0].id;
  };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    secretary = await addMember(db, chapter, "Sam Secretary", ["secretary"]);
    alex = await addMember(db, chapter, "Alex Member");
    blair = await addMember(db, chapter, "Blair Member");
  });

  it("only lets event managers create events", async () => {
    await expectDenied(
      db.as("authenticated", alex.userId, (tx) =>
        tx.query("insert into public.events (chapter_id, title, starts_at, ends_at, created_by) values ($1, 'Party', now(), now() + interval '1 hour', $2)", [chapter.chapterId, alex.userId]),
      ),
    );
    expect(await createEvent({ startsInMin: 120 })).toMatch(/[0-9a-f-]{36}/);
  });

  it("enforces capacity and RSVP deadlines", async () => {
    const event = await createEvent({ startsInMin: 600, capacity: 1 });
    await db.rpc("authenticated", alex.userId, "rsvp_event", { p_event: event, p_status: "going" });
    await expectDenied(db.rpc("authenticated", blair.userId, "rsvp_event", { p_event: event, p_status: "going" }), /capacity/);
    await db.rpc("authenticated", blair.userId, "rsvp_event", { p_event: event, p_status: "maybe" });
    await db.rpc("authenticated", alex.userId, "rsvp_event", { p_event: event, p_status: "going" });
    const closed = await createEvent({ startsInMin: 600, deadlineInMin: -5 });
    await expectDenied(db.rpc("authenticated", alex.userId, "rsvp_event", { p_event: closed, p_status: "going" }), /closed/);
    const past = await createEvent({ startsInMin: -180, durationMin: 60 });
    await expectDenied(db.rpc("authenticated", alex.userId, "rsvp_event", { p_event: past, p_status: "going" }), /ended/);
  });

  it("hides officer-only events from regular members", async () => {
    const event = await createEvent({ startsInMin: 300, visibility: "officers" });
    const seen = await db.asUser(alex.userId, (tx) => tx.query("select 1 from public.events where id = $1", [event]));
    expect(seen.rows).toHaveLength(0);
    await expectDenied(db.rpc("authenticated", alex.userId, "rsvp_event", { p_event: event, p_status: "going" }), /not authorized/);
  });

  it("checks members in by QR only inside the window and only once", async () => {
    const live = await createEvent({ startsInMin: -5 });
    await expectDenied(db.rpc("authenticated", alex.userId, "service_qr_check_in", { p_event: live, p_user: alex.userId }));
    expect(await db.rpc<string>("service_role", null, "service_qr_check_in", { p_event: live, p_user: alex.userId })).toBe("present");
    expect(await db.rpc<string>("service_role", null, "service_qr_check_in", { p_event: live, p_user: alex.userId })).toBe("already_checked_in");
    const started = await createEvent({ startsInMin: -30 });
    expect(await db.rpc<string>("service_role", null, "service_qr_check_in", { p_event: started, p_user: blair.userId })).toBe("late");
    const future = await createEvent({ startsInMin: 240 });
    await expectDenied(db.rpc("service_role", null, "service_qr_check_in", { p_event: future, p_user: alex.userId }), /closed/);
    const outsider = await db.createUser("outsider@else.test", "Outsider");
    await expectDenied(db.rpc("service_role", null, "service_qr_check_in", { p_event: live, p_user: outsider }), /not a member/);
  });

  it("requires a reason to correct attendance and keeps a log", async () => {
    const event = await createEvent({ startsInMin: -90, durationMin: 60 });
    await expectDenied(db.rpc("authenticated", alex.userId, "record_attendance", { p_event: event, p_membership: blair.membershipId, p_status: "present", p_reason: null }), /not authorized/);
    await db.rpc("authenticated", secretary.userId, "record_attendance", { p_event: event, p_membership: blair.membershipId, p_status: "absent", p_reason: null });
    await expectDenied(db.rpc("authenticated", secretary.userId, "record_attendance", { p_event: event, p_membership: blair.membershipId, p_status: "excused", p_reason: " " }), /reason/);
    await db.rpc("authenticated", secretary.userId, "record_attendance", { p_event: event, p_membership: blair.membershipId, p_status: "excused", p_reason: "Exam conflict" });
    const log = await db.pg.query<{ from_status: string; to_status: string; reason: string }>(
      "select c.from_status, c.to_status, c.reason from public.attendance_corrections c join public.event_attendance a on a.id = c.attendance_id where a.event_id = $1",
      [event],
    );
    expect(log.rows).toEqual([{ from_status: "absent", to_status: "excused", reason: "Exam conflict" }]);
    await expectDenied(db.pg.query("delete from public.attendance_corrections"));
  });

  it("shows members only their own attendance", async () => {
    const own = await db.asUser(alex.userId, (tx) => tx.query<{ membership_id: string }>("select membership_id from public.event_attendance"));
    expect(own.rows.length).toBeGreaterThan(0);
    expect(own.rows.every((r) => r.membership_id === alex.membershipId)).toBe(true);
    const all = await db.asUser(secretary.userId, (tx) => tx.query("select distinct membership_id from public.event_attendance"));
    expect(all.rows.length).toBeGreaterThanOrEqual(2);
  });
});
