import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  cleanUsername,
  describeAuthError,
  isUsernameTaken,
  validateCredentials,
  validateProfile,
} from "@/lib/auth-forms";

describe("validateCredentials", () => {
  it("accepts a plain email and password in both modes", () => {
    expect(
      validateCredentials({ email: "ada@example.com", password: "secret1" }, "signin"),
    ).toEqual({});
    expect(
      validateCredentials({ email: " ada@example.com ", password: "secret1" }, "signup"),
    ).toEqual({});
  });

  it("names each missing field", () => {
    expect(validateCredentials({ email: "", password: "" }, "signin")).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    });
    expect(validateCredentials({ email: "  ", password: "" }, "signup").password).toBe(
      "Choose a password.",
    );
  });

  it.each(["ada", "ada@", "@example.com", "ada@example", "a b@example.com"])(
    "rejects the email %j with an example of the right shape",
    (email) => {
      expect(validateCredentials({ email, password: "secret1" }, "signin").email).toContain(
        "name@example.com",
      );
    },
  );

  it("rejects an email over 255 characters", () => {
    const email = `${"a".repeat(250)}@example.com`;
    expect(validateCredentials({ email, password: "secret1" }, "signin").email).toBeDefined();
  });

  it("holds a new password to the minimum but never blocks an existing one that is shorter", () => {
    const short = "a".repeat(PASSWORD_MIN - 1);
    expect(
      validateCredentials({ email: "ada@example.com", password: short }, "signup").password,
    ).toContain(String(PASSWORD_MIN));
    expect(validateCredentials({ email: "ada@example.com", password: short }, "signin")).toEqual(
      {},
    );
  });

  it("limits the password length in both modes", () => {
    const long = "a".repeat(PASSWORD_MAX + 1);
    for (const mode of ["signin", "signup"] as const) {
      expect(
        validateCredentials({ email: "ada@example.com", password: long }, mode).password,
      ).toContain(String(PASSWORD_MAX));
    }
  });

  it("does not trim the password: spaces may be part of it", () => {
    expect(validateCredentials({ email: "ada@example.com", password: "      " }, "signup")).toEqual(
      {},
    );
  });
});

describe("describeAuthError", () => {
  it("turns the known messages into instructions", () => {
    expect(describeAuthError("Invalid login credentials")).toContain("do not match");
    expect(describeAuthError("User already registered")).toContain("Sign in instead");
    expect(describeAuthError("Email not confirmed")).toContain("Confirm your email");
    expect(describeAuthError("Email rate limit exceeded")).toContain("Wait a few minutes");
    expect(describeAuthError("Failed to fetch")).toContain("connection");
  });

  it("passes an unknown message through and never returns an empty one", () => {
    expect(describeAuthError("Signups not allowed for this instance")).toBe(
      "Signups not allowed for this instance",
    );
    expect(describeAuthError("")).toBe("Something went wrong. Please try again.");
  });

  it("uses no blame, exclamation marks or 'oops'", () => {
    for (const message of [
      "Invalid login credentials",
      "User already registered",
      "Failed to fetch",
    ]) {
      expect(describeAuthError(message)).not.toMatch(/!|oops|your fault/i);
    }
  });
});

describe("validateProfile", () => {
  const good = { first: "Ada", last: "Obi", username: "Nurse Ada", examDate: "2027-03-01" };

  it("accepts a complete profile", () => {
    expect(validateProfile(good)).toEqual({});
  });

  it("names each missing field", () => {
    const errors = validateProfile({ first: " ", last: "", username: "Nurse", examDate: "" });
    expect(Object.keys(errors).sort()).toEqual(["examDate", "first", "last", "username"]);
  });

  it.each(["Ada", "nurse ada", "Nurse", "NurseA", "Nurse Ada!", "Nurse " + "a".repeat(21)])(
    "rejects the username %j",
    (username) => {
      expect(validateProfile({ ...good, username }).username).toContain("Nurse");
    },
  );

  it.each(["Nurse Ada", "NurseAda_1", "Nurse   Ada", "Nurse" + "a".repeat(20)])(
    "accepts the username %j",
    (username) => {
      expect(validateProfile({ ...good, username }).username).toBeUndefined();
    },
  );

  it("collapses repeated spaces the way the saved name will be", () => {
    expect(cleanUsername("  Nurse   Ada  ")).toBe("Nurse Ada");
  });

  it("recognises a duplicate username by its database code", () => {
    expect(isUsernameTaken({ code: "23505" })).toBe(true);
    expect(isUsernameTaken({ code: "42501" })).toBe(false);
    expect(isUsernameTaken({})).toBe(false);
  });
});
