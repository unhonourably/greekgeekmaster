import { beforeAll, describe, expect, it } from "vitest";
import { createDb, expectDenied, type Db } from "../support/db";
import { addMember, createVerifiedChapter, type ChapterFixture } from "../support/fixtures";

describe("chat", () => {
  let db: Db;
  let chapter: ChapterFixture;
  let alex: { userId: string; membershipId: string };
  let blair: { userId: string; membershipId: string };
  let casey: { userId: string; membershipId: string };
  let main: string;
  let dm: string;

  const send = async (userId: string, conversation: string, body: string, extra: { p_mentions?: string[]; p_mention_all?: boolean } = {}) => {
    const r = await db.as("authenticated", userId, (tx) =>
      tx.query<{ id: string }>(
        "select (public.send_message(p_conversation => $1, p_body => $2, p_parent => null, p_mentions => $3::uuid[], p_mention_roles => '{}'::uuid[], p_mention_all => $4, p_attachments => '[]'::jsonb)).id",
        [conversation, body, extra.p_mentions ?? [], extra.p_mention_all ?? false],
      ),
    );
    return r.rows[0];
  };

  beforeAll(async () => {
    db = await createDb();
    chapter = await createVerifiedChapter(db);
    alex = await addMember(db, chapter, "Alex Member");
    blair = await addMember(db, chapter, "Blair Member");
    casey = await addMember(db, chapter, "Casey Member");
    main = (await db.pg.query<{ id: string }>("select id from public.conversations where chapter_id = $1 and kind = 'chapter_main'", [chapter.chapterId])).rows[0].id;
    dm = await db.rpc<string>("authenticated", alex.userId, "start_direct_conversation", { p_chapter: chapter.chapterId, p_other: blair.userId });
  });

  it("puts every active member in the chapter-wide channel", async () => {
    const rows = await db.pg.query("select user_id from public.conversation_members where conversation_id = $1 and removed_at is null", [main]);
    expect(rows.rows).toHaveLength(4);
  });

  it("delivers mentions as notifications and counts unread", async () => {
    const msg = await send(alex.userId, main, "@Blair Member can you bring the banner?", { p_mentions: [blair.userId] });
    const notes = await db.pg.query<{ kind: string; link: string }>("select kind, link from public.notifications where user_id = $1 and dedupe_key = $2", [blair.userId, `mention:${msg.id}`]);
    expect(notes.rows[0]).toMatchObject({ kind: "chat_mention", link: `/c/${chapter.slug}/chat/${main}` });
    const unread = await db.rpc<string>("authenticated", blair.userId, "chapter_unread_total", { p_chapter: chapter.chapterId });
    expect(Number(unread)).toBeGreaterThanOrEqual(1);
    await db.rpc("authenticated", blair.userId, "mark_conversation_read", { p_conversation: main });
    const after = await db.as("authenticated", blair.userId, (tx) =>
      tx.query<{ unread_count: string }>("select unread_count::text from public.my_conversations($1) where id = $2", [chapter.chapterId, main]),
    );
    expect(after.rows[0].unread_count).toBe("0");
  });

  it("keeps direct messages private from other members and platform staff", async () => {
    await send(alex.userId, dm, "Private note");
    const seenByBlair = await db.asUser(blair.userId, (tx) => tx.query("select 1 from public.messages where conversation_id = $1", [dm]));
    expect(seenByBlair.rows).toHaveLength(1);
    const seenByCasey = await db.asUser(casey.userId, (tx) => tx.query("select 1 from public.messages where conversation_id = $1", [dm]));
    expect(seenByCasey.rows).toHaveLength(0);
    const admin = await db.createUser("admin@platform.test", "Platform Admin");
    await db.pg.query("insert into public.platform_staff (user_id, role) values ($1, 'admin')", [admin]);
    const seenByAdmin = await db.asUser(admin, (tx) => tx.query("select 1 from public.messages where conversation_id = $1", [dm]));
    expect(seenByAdmin.rows).toHaveLength(0);
    await expectDenied(send(casey.userId, dm, "Let me in"), /not authorized/);
  });

  it("lets senders edit their own messages but not others'", async () => {
    const msg = await send(alex.userId, main, "Meeting at 7");
    await db.asUser(alex.userId, (tx) => tx.query("update public.messages set body = 'Meeting at 8' where id = $1", [msg.id]));
    const row = await db.pg.query<{ body: string; edited_at: string | null }>("select body, edited_at from public.messages where id = $1", [msg.id]);
    expect(row.rows[0].body).toBe("Meeting at 8");
    expect(row.rows[0].edited_at).not.toBeNull();
    const r = await db.asUser(blair.userId, (tx) => tx.query("update public.messages set body = 'hijacked' where id = $1", [msg.id]));
    expect(r.affectedRows ?? 0).toBe(0);
    await expectDenied(db.asUser(alex.userId, (tx) => tx.query("update public.messages set pinned_at = now() where id = $1", [msg.id])), /only the message text/);
  });

  it("only lets moderators notify everyone", async () => {
    await expectDenied(send(alex.userId, main, "@everyone hi", { p_mention_all: true }), /only moderators/);
    await send(chapter.ownerId, main, "@everyone chapter meeting tonight", { p_mention_all: true });
  });

  it("blocks posting in archived channels and protects system channels", async () => {
    const channel = await db.rpc<string>("authenticated", chapter.ownerId, "create_conversation", {
      p_chapter: chapter.chapterId,
      p_kind: "channel",
      p_name: "formal-planning",
      p_topic: null,
      p_visibility: "open",
      p_posting_policy: "all",
      p_member_ids: [alex.userId],
    });
    await send(alex.userId, channel, "Venue ideas?");
    await db.asUser(chapter.ownerId, (tx) => tx.query("update public.conversations set archived_at = now() where id = $1", [channel]));
    await expectDenied(send(alex.userId, channel, "One more"), /not authorized|archived/);
    const hidden = await db.asUser(alex.userId, (tx) => tx.query("select 1 from public.messages where conversation_id = $1", [channel]));
    expect(hidden.rows).toHaveLength(0);
    await expectDenied(db.asUser(chapter.ownerId, (tx) => tx.query("update public.conversations set archived_at = now() where id = $1", [main])), /cannot be archived/);
  });

  it("routes reports to moderators and prevents self-review", async () => {
    const msg = await send(alex.userId, main, "Something inappropriate");
    const report = await db.rpc<string>("authenticated", blair.userId, "report_message", { p_message: msg.id, p_reason: "harassment", p_details: "Not okay" });
    const visibleToAlex = await db.asUser(alex.userId, (tx) => tx.query("select 1 from public.message_reports where id = $1", [report]));
    expect(visibleToAlex.rows).toHaveLength(0);
    await expectDenied(db.rpc("authenticated", casey.userId, "resolve_message_report", { p_report: report, p_action: "dismiss", p_note: null }), /not authorized/);
    await db.rpc("authenticated", chapter.ownerId, "resolve_message_report", { p_report: report, p_action: "restrict_sender", p_note: "Warned" });
    const m = await db.pg.query<{ deleted_at: string | null }>("select deleted_at from public.messages where id = $1", [msg.id]);
    expect(m.rows[0].deleted_at).not.toBeNull();
    await expectDenied(send(alex.userId, main, "back again"), /restricted/);
  });

  it("only lets conversation members use a conversation's typing channel", async () => {
    const check = async (userId: string, topic: string) =>
      db.asUser(userId, async (tx) => (await tx.query<{ ok: boolean }>("select private.can_use_typing_topic($1) as ok", [topic])).rows[0].ok);
    expect(await check(alex.userId, `typing:${dm}`)).toBe(true);
    expect(await check(blair.userId, `typing:${dm}`)).toBe(true);
    expect(await check(casey.userId, `typing:${dm}`)).toBe(false);
    expect(await check(casey.userId, `typing:${main}`)).toBe(true);
    expect(await check(alex.userId, `chat:${dm}`)).toBe(false);
    expect(await check(alex.userId, "typing:not-a-uuid")).toBe(false);
  });

  it("starts a group conversation with the people picked", async () => {
    const group = await db.rpc<string>("authenticated", alex.userId, "create_conversation", {
      p_chapter: chapter.chapterId,
      p_kind: "group",
      p_name: null,
      p_topic: null,
      p_visibility: null,
      p_posting_policy: null,
      p_member_ids: [blair.userId, casey.userId],
    });
    const rows = await db.pg.query<{ user_id: string }>("select user_id from public.conversation_members where conversation_id = $1 and removed_at is null", [group]);
    expect(rows.rows.map((r) => r.user_id).sort()).toEqual([alex.userId, blair.userId, casey.userId].sort());
    await send(casey.userId, group, "hey all");
  });

  it("quotes a message inline without starting a thread", async () => {
    const reply = (userId: string, conversation: string, body: string, replyTo: string) =>
      db.as("authenticated", userId, (tx) =>
        tx.query<{ id: string; parent_id: string | null; reply_to_id: string | null }>(
          "select (m).id, (m).parent_id, (m).reply_to_id from (select public.send_message(p_conversation => $1, p_body => $2, p_parent => null, p_mentions => '{}'::uuid[], p_mention_roles => '{}'::uuid[], p_mention_all => false, p_attachments => '[]'::jsonb, p_reply_to => $3) as m) s",
          [conversation, body, replyTo],
        ),
      );
    const original = await send(blair.userId, dm, "Who is driving Saturday?");
    const r = (await reply(alex.userId, dm, "I can drive", original.id)).rows[0];
    expect(r).toMatchObject({ parent_id: null, reply_to_id: original.id });
    const parent = await db.pg.query<{ reply_count: number }>("select reply_count from public.messages where id = $1", [original.id]);
    expect(parent.rows[0].reply_count).toBe(0);
    const elsewhere = await send(casey.userId, main, "Different room");
    await expectDenied(reply(blair.userId, dm, "Cross-conversation quote", elsewhere.id), /not available/);
    await expectDenied(db.asUser(alex.userId, (tx) => tx.query("update public.messages set reply_to_id = null where id = $1", [r.id])), /only the message text/);
  });
});
