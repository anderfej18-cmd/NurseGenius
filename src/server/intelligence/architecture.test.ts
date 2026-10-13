import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Fitness functions: the rules of docs/adr/0001 and 0003 as tests, so a violation fails the build.

const INTELLIGENCE = join(__dirname);
const FUNCTIONS = join(__dirname, "..", "..", "functions");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });

const read = (path: string): string => readFileSync(path, "utf8");
const label = (path: string): string => relative(join(__dirname, "..", ".."), path);
const isTest = (path: string): boolean => path.endsWith(".test.ts");
const isServerOnly = (path: string): boolean => path.endsWith(".server.ts");

const importsOf = (source: string): string[] =>
  [...source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gms)].map((m) => m[1]);

const logic = sourceFiles(INTELLIGENCE).filter((path) => !isTest(path) && !isServerOnly(path));

describe("intelligence layering", () => {
  it("finds the modules it is checking", () => {
    expect(logic.length).toBeGreaterThan(30);
  });

  it("keeps database and framework code out of services and engines", () => {
    const offenders = logic.flatMap((path) =>
      importsOf(read(path))
        .filter(
          (target) =>
            target.startsWith("@supabase/") ||
            target.startsWith("@/integrations/") ||
            target.startsWith("@tanstack/") ||
            target.endsWith(".server") ||
            target.includes("/testing/"),
        )
        .map((target) => `${label(path)} imports ${target}`),
    );
    expect(offenders).toEqual([]);
  });

  it("injects the clock and randomness instead of reading them", () => {
    const offenders = logic.flatMap((path) => {
      const source = read(path);
      return [/Date\.now\(/, /new Date\(\)/, /Math\.random\(/, /process\.env/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${label(path)} uses ${pattern.source}`);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the calculation engines synchronous and free of I/O", () => {
    const engines = [
      "mastery/mastery.service.ts",
      "confidence/confidence.analytics.ts",
      "time/time-analytics.service.ts",
      "readiness/readiness.ts",
      "performance/performance.ts",
      "recommendation/deterministic.strategy.ts",
      "review/sm2.scheduler.ts",
      "selection/adaptive-selector.ts",
      "similar/similar-questions.ts",
    ];
    const offenders = engines.filter((engine) =>
      /\b(await|async|Promise|fetch)\b/.test(read(join(INTELLIGENCE, engine))),
    );
    expect(offenders).toEqual([]);
  });

  it("has no placeholder AI strategy: the deterministic one is the only implementation", () => {
    const implementations = logic.filter((path) =>
      /implements\s+RecommendationStrategy/.test(read(path)),
    );
    expect(implementations.map(label)).toEqual([
      "server/intelligence/recommendation/deterministic.strategy.ts",
    ]);
  });
});

describe("client-safe server functions", () => {
  const functions = sourceFiles(FUNCTIONS).filter((path) => path.endsWith(".functions.ts"));

  it("finds the function modules it is checking", () => {
    expect(functions.length).toBeGreaterThan(5);
  });

  it("load server code only through a dynamic import inside the handler", () => {
    const offenders = functions.flatMap((path) =>
      importsOf(read(path))
        .filter((target) => target.startsWith("@/server/") || target.endsWith(".server"))
        .map((target) => `${label(path)} statically imports ${target}`),
    );
    expect(offenders).toEqual([]);
  });

  it("authenticate every function except the listed public ones", () => {
    // Shared-test links are taken by people without an account; the link token is their credential.
    // listPublicPlans serves the landing page: it returns only active plans' name, price and length,
    // the rows the database already shows an anonymous visitor (docs/api/plans.md).
    const publicByDesign = new Set([
      "getSharedTest",
      "startSharedTest",
      "getSharedAttempt",
      "saveSharedAnswer",
      "submitSharedTest",
      "listPublicPlans",
    ]);
    const unauthenticated = functions.flatMap((path) =>
      read(path)
        .split(/^export const /m)
        .slice(1)
        .filter((block) => block.includes("createServerFn("))
        .filter((block) => !block.includes(".middleware([requireSupabaseAuth])"))
        .map((block) => block.slice(0, block.indexOf(" ")))
        .filter((name) => !publicByDesign.has(name))
        .map((name) => `${label(path)}: ${name}`),
    );
    expect(unauthenticated).toEqual([]);
  });

  it("does not let the public allowlist go stale", () => {
    const names = functions.flatMap((path) =>
      [...read(path).matchAll(/^export const (\w+) = createServerFn\(/gm)].map((m) => m[1]),
    );
    for (const name of [
      "getSharedTest",
      "startSharedTest",
      "getSharedAttempt",
      "saveSharedAnswer",
      "submitSharedTest",
      "listPublicPlans",
    ]) {
      expect(names).toContain(name);
    }
  });
});
