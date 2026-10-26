import { describe, expect, it } from "vitest";
import { createDb } from "../support/db";

describe("migrations", () => {
  it("apply cleanly and seed reference data", async () => {
    const db = await createDb();
    const perms = await db.pg.query<{ n: number }>("select count(*)::int as n from public.permissions");
    expect(perms.rows[0].n).toBe(25);
    const rule = await db.pg.query<{ platform_fee_bps: number; status: string }>("select platform_fee_bps, status from public.pricing_rules where is_default");
    expect(rule.rows).toEqual([{ platform_fee_bps: 150, status: "active" }]);
    const unsecured = await db.pg.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1",
    );
    expect(unsecured.rows).toEqual([]);
  });
});
