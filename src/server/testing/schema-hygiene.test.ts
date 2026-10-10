import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// Checks on the finished schema (every migration replayed in order) that no single migration's test
// would notice: file naming and order, row-level security on every table, and what a visitor who is
// not signed in could touch. Supabase grants new public tables to anon and authenticated by default,
// so a table that forgets to revoke is open; the test database copies that default on purpose.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));

describe("migration files", () => {
  it("are named with a 14-digit timestamp and a description", () => {
    for (const name of files) {
      expect(name, name).toMatch(/^\d{14}_[A-Za-z0-9_-]+\.sql$/);
    }
  });

  it("have unique timestamps, so the order they run in is never a tie", () => {
    const stamps = files.map((name) => name.slice(0, 14));
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it("run in timestamp order (the order the database applies them)", () => {
    const stamps = files.map((name) => name.slice(0, 14));
    expect(stamps).toEqual([...stamps].sort());
  });
});

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.pg.close());

describe("the finished schema", () => {
  it("has row-level security on every table in the public schema", async () => {
    const open = await db.admin<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1`,
    );
    expect(open.map((row) => row.relname)).toEqual([]);
  });

  it("has no row-level-security policy that opens a table to a visitor who is not signed in, except the price list", async () => {
    // Table privileges are granted to anon by Supabase's defaults; the policies are what decide.
    const open = await db.admin<{ tablename: string; cmd: string }>(
      `SELECT tablename, cmd FROM pg_policies
       WHERE schemaname = 'public' AND roles && ARRAY['anon', 'public']::name[] ORDER BY 1, 2`,
    );
    expect(open).toEqual([{ tablename: "plans", cmd: "SELECT" }]);
  });

  it("lets a visitor who is not signed in run no database function except a trigger helper", async () => {
    const callable = await db.admin<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ORDER BY 1`,
    );
    // A trigger function cannot be called on its own, so being executable does no harm.
    expect(callable.map((row) => row.proname)).toEqual(["update_updated_at_column"]);
  });
});
