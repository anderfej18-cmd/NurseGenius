import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Fitness functions for ADR-0011: the AI layer only phrases measured facts, and the gateway key stays
// in the Edge Function. They fail if either is undone.
const SRC = join(__dirname, "..", "..");
const here = (file: string) => join(__dirname, file);

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
const read = (path: string) => readFileSync(path, "utf8");
const isTest = (path: string) => /\.test\.tsx?$/.test(path);
const label = (path: string) => relative(SRC, path);

const own = files(__dirname).filter((path) => !isTest(path));
const pure = own.filter(
  (path) => !/\.(server)\.ts$/.test(path) && !path.endsWith("insight.service.ts"),
);

describe("the AI explanation layer (ADR-0011)", () => {
  it("finds the modules it checks", () => {
    expect(own.length).toBeGreaterThan(8);
    expect(pure.length).toBeGreaterThan(5);
  });

  it("keeps the facts, grounding and hashing pure: no network, clock, randomness, environment or database", () => {
    const offenders = pure.flatMap((path) =>
      [
        /\bfetch\s*\(/,
        /Date\.now\(/,
        /new Date\(\)/,
        /Math\.random\(/,
        /process\.env/,
        /@supabase\//,
        /@\/integrations\//,
      ]
        .filter((pattern) => pattern.test(read(path)))
        .map((pattern) => `${label(path)} uses ${pattern.source}`),
    );
    expect(offenders).toEqual([]);
  });

  it("makes its one outbound request in the Edge narrator", () => {
    const callers = own.filter((path) => /\bfetch\s*\(|\bsend\s*\(/.test(read(path)));
    expect(callers.map(label)).toEqual(["server/ai-insights/edge-narrator.server.ts"]);
  });

  it("keeps the service independent of the database and the transport", () => {
    const imports = [...read(here("insight.service.ts")).matchAll(/from\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(
      imports.filter((target) => target.endsWith(".server") || target.startsWith("@supabase/")),
    ).toEqual([]);
  });

  it("never lets the gateway key or address into the Worker or the browser", () => {
    const offenders = files(SRC)
      .filter((path) => !isTest(path))
      .filter((path) => /LOVABLE_API_KEY|ai\.gateway\.lovable\.dev/.test(read(path)))
      .map(label);
    expect(offenders).toEqual([]);
  });

  it("has no second AI strategy hidden behind the recommendation seam: the AI only phrases the plan", () => {
    const strategies = files(SRC)
      .filter((path) => !isTest(path))
      .filter((path) => /implements\s+RecommendationStrategy/.test(read(path)))
      .map(label);
    expect(strategies).toEqual(["server/intelligence/recommendation/deterministic.strategy.ts"]);
  });

  it("asks the model for nothing it computes: the narrator is given statements and topics only", () => {
    const source = read(here("insight.service.ts"));
    expect(source).toMatch(
      /narrate\(\{\s*kind: facts\.kind,\s*facts: facts\.facts,\s*topics: facts\.topics,?\s*\}\)/,
    );
  });
});
