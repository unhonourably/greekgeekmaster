import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../support/db";

type Hit = { id: string; name: string; city: string | null; state: string | null; email_domains: string[] };

describe("university directory", () => {
  let db: Db;
  const search = async (q: string, limit = 5) =>
    (await db.as("anon", null, (tx) => tx.query<Hit>("select * from public.search_universities($1, $2)", [q, limit]))).rows;

  beforeAll(async () => {
    db = await createDb();
  });

  it("ships thousands of accredited schools with verified email domains", async () => {
    const r = await db.pg.query<{ total: string; with_domains: string }>(
      "select count(*)::text total, count(*) filter (where cardinality(email_domains) > 0)::text with_domains from public.universities where source = 'ipeds'",
    );
    expect(Number(r.rows[0].total)).toBeGreaterThan(3500);
    expect(Number(r.rows[0].with_domains)).toBeGreaterThan(3500);
    const bad = await db.pg.query("select name from public.universities u, unnest(u.email_domains) d where d !~ '^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.edu$'");
    expect(bad.rows).toEqual([]);
  });

  it("knows the right domains for well-known schools", async () => {
    const domains = async (name: string) =>
      (await db.pg.query<{ email_domains: string[] }>("select email_domains from public.universities where name = $1", [name])).rows[0]?.email_domains;
    expect(await domains("Massachusetts Institute of Technology")).toContain("mit.edu");
    expect(await domains("University of Michigan-Ann Arbor")).toContain("umich.edu");
    expect(await domains("Stanford University")).toContain("stanford.edu");
    expect(await domains("Ohio State University")).toContain("osu.edu");
  });

  it("finds schools by name, nickname, and email domain", async () => {
    expect((await search("ohio state"))[0].name).toBe("Ohio State University");
    expect((await search("MIT"))[0].name).toBe("Massachusetts Institute of Technology");
    expect((await search("umich.edu"))[0].name).toBe("University of Michigan-Ann Arbor");
    expect((await search("@stanford.edu"))[0].name).toBe("Stanford University");
    expect((await search("university of southern california"))[0].name).toBe("University of Southern California");
    expect(await search("a")).toEqual([]);
    expect(await search("%_%")).toEqual([]);
  });
});
