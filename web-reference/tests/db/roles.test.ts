import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("chapter roles", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let treasurer: { userId: string; membershipId: string };
  let member: { userId: string; membershipId: string };
  let secretaryRole: string;

  const save = (userId: string, roleId: string | null, name: string, permissions: string[]) =>
    db.rpc<string>("authenticated", userId, "save_chapter_role", {
      p_chapter: chapter.chapterId,
      p_role: roleId,
      p_name: name,
      p_description: null,
      p_badge_tone: "slate",
      p_is_officer: true,
      p_permissions: permissions,
    });

  const permsOf = async (roleId: string) =>
    (await db.pg.query<{ permission_key: string }>("select permission_key from public.role_permissions where role_id = $1 order by 1", [roleId])).rows.map((r) => r.permission_key);

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    treasurer = await addMember(db, chapter, "Taylor Treasurer", ["treasurer"]);
    member = await addMember(db, chapter, "Morgan Member");
  });

  it("creates a custom role with a unique key and audit entry", async () => {
    secretaryRole = await save(chapter.ownerId, null, "Recording Secretary", ["announcements.publish", "events.manage"]);
    const again = await save(chapter.ownerId, null, "Recording Secretary!", ["events.manage"]);
    const keys = await db.pg.query<{ id: string; key: string; kind: string }>("select id, key, kind from public.roles where id = any($1::uuid[]) order by key", [[secretaryRole, again]]);
    expect(keys.rows.map((r) => r.key)).toEqual(["recording_secretary", "recording_secretary_2"]);
    expect(keys.rows.every((r) => r.kind === "custom")).toBe(true);
    expect(await permsOf(secretaryRole)).toEqual(["announcements.publish", "events.manage"]);
    const audit = await db.pg.query("select 1 from public.audit_logs where action = 'role.created' and target_id = $1", [secretaryRole]);
    expect(audit.rows).toHaveLength(1);
  });

  it("updates permissions as a diff", async () => {
    await save(chapter.ownerId, secretaryRole, "Secretary", ["events.manage", "attendance.view"]);
    expect(await permsOf(secretaryRole)).toEqual(["attendance.view", "events.manage"]);
    const name = await db.pg.query<{ name: string }>("select name from public.roles where id = $1", [secretaryRole]);
    expect(name.rows[0].name).toBe("Secretary");
  });

  it("refuses to let officers grant or remove permissions they do not hold", async () => {
    await expectDenied(save(treasurer.userId, null, "Sneaky", ["finance.view"]), /not authorized/);
    await expectDenied(save(member.userId, null, "Sneaky", []), /not authorized/);
    const roleId = (await db.pg.query<{ id: string }>("select id from public.roles where chapter_id = $1 and key = 'treasurer'", [chapter.chapterId])).rows[0].id;
    await db.pg.query("insert into public.role_permissions (role_id, permission_key) values ($1, 'roles.manage') on conflict do nothing", [roleId]);
    await expectDenied(save(treasurer.userId, null, "Sneaky", ["standards.view"]), /permissions you hold/);
    await expectDenied(save(treasurer.userId, secretaryRole, "Secretary", ["events.manage"]), /permissions you hold/);
    const ok = await save(treasurer.userId, null, "Finance committee", ["finance.view"]);
    expect(await permsOf(ok)).toEqual(["finance.view"]);
  });

  it("keeps the administrator role fixed", async () => {
    const owner = (await db.pg.query<{ id: string }>("select id from public.roles where chapter_id = $1 and is_owner", [chapter.chapterId])).rows[0].id;
    await expectDenied(save(chapter.ownerId, owner, "Boss", ["chapter.manage"]), /fixed/);
  });

  it("audits role assignment and removal", async () => {
    await db.asUser(chapter.ownerId, (tx) =>
      tx.query("insert into public.role_assignments (chapter_id, membership_id, role_id) values ($1, $2, $3)", [chapter.chapterId, member.membershipId, secretaryRole]),
    );
    await db.asUser(chapter.ownerId, (tx) =>
      tx.query("update public.role_assignments set ends_at = now(), end_reason = 'term ended' where membership_id = $1 and role_id = $2 and ends_at is null", [member.membershipId, secretaryRole]),
    );
    const audit = await db.pg.query<{ action: string }>("select action from public.audit_logs where target_id = $1 and action like 'role.%' order by id", [member.membershipId]);
    expect(audit.rows.map((r) => r.action)).toEqual(["role.assigned", "role.ended"]);
  });

  it("only deletes custom roles that were never assigned", async () => {
    const unused = await save(chapter.ownerId, null, "Historian", []);
    await db.asUser(chapter.ownerId, (tx) => tx.query("delete from public.roles where id = $1", [unused]));
    expect((await db.pg.query("select 1 from public.roles where id = $1", [unused])).rows).toHaveLength(0);
    await expectDenied(db.asUser(chapter.ownerId, (tx) => tx.query("delete from public.roles where id = $1", [secretaryRole])), /assignment history/);
  });
});
