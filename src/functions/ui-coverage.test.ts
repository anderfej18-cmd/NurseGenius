import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every server function is either called by a screen or listed here, with the reason it is not yet.
// This keeps "a backend nobody can reach" from happening again (audit finding: most M1-M3 features had no screen).
const API_ONLY: Readonly<Record<string, string>> = {
  getFriendChallenge:
    "The challenge list returns the same shape; a single-challenge page is not needed yet.",
  listDueReviews:
    "Due reviews start through the 'Revision due today' selection and show in the daily plan.",
  listMyQuestionReports: "Students send reports; a history of their own reports has no screen yet.",
  listQuestions:
    "Student catalog browsing is not part of the product; sessions choose questions on the server.",
  listXpHistory: "The achievements screen shows level and recent XP; a full ledger has no screen.",
};

const UI_DIRS = ["src/routes", "src/components", "src/hooks", "src/lib"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const uiSource = UI_DIRS.flatMap((dir) => files(join(process.cwd(), dir)))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const functionNames = files(join(process.cwd(), "src/functions"))
  .filter((file) => file.endsWith(".functions.ts"))
  .flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/export const (\w+) = createServerFn/g)].map(
      (m) => m[1],
    ),
  );

describe("server functions and the screens that use them", () => {
  it("finds the functions", () => {
    expect(functionNames.length).toBeGreaterThan(50);
  });

  it.each(functionNames)("%s is used by a screen or listed as API-only", (name) => {
    const used = new RegExp(`\\b${name}\\b`).test(uiSource);
    expect(used || name in API_ONLY, `${name} has no screen and no API-only reason`).toBe(true);
  });

  it("lists only functions that exist and really have no screen", () => {
    for (const name of Object.keys(API_ONLY)) {
      expect(functionNames, `${name} no longer exists`).toContain(name);
      expect(
        new RegExp(`\\b${name}\\b`).test(uiSource),
        `${name} is now used: remove it from API_ONLY`,
      ).toBe(false);
    }
  });
});
