import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SELECTION_CHOICES,
  SELECTION_LABELS,
  SELECTION_MODES,
  SELECTION_REASONS,
  SESSION_MODES,
  SESSION_TYPES,
  selectionReasonText,
  sessionTypeFor,
} from "./session-modes";

describe("session modes", () => {
  it("name exactly the session types the database allows, so the two can never drift apart", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261006200100_exam_session_engine.sql"),
      "utf8",
    );
    const allowed = /session_type IN \(([^)]*)\)/s.exec(sql)?.[1] ?? "";
    const inDatabase = [...allowed.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
    expect([...SESSION_TYPES].sort()).toEqual(inDatabase);
    expect(Object.keys(SESSION_MODES).sort()).toEqual(inDatabase);
  });

  it("hold every answer key and rationale back until the session is finished, in every mode", () => {
    for (const type of SESSION_TYPES)
      expect(SESSION_MODES[type].reveal, type).toBe("on_completion");
  });

  it("let a learner start a session only in the modes marked for that", () => {
    const learnerTypes = SESSION_TYPES.filter(
      (type) => SESSION_MODES[type].origin === "learner",
    ).sort();
    expect(learnerTypes).toEqual(["mistake_review", "mixed", "revision", "topic_practice"]);
  });

  it("gives every selection a session type a learner may start", () => {
    for (const selection of SELECTION_MODES) {
      for (const topic of [null, "Pharmacology"]) {
        expect(SESSION_MODES[sessionTypeFor(selection, topic)].origin).toBe("learner");
      }
    }
  });

  it("maps random and adaptive to mixed or topic practice, and the focus selections to their own types", () => {
    expect(sessionTypeFor("random", null)).toBe("mixed");
    expect(sessionTypeFor("adaptive", null)).toBe("mixed");
    expect(sessionTypeFor("random", "Anatomy")).toBe("topic_practice");
    expect(sessionTypeFor("adaptive", "Anatomy")).toBe("topic_practice");
    expect(sessionTypeFor("mistakes", null)).toBe("mistake_review");
    expect(sessionTypeFor("mistakes", "Anatomy")).toBe("mistake_review");
    expect(sessionTypeFor("due", "Anatomy")).toBe("revision");
  });
});

describe("selection reasons", () => {
  it("are exactly the codes the database accepts", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261009100700_selection_reasons.sql"),
      "utf8",
    );
    const allowed = /selection_reason IN \(([^)]*)\)/s.exec(sql)?.[1] ?? "";
    const inDatabase = [...allowed.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
    expect([...SELECTION_REASONS].sort()).toEqual(inDatabase);
  });

  it("have words, and a session that kept none shows nothing", () => {
    for (const reason of SELECTION_REASONS) expect(selectionReasonText(reason)).toMatch(/^Chosen/);
    expect(selectionReasonText(null)).toBeNull();
    expect(selectionReasonText("made up")).toBeNull();
  });
});

describe("the similar selection", () => {
  it("is a selection a learner can start, from a question they chose", () => {
    expect(SELECTION_MODES).toContain("similar");
    expect(SELECTION_LABELS.similar.label).toMatch(/similar/i);
    expect(sessionTypeFor("similar", "Anatomy")).toBe("topic_practice");
    expect(sessionTypeFor("similar", null)).toBe("mixed");
  });

  it("is not offered as a plain choice, because it needs a question to be similar to", () => {
    expect(SELECTION_CHOICES).not.toContain("similar");
    expect(SELECTION_CHOICES).toEqual(["random", "adaptive", "mistakes", "due"]);
  });
});
