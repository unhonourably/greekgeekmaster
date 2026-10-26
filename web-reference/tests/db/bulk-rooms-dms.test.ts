import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

type Member = { userId: string; membershipId: string; email: string };

describe("direct messages before the first message", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let alex: Member;
  let blair: Member;

  const listed = async (userId: string) =>
    (await db.as("authenticated", userId, (tx) => tx.query<{ id: string; kind: string }>("select id, kind from public.my_conversations($1)", [chapter.chapterId]))).rows;

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    alex = await addMember(db, chapter, "Alex Member");
    blair = await addMember(db, chapter, "Blair Member");
  });

  it("stays out of both lists until someone sends a message", async () => {
    const dm = await db.rpc<string>("authenticated", alex.userId, "start_direct_conversation", { p_chapter: chapter.chapterId, p_other: blair.userId });
    expect((await listed(alex.userId)).map((c) => c.id)).not.toContain(dm);
    expect((await listed(blair.userId)).map((c) => c.id)).not.toContain(dm);
    expect((await listed(alex.userId)).some((c) => c.kind === "chapter_main")).toBe(true);

    await db.as("authenticated", alex.userId, (tx) =>
      tx.query(
        "select public.send_message(p_conversation => $1, p_body => 'hey', p_parent => null, p_mentions => '{}'::uuid[], p_mention_roles => '{}'::uuid[], p_mention_all => false, p_attachments => '[]'::jsonb)",
        [dm],
      ),
    );
    expect((await listed(alex.userId)).map((c) => c.id)).toContain(dm);
    expect((await listed(blair.userId)).map((c) => c.id)).toContain(dm);
    const unread = await db.rpc<number>("authenticated", blair.userId, "chapter_unread_total", { p_chapter: chapter.chapterId });
    expect(Number(unread)).toBeGreaterThanOrEqual(1);
  });
});

describe("bulk room creation", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let manager: Member;
  let member: Member;

  const create = (userId: string, rooms: unknown) => db.rpc<{ created: number; skipped: string[] }>("authenticated", userId, "bulk_create_housing_rooms", { p_chapter: chapter.chapterId, p_rooms: JSON.stringify(rooms) });

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    manager = await addMember(db, chapter, "Hal House", ["house_manager"]);
    member = await addMember(db, chapter, "Sam Member");
  });

  it("creates every room and skips names already in use", async () => {
    await db.rpc("authenticated", manager.userId, "save_housing_room", {
      p_chapter: chapter.chapterId, p_room: null, p_name: "102", p_floor: "Floor 1", p_capacity: 2, p_rent_cents: null, p_features: [], p_notes: null,
    });
    const result = await create(manager.userId, [
      { name: "101", floor: "Floor 1", capacity: 2, rent_cents: 85000, features: ["AC", "AC", " "] },
      { name: "102", floor: "Floor 1", capacity: 2 },
      { name: "201", floor: "Floor 2", capacity: 3 },
      { name: "201", floor: "Floor 2", capacity: 1 },
    ]);
    expect(result.created).toBe(2);
    expect(result.skipped).toEqual(["102", "201"]);
    const rows = await db.pg.query<{ name: string; capacity: number; rent_cents: string | null; features: string[] }>(
      "select name, capacity, rent_cents::text, features from public.housing_rooms where chapter_id = $1 order by name",
      [chapter.chapterId],
    );
    expect(rows.rows.map((r) => r.name)).toEqual(["101", "102", "201"]);
    expect(rows.rows[0]).toMatchObject({ capacity: 2, rent_cents: "85000", features: ["AC"] });
    expect(rows.rows[2].capacity).toBe(3);
  });

  it("rejects bad input without creating anything", async () => {
    const before = (await db.pg.query<{ n: string }>("select count(*)::text n from public.housing_rooms where chapter_id = $1", [chapter.chapterId])).rows[0].n;
    await expectDenied(create(manager.userId, [{ name: "301", capacity: 2 }, { name: "302", capacity: 40 }]));
    await expectDenied(create(manager.userId, [{ name: "", capacity: 2 }]));
    await expectDenied(create(manager.userId, []));
    await expectDenied(create(manager.userId, Array.from({ length: 201 }, (_, i) => ({ name: `R${i}`, capacity: 1 }))));
    const after = (await db.pg.query<{ n: string }>("select count(*)::text n from public.housing_rooms where chapter_id = $1", [chapter.chapterId])).rows[0].n;
    expect(after).toBe(before);
  });

  it("is limited to housing managers", async () => {
    await expectDenied(create(member.userId, [{ name: "401", capacity: 2 }]));
  });
});
