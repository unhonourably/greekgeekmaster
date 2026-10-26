import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const migrationsDir = path.join(root, "supabase", "migrations");

export type Role = "authenticated" | "anon" | "service_role";

export type Db = {
  pg: PGlite;
  as<T>(role: Role, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  rpc<T = unknown>(role: Role, userId: string | null, fn: string, args?: Record<string, unknown>): Promise<T>;
  createUser(email: string, name: string): Promise<string>;
};

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(migrationsDir, f));
}

export async function createDb(): Promise<Db> {
  const pg = await PGlite.create();
  await pg.exec(readFileSync(path.join(root, "tests", "support", "supabase-shim.sql"), "utf8"));
  for (const file of migrationFiles()) {
    try {
      await pg.exec(readFileSync(file, "utf8"));
    } catch (error) {
      const e = error as Error & { position?: string; where?: string };
      throw new Error(`${path.basename(file)}: ${e.message}${e.where ? `\n${e.where}` : ""}${e.position ? ` at ${e.position}` : ""}`);
    }
  }

  async function as<T>(role: Role, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return pg.transaction(async (tx) => {
      const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });
  }

  async function rpc<T>(role: Role, userId: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const keys = Object.keys(args);
    const params = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
    const values = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
    });
    return as(role, userId, async (tx) => {
      const result = await tx.query<{ r: T }>(`select public.${fn}(${params}) as r`, values);
      return result.rows[0]?.r as T;
    });
  }

  async function createUser(email: string, name: string): Promise<string> {
    const result = await pg.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id",
      [email, JSON.stringify({ display_name: name, full_name: name })],
    );
    return result.rows[0].id;
  }

  return {
    pg,
    as,
    asUser: (userId, fn) => as("authenticated", userId, fn),
    asService: (fn) => as("service_role", null, fn),
    rpc,
    createUser,
  };
}

export async function expectNoEffect(promise: Promise<{ affectedRows?: number }>): Promise<void> {
  let affected: number | undefined;
  try {
    affected = (await promise).affectedRows;
  } catch {
    return;
  }
  if (affected && affected > 0) throw new Error(`Expected the write to be blocked, but it changed ${affected} row(s)`);
}

export async function expectDenied(promise: Promise<unknown>, pattern?: RegExp): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (pattern && !pattern.test(message)) throw new Error(`Denied with unexpected message: ${message}`);
    return message;
  }
  throw new Error("Expected the operation to be denied, but it succeeded");
}
