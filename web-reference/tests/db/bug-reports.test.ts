import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";

describe("bug reports", () => {
  let db: Db;
  let admin: string;
  let support: string;
  let finance: string;
  let member: string;
  let report: string;

  const submit = (userId: string, message: string, page = "/home") =>
    db.asUser(userId, (tx) =>
      tx.query<{ id: string; number: string }>("select * from public.submit_bug_report($1, $2, $3, $4, $5)", [message, page, "Mozilla/5.0 Chrome/141.0", "1440x900", "a1b2c3d"]),
    );

  beforeAll(async () => {
    db = await createDb();
    admin = await db.createUser("founder@greekgeek.test", "Founder");
    support = await db.createUser("support@greekgeek.test", "Support Person");
    finance = await db.createUser("finance@greekgeek.test", "Finance Person");
    member = await db.createUser("member@chapter.test", "Chris Member");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin'), ($2, 'support'), ($3, 'finance')", [admin, support, finance]);
    const row = await submit(member, "The dues page shows the wrong balance after paying.", "/c/missing-chapter/dues");
    report = row.rows[0].id;
  });

  it("stores who reported it and where, and alerts admin and support", async () => {
    const saved = await db.pg.query("select reporter_id, reporter_name, reporter_email, page, viewport, build, status, number from public.bug_reports where id = $1", [report]);
    expect(saved.rows[0]).toMatchObject({ reporter_id: member, reporter_name: "Chris Member", reporter_email: "member@chapter.test", page: "/c/missing-chapter/dues", viewport: "1440x900", build: "a1b2c3d", status: "new" });
    const alerts = await db.pg.query<{ user_id: string; link: string }>("select user_id, link from public.notifications where kind = 'bug_report' order by user_id");
    expect(alerts.rows.map((row) => row.user_id).sort()).toEqual([admin, support].sort());
    expect(alerts.rows[0].link).toBe(`/admin/bugs/${report}`);
    const events = await db.pg.query("select kind, actor_id from public.bug_report_events where report_id = $1", [report]);
    expect(events.rows).toEqual([{ kind: "created", actor_id: member }]);
  });

  it("is hidden from reporters and non-support staff", async () => {
    for (const user of [member, finance]) {
      const rows = await db.asUser(user, (tx) => tx.query("select * from public.bug_reports"));
      expect(rows.rows).toHaveLength(0);
      const changed = await db.asUser(user, (tx) => tx.query("update public.bug_reports set status = 'fixed' where id = $1", [report]));
      expect(changed.rowCount).toBe(0);
    }
    await expectDenied(db.asUser(member, (tx) => tx.query("insert into public.bug_reports (page, message) values ('/x', 'a fake report here')")), /permission denied/);
    await expectDenied(db.as("anon", null, (tx) => tx.query("select * from public.submit_bug_report('Something broke on the page', '/home')")), /permission denied/);
  });

  it("logs every triage change and the fix", async () => {
    await db.asUser(support, (tx) => tx.query("update public.bug_reports set status = 'in_progress', severity = 'high', area = 'dues', assignee_id = $2 where id = $1", [report, admin]));
    await db.asUser(support, (tx) => tx.query("insert into public.bug_report_events (report_id, actor_id, kind, body) values ($1, $2, 'comment', 'Reproduced with a partial payment.')", [report, support]));
    await db.asUser(admin, (tx) => tx.query("update public.bug_reports set status = 'fixed', fix_summary = 'Balance now subtracts partial payments.', fix_ref = 'https://github.com/greekgeek/app/pull/42' where id = $1", [report]));
    const saved = await db.pg.query<{ status: string; fixed_by: string; fixed_at: Date | null; closed_at: Date | null; first_response_at: Date | null }>("select status, fixed_by, fixed_at, closed_at, first_response_at from public.bug_reports where id = $1", [report]);
    expect(saved.rows[0]).toMatchObject({ status: "fixed", fixed_by: admin });
    expect(saved.rows[0].fixed_at).not.toBeNull();
    expect(saved.rows[0].closed_at).not.toBeNull();
    expect(saved.rows[0].first_response_at).not.toBeNull();
    const events = await db.pg.query<{ kind: string; actor_id: string; to_value: string | null; ref: string | null }>("select kind, actor_id, to_value, ref from public.bug_report_events where report_id = $1 and kind <> 'created' order by created_at, kind", [report]);
    expect(events.rows.map((row) => row.kind).sort()).toEqual(["area", "assignee", "comment", "fix", "severity", "status"]);
    expect(events.rows.find((row) => row.kind === "fix")).toMatchObject({ actor_id: admin, to_value: "fixed", ref: "https://github.com/greekgeek/app/pull/42" });
    await db.asUser(admin, (tx) => tx.query("update public.bug_reports set status = 'triaged' where id = $1", [report]));
    const reopened = await db.pg.query<{ fixed_at: Date | null; closed_at: Date | null }>("select fixed_at, closed_at from public.bug_reports where id = $1", [report]);
    expect(reopened.rows[0]).toEqual({ fixed_at: null, closed_at: null });
    const last = await db.pg.query("select kind from public.bug_report_events where report_id = $1 order by created_at desc limit 1", [report]);
    expect(last.rows[0]).toEqual({ kind: "reopened" });
  });

  it("keeps the log append-only and the report text untouchable", async () => {
    await expectDenied(db.asUser(admin, (tx) => tx.query("update public.bug_reports set message = 'rewritten message here' where id = $1", [report])), /permission denied/);
    await expectDenied(db.asUser(admin, (tx) => tx.query("update public.bug_report_events set body = 'changed' where report_id = $1", [report])), /permission denied/);
    await expectDenied(db.asUser(admin, (tx) => tx.query("delete from public.bug_report_events where report_id = $1", [report])), /permission denied/);
    await expectDenied(db.asUser(support, (tx) => tx.query("insert into public.bug_report_events (report_id, actor_id, kind) values ($1, $2, 'fix')", [report, support])), /row-level security/);
    await expectDenied(db.asUser(admin, (tx) => tx.query("update public.bug_reports set assignee_id = $2 where id = $1", [report, finance])), /assignee must be/);
  });

  it("requires a target when marking a duplicate", async () => {
    const other = (await submit(member, "Balance looks wrong again on dues.")).rows[0].id;
    await expectDenied(db.asUser(admin, (tx) => tx.query("update public.bug_reports set status = 'duplicate' where id = $1", [other])), /check constraint/);
    await db.asUser(admin, (tx) => tx.query("update public.bug_reports set status = 'duplicate', duplicate_of = $2 where id = $1", [other, report]));
    const events = await db.pg.query("select kind, to_value from public.bug_report_events where report_id = $1 and kind = 'duplicate'", [other]);
    expect(events.rows).toEqual([{ kind: "duplicate", to_value: report }]);
  });

  it("limits each person to five reports an hour", async () => {
    for (let index = 0; index < 3; index += 1) await submit(member, `Another problem number ${index} here.`);
    await expectDenied(submit(member, "One report too many for this hour."), /too many reports/);
  });

  it("lists admin and support staff as assignees only for staff", async () => {
    const staff = await db.asUser(support, (tx) => tx.query<{ name: string; role: string }>("select name, role from public.bug_assignees()"));
    expect(staff.rows).toEqual([{ name: "Founder", role: "admin" }, { name: "Support Person", role: "support" }]);
    const hidden = await db.asUser(member, (tx) => tx.query("select * from public.bug_assignees()"));
    expect(hidden.rows).toHaveLength(0);
  });
});
