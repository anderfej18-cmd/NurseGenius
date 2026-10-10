import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./pglite-db";

// The contract between the code and the migrated database. Without a live project to regenerate
// types from, this replays every migration and checks, against the real schema, that:
//   1. src/integrations/supabase/types.ts describes the tables, columns and functions that exist, and
//   2. every .from("table") and .rpc("function", { args }) the application makes names something that
//      exists, with argument names the function really has and every required argument supplied.
// A mismatch is the kind of bug a live smoke test would otherwise find first.

const SRC = join(__dirname, "..", "..");
const TYPES = join(SRC, "integrations", "supabase", "types.ts");

let db: TestDb;
let columns: Map<string, Set<string>>;
let functions: Map<string, Array<{ args: string[]; required: string[] }>>;

beforeAll(async () => {
  db = await createTestDb();
  const cols = await db.admin<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  columns = new Map();
  for (const { table_name, column_name } of cols) {
    columns.set(table_name, (columns.get(table_name) ?? new Set()).add(column_name));
  }
  const procs = await db.admin<{
    name: string;
    names: string[] | null;
    total: number;
    defaults: number;
  }>(
    `SELECT p.proname AS name, p.proargnames AS names, p.pronargs::int AS total, p.pronargdefaults::int AS defaults
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  );
  functions = new Map();
  for (const { name, names, total, defaults } of procs) {
    const args = (names ?? []).slice(0, total);
    const list = functions.get(name) ?? [];
    list.push({ args, required: args.slice(0, total - defaults) });
    functions.set(name, list);
  }
}, 120_000);
afterAll(() => db.pg.close());

// ---------- types.ts, read with the TypeScript compiler ----------
interface TypedMember {
  readonly members: Map<string, Set<string>>;
}
function typedSection(section: "Tables" | "Functions", inner: "Row" | "Args"): TypedMember {
  const file = ts.createSourceFile(
    TYPES,
    readFileSync(TYPES, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const members = new Map<string, Set<string>>();
  const named = (node: ts.Node): string | null =>
    ts.isPropertySignature(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
      ? node.name.text
      : null;
  const typeMembers = (node: ts.Node | undefined): ts.TypeElement[] =>
    node && ts.isTypeLiteralNode(node) ? [...node.members] : [];

  const database = file.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
  );
  const pub = typeMembers(database?.type).find(
    (m) => named(m) === "public",
  ) as ts.PropertySignature;
  const group = typeMembers(pub.type).find((m) => named(m) === section) as ts.PropertySignature;
  for (const entry of typeMembers(group.type)) {
    const name = named(entry);
    if (name === null || !ts.isPropertySignature(entry)) continue;
    const part = typeMembers(entry.type).find((m) => named(m) === inner) as
      | ts.PropertySignature
      | undefined;
    members.set(name, new Set(typeMembers(part?.type).flatMap((m) => named(m) ?? [])));
  }
  return { members };
}

describe("types.ts matches the migrated database", () => {
  it("lists every public table with exactly its columns", () => {
    const typed = typedSection("Tables", "Row").members;
    const missing = [...columns.keys()].filter((table) => !typed.has(table));
    expect(missing, "tables missing from types.ts").toEqual([]);
    const mismatched = [...typed].flatMap(([table, cols]) => {
      const real = columns.get(table);
      if (real === undefined) return [`${table}: not in the database`];
      const extra = [...cols].filter((c) => !real.has(c));
      const absent = [...real].filter((c) => !cols.has(c));
      return extra.length + absent.length === 0
        ? []
        : [`${table}: types.ts has [${extra}] extra, lacks [${absent}]`];
    });
    expect(mismatched).toEqual([]);
  });

  it("describes every function the application calls, with the argument names it really has", () => {
    const typed = typedSection("Functions", "Args").members;
    const wrong = [...typed].flatMap(([name, args]) => {
      const real = functions.get(name);
      if (real === undefined) return [`${name}: not in the database`];
      return real.some((overload) => [...args].every((a) => overload.args.includes(a)))
        ? []
        : [`${name}: types.ts has arguments [${[...args]}] that no overload has`];
    });
    expect(wrong).toEqual([]);
  });
});

// ---------- every call in the application ----------
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "testing" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !path.endsWith("types.ts") &&
      !path.endsWith("routeTree.gen.ts")
      ? [path]
      : [];
  });

/** The text between the matching braces starting at `open`, nested braces removed. */
function topLevelOfObject(source: string, open: number): string | null {
  let depth = 0;
  let out = "";
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth -= 1;
      if (depth === 0) return out;
    } else if (depth === 1) out += ch;
    if ((ch === "{" || ch === "(" || ch === "[") && depth > 1) continue;
  }
  return null;
}

function keysOf(topLevel: string): string[] {
  return topLevel
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !part.startsWith("..."))
    .map((part) => part.split(":")[0].trim());
}

interface Call {
  readonly file: string;
  readonly name: string;
  readonly keys: string[] | null;
}

const rpcCalls: Call[] = [];
const tableCalls: Array<{ file: string; table: string }> = [];
for (const path of sourceFiles(SRC)) {
  const source = readFileSync(path, "utf8");
  const file = relative(SRC, path);
  for (const match of source.matchAll(/\.rpc\(\s*"([a-z_0-9]+)"\s*(,\s*)?/g)) {
    const after = match.index + match[0].length;
    const open = match[2] !== undefined && source[after] === "{" ? after : -1;
    const top = open === -1 ? null : topLevelOfObject(source, open);
    rpcCalls.push({ file, name: match[1], keys: top === null ? null : keysOf(top) });
  }
  for (const match of source.matchAll(/\.from\(\s*"([a-z_0-9]+)"\s*\)/g)) {
    tableCalls.push({ file, table: match[1] });
  }
}

describe("every database call in the application", () => {
  it("finds the calls it checks", () => {
    expect(rpcCalls.length).toBeGreaterThan(40);
    expect(tableCalls.length).toBeGreaterThan(40);
  });

  it("reads and writes only tables (or views) that exist", () => {
    const unknown = tableCalls
      .filter(({ table }) => !columns.has(table))
      .map(({ file, table }) => `${file}: from("${table}")`);
    expect(unknown).toEqual([]);
  });

  it("calls only functions that exist, with argument names they have and every required argument", () => {
    const problems = rpcCalls.flatMap(({ file, name, keys }) => {
      const overloads = functions.get(name);
      if (overloads === undefined) return [`${file}: rpc("${name}") does not exist`];
      if (keys === null)
        return overloads.some((o) => o.required.length === 0)
          ? []
          : [`${file}: rpc("${name}") has no argument object`];
      const fits = overloads.some(
        (o) => keys.every((k) => o.args.includes(k)) && o.required.every((r) => keys.includes(r)),
      );
      return fits
        ? []
        : [
            `${file}: rpc("${name}", { ${keys.join(", ")} }) fits no overload (${overloads.map((o) => `[${o.args}] requires [${o.required}]`).join(" | ")})`,
          ];
    });
    expect(problems).toEqual([]);
  });
});
