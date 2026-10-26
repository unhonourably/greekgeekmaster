import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";

describe("outreach", () => {
  let db: Db;
  let admin: string;
  let member: string;
  let contact: string;

  beforeAll(async () => {
    db = await createDb();
    admin = await db.createUser("founder@greekgeek.test", "Founder");
    member = await db.createUser("member@chapter.test", "Member");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    const row = await db.asUser(admin, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.outreach_contacts (university, organization, role, full_name, email)
         values ('Texas Christian University', 'MGC', 'President', 'Margarita Lopez', 'M.Lopez@tcu.edu') returning id`,
      ),
    );
    contact = row.rows[0].id;
  });

  it("is only visible to platform admins", async () => {
    const hidden = await db.asUser(member, (tx) => tx.query("select * from public.outreach_contacts"));
    expect(hidden.rows).toHaveLength(0);
    await expectDenied(
      db.asUser(member, (tx) => tx.query("insert into public.outreach_contacts (university, email) values ('Elsewhere', 'x@y.edu')")),
      /row-level security/,
    );
  });

  it("keeps one contact per email regardless of case", async () => {
    await expectDenied(
      db.asUser(admin, (tx) => tx.query("insert into public.outreach_contacts (university, email) values ('Elsewhere', 'm.lopez@TCU.edu')")),
      /duplicate|unique/i,
    );
  });

  it("tracks sends, delivery, opens, and replies on the contact", async () => {
    await db.asUser(admin, (tx) =>
      tx.query(
        `insert into public.outreach_emails (contact_id, direction, status, subject, body, provider_id, occurred_at)
         values ($1, 'sent', 'sent', 'GreekGeek', 'Hi Margarita', 'resend-1', '2026-10-20T15:00:00Z')`,
        [contact],
      ),
    );
    await db.asService((tx) =>
      tx.query("update public.outreach_emails set status = 'delivered', delivered_at = '2026-10-20T15:00:05Z', opened_at = '2026-10-20T16:00:00Z', open_count = 2 where provider_id = 'resend-1'"),
    );
    await db.asService((tx) =>
      tx.query(
        `insert into public.outreach_emails (contact_id, direction, status, subject, body, provider_id, from_email, occurred_at)
         values ($1, 'reply', 'received', 'Re: GreekGeek', 'Happy to talk next week.', 'resend-in-1', 'm.lopez@tcu.edu', '2026-10-20T20:00:00Z')`,
        [contact],
      ),
    );
    const summary = await db.asUser(admin, (tx) =>
      tx.query<{ emails_sent: number; last_status: string; delivered_at: Date; opened_at: Date; replies: number; replied_at: Date; unread_replies: number }>(
        "select emails_sent, last_status, delivered_at, opened_at, replies, replied_at, unread_replies from public.outreach_contacts where id = $1",
        [contact],
      ),
    );
    expect(summary.rows[0]).toMatchObject({ emails_sent: 1, last_status: "delivered", replies: 1, unread_replies: 1 });
    expect(summary.rows[0].replied_at.toISOString()).toBe("2026-10-20T20:00:00.000Z");
    expect(summary.rows[0].opened_at.toISOString()).toBe("2026-10-20T16:00:00.000Z");
    const notes = await db.pg.query<{ link: string }>("select link from public.notifications where user_id = $1 and kind = 'marketing_alert'", [admin]);
    expect(notes.rows).toEqual([{ link: `/admin/outreach/contacts/${contact}` }]);
  });

  it("does not count failed sends and blocks the address after a bounce", async () => {
    const other = await db.asUser(admin, async (tx) => {
      const row = await tx.query<{ id: string }>("insert into public.outreach_contacts (university, email) values ('University of Kansas', 'ifc@ku.edu') returning id");
      await tx.query("insert into public.outreach_emails (contact_id, direction, status, subject, body, error) values ($1, 'sent', 'failed', 'GreekGeek', 'Hi', 'Provider down')", [row.rows[0].id]);
      await tx.query("insert into public.outreach_emails (contact_id, direction, status, subject, body, provider_id) values ($1, 'sent', 'sent', 'GreekGeek', 'Hi', 'resend-2')", [row.rows[0].id]);
      return row.rows[0].id;
    });
    await db.asService((tx) => tx.query("update public.outreach_emails set status = 'bounced', bounced_at = now() where provider_id = 'resend-2'"));
    const row = await db.pg.query<{ emails_sent: number; do_not_contact: boolean }>("select emails_sent, do_not_contact from public.outreach_contacts where id = $1", [other]);
    expect(row.rows[0]).toEqual({ emails_sent: 1, do_not_contact: true });
  });

  it("lets a chapter submit the public form and hides it from everyone else", async () => {
    const school = await db.pg.query<{ id: string }>("select id from public.universities where name = 'Stanford University'");
    await db.pg.query("insert into public.university_outreach (university_id, intro_code) values ($1, 'stanford-intro')", [school.rows[0].id]);
    const args = {
      p_code: "stanford-intro",
      p_full_name: "Jordan Lee",
      p_role: "President",
      p_organization: "Sigma Chi",
      p_council: "IFC",
      p_member_count: 80,
      p_in_house: 30,
      p_out_of_house: 50,
      p_dues: "about $600 a semester",
      p_email: "president@stanford.edu",
      p_phone: "555-0100",
      p_prefer_email: true,
      p_prefer_text: true,
      p_prefer_call: false,
      p_best_time: "Weeknights",
      p_interest: "demo",
      p_help: ["dues", "recruitment"],
      p_notes: "We want to see the dues page.",
    };
    const id = await db.rpc<string>("anon", null, "submit_intro", args);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const hidden = await db.as("anon", null, (tx) => tx.query("select * from public.intro_responses"));
    expect(hidden.rows).toHaveLength(0);
    await expectDenied(db.as("anon", null, (tx) => tx.query("insert into public.intro_responses (university_id, full_name, role, organization, email, prefer_email, interest) values ($1, 'A', 'President', 'IFC', 'a@b.edu', true, 'demo')", [school.rows[0].id])), /row-level security|permission denied/);
    const seen = await db.asUser(admin, (tx) => tx.query<{ organization: string; member_count: number }>("select organization, member_count from public.intro_responses where id = $1", [id]));
    expect(seen.rows).toEqual([{ organization: "Sigma Chi", member_count: 80 }]);
    const page = await db.as("anon", null, (tx) => tx.query<{ university_name: string }>("select * from public.intro_university($1)", ["stanford-intro"]));
    expect(page.rows[0]?.university_name).toBe("Stanford University");
    await expectDenied(db.rpc("anon", null, "submit_intro", { ...args, p_code: "missing" }), /page not found/);
    const alert = await db.pg.query<{ link: string }>("select link from public.notifications where user_id = $1 and dedupe_key = $2", [admin, `intro:${id}`]);
    expect(alert.rows).toEqual([{ link: `/admin/outreach/forms/${id}` }]);
  });

  it("lets only admins track a form submission", async () => {
    const response = await db.pg.query<{ id: string; status: string; read_at: Date | null }>("select id, status, read_at from public.intro_responses where email = 'president@stanford.edu'");
    expect(response.rows[0]).toMatchObject({ status: "new", read_at: null });
    const id = response.rows[0].id;
    const blocked = await db.asUser(member, (tx) => tx.query("update public.intro_responses set status = 'contacted' where id = $1", [id]));
    expect(blocked.rowCount).toBe(0);
    await db.asUser(admin, (tx) => tx.query("update public.intro_responses set status = 'meeting', read_at = now(), admin_notes = 'Call Thursday', contact_id = $2 where id = $1", [id, contact]));
    const saved = await db.pg.query<{ status: string; admin_notes: string; contact_id: string }>("select status, admin_notes, contact_id from public.intro_responses where id = $1", [id]);
    expect(saved.rows[0]).toEqual({ status: "meeting", admin_notes: "Call Thursday", contact_id: contact });
    await expectDenied(db.asUser(admin, (tx) => tx.query("update public.intro_responses set organization = 'Changed' where id = $1", [id])), /permission denied/);
    await expectDenied(db.asUser(admin, (tx) => tx.query("update public.intro_responses set status = 'maybe' where id = $1", [id])), /check constraint/);
  });

  it("rejects a reply that is not marked received", async () => {
    await expectDenied(
      db.asUser(admin, (tx) => tx.query("insert into public.outreach_emails (contact_id, direction, status, body) values ($1, 'reply', 'sent', 'x')", [contact])),
      /check constraint/,
    );
  });
});
