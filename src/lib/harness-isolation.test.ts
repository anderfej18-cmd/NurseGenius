import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The visual harness (visual/) holds synthetic fixtures. They are for looking at screens and must never
// become application content: nothing under src/ may import the harness, no fixture marker may live in
// src/, and none may appear in a build.

const root = resolve(__dirname, "../..");
const MARKER = "ng-visual-fixture";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const sourceFiles = walk(join(root, "src")).filter((file) => /\.(ts|tsx|css)$/.test(file));

describe("the visual harness stays outside the application", () => {
  it("is where the tests expect it", () => {
    expect(existsSync(join(root, "visual/fixtures/identity.ts"))).toBe(true);
    expect(readFileSync(join(root, "visual/fixtures/identity.ts"), "utf8")).toContain(MARKER);
  });

  it("is imported by nothing under src/", () => {
    const importers = sourceFiles.filter((file) =>
      /from\s+["'](?:\.\.?\/)*visual\/|from\s+["']@\/\.\.\/visual|import\(\s*["'](?:\.\.?\/)*visual\//.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(importers.map((file) => relative(root, file))).toEqual([]);
  });

  it("leaves no fixture marker in src/ (apart from this test, which names it)", () => {
    const holders = sourceFiles
      .filter((file) => !file.endsWith("harness-isolation.test.ts"))
      .filter((file) => readFileSync(file, "utf8").includes(MARKER));
    expect(holders.map((file) => relative(root, file))).toEqual([]);
  });

  it("is not part of the application's type-check, lint-free build or test run", () => {
    const tsconfig = readFileSync(join(root, "tsconfig.json"), "utf8");
    expect(tsconfig).not.toContain("visual");
    expect(readFileSync(join(root, "vitest.config.ts"), "utf8")).not.toContain("visual");
  });

  const built = join(root, ".output");
  it.skipIf(!existsSync(built))("puts no fixture into the production build", () => {
    const holders = walk(built)
      .filter((file) => /\.(js|mjs|css|html|json)$/.test(file))
      .filter((file) => readFileSync(file, "utf8").includes(MARKER));
    expect(holders.map((file) => relative(root, file))).toEqual([]);
  });
});
