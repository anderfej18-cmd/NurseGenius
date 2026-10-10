import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// Root cause of the leaderboard / sub-admin regression: a migration revoked EXECUTE from browser
// roles while the browser kept calling the function. This replays every migration and checks that
// each database function the browser code calls is really executable by a signed-in student.

const BROWSER_DIRS = ["src/routes", "src/components", "src/hooks", "src/lib"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const browserFiles = BROWSER_DIRS.flatMap((dir) => sourceFiles(join(process.cwd(), dir)));
const callsIn = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/\.rpc\(\s*([^,)]+)/g)].map((match) => match[1].trim());

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.pg.close());

describe("database functions called from the browser", () => {
  const literal = new Map<string, string[]>();
  const dynamic: string[] = [];
  for (const file of browserFiles) {
    for (const argument of callsIn(file)) {
      const name = /^["']([a-z_0-9]+)["']/.exec(argument)?.[1];
      if (name === undefined) dynamic.push(`${file}: .rpc(${argument})`);
      else literal.set(name, [...(literal.get(name) ?? []), file]);
    }
  }

  it("are all named literally, so this check can see them", () => {
    expect(dynamic).toEqual([]);
  });

  it.each([...literal.keys()])("%s can be executed by a signed-in student", async (name) => {
    const rows = await db.admin<{ ok: boolean }>(
      `SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS ok
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name],
    );
    expect(rows[0]?.ok, `${name} is called from ${literal.get(name)?.join(", ")}`).toBe(true);
  });
});
