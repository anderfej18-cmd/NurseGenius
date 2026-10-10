import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

const LAST_LEGACY_MIGRATION = "20261002001620";

/** Everything that defines the public surface of the schema, as sorted text lines. */
async function fingerprint(db: TestDb): Promise<string[]> {
  const rows = await Promise.all([
    db.admin<{ v: string }>(
      `SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS v
         FROM information_schema.columns WHERE table_schema = 'public'`,
    ),
    db.admin<{ v: string }>(
      `SELECT 'policy ' || tablename || '.' || policyname || ' ' || cmd AS v FROM pg_policies WHERE schemaname = 'public'`,
    ),
    db.admin<{ v: string }>(
      `SELECT 'index ' || indexname AS v FROM pg_indexes WHERE schemaname = 'public'`,
    ),
    db.admin<{ v: string }>(
      `SELECT 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS v
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public', 'app_private')`,
    ),
    db.admin<{ v: string }>(
      `SELECT 'grant ' || table_name || ' ' || grantee || ' ' || privilege_type AS v
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`,
    ),
    db.admin<{ v: string }>(
      `SELECT 'colgrant ' || table_name || '.' || column_name || ' ' || grantee || ' ' || privilege_type AS v
         FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
          AND (table_name, column_name) IN (SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public')
          AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                           WHERE g.table_schema = 'public' AND g.table_name = column_privileges.table_name
                             AND g.grantee = column_privileges.grantee AND g.privilege_type = column_privileges.privilege_type)`,
    ),
    db.admin<{ v: string }>(
      `SELECT 'trigger ' || event_object_table || '.' || trigger_name AS v FROM information_schema.triggers WHERE trigger_schema = 'public'`,
    ),
  ]);
  return rows.flatMap((r) => r.map((x) => x.v)).sort();
}

let before: string[];
let after: string[];
let db: TestDb;

beforeAll(async () => {
  const baseline = await createTestDb({ upTo: LAST_LEGACY_MIGRATION });
  before = await fingerprint(baseline);
  await baseline.pg.close();

  db = await createTestDb();
  await db.pg.exec(
    readFileSync(
      join(process.cwd(), "supabase", "rollback", "20261006_milestones_1_to_3_rollback.sql"),
      "utf8",
    ),
  );
  after = await fingerprint(db);
});
afterAll(() => db.pg.close());

describe("Milestone 1 rollback", () => {
  it("restores exactly the schema that existed before the milestone", () => {
    expect(after.filter((line) => !before.includes(line))).toEqual([]);
    expect(before.filter((line) => !after.includes(line))).toEqual([]);
  });

  it("really does re-open the old behaviour (documented warning)", async () => {
    const user = await db.createUser("rollback@example.com");
    await db.as(
      "authenticated",
      user,
      `UPDATE public.profiles SET tier = 'scholar' WHERE id = $1`,
      [user],
    );
    const [profile] = await db.admin<{ tier: string }>(
      `SELECT tier FROM public.profiles WHERE id = $1`,
      [user],
    );
    expect(profile.tier).toBe("scholar");
  });
});
