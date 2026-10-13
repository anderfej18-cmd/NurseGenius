import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("ada.obi@example.com")).toBe("a•••@example.com");
    expect(maskEmail("x@y.org")).toBe("x•••@y.org");
  });

  it("hides everything when there is no address to keep", () => {
    expect(maskEmail("no-at-sign")).toBe("•••");
    expect(maskEmail("@example.com")).toBe("•••");
    expect(maskEmail("")).toBe("•••");
  });
});
