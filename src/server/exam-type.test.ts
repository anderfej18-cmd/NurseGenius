import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/app-errors";
import { resolveExamType } from "./exam-type";

describe("resolveExamType", () => {
  it("uses the exam type the student asked for", () => {
    expect(resolveExamType("RM", "RN")).toBe("RM");
    expect(resolveExamType("RN", "Both")).toBe("RN");
    expect(resolveExamType("RN", null)).toBe("RN");
  });

  it("falls back to the exam type in the student's profile", () => {
    expect(resolveExamType(undefined, "RN")).toBe("RN");
    expect(resolveExamType(undefined, "RM")).toBe("RM");
  });

  it.each([["Both"], [null], [""], ["MD"], ["rn"]])(
    "asks the student to choose when none was given and the profile says %j",
    (preference) => {
      expect(() => resolveExamType(undefined, preference)).toThrow(ValidationError);
    },
  );
});
