import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Fitness function for ADR-0010. `.env` is tracked because the hosting platform manages it; that is
// safe only while it holds nothing but browser-side (public) settings. This fails, without printing
// any value, if a tracked environment file gains a server secret.

const PUBLIC_KEYS = new Set([
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_PAYSTACK_PUBLIC_KEY",
]);

function trackedEnvFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files", ".env", ".env.*"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
      .split("\n")
      .filter((file) => file !== "" && file !== ".env.example");
  } catch {
    return [];
  }
}

const decodeRole = (jwt: string): unknown => {
  try {
    const payload = jwt.split(".")[1] ?? "";
    return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown })
      .role;
  } catch {
    return undefined;
  }
};

describe("tracked environment files", () => {
  const files = trackedEnvFiles();

  it.each(files.length > 0 ? files : ["(none tracked)"])(
    "%s holds only public settings",
    (file) => {
      if (files.length === 0) return;
      const entries = readFileSync(join(process.cwd(), file), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
        .map((line) => [
          line.slice(0, line.indexOf("=")).trim(),
          line
            .slice(line.indexOf("=") + 1)
            .trim()
            .replace(/^"|"$/g, ""),
        ]);

      expect(entries.map(([name]) => name).filter((name) => !PUBLIC_KEYS.has(name))).toEqual([]);

      for (const [name, value] of entries) {
        if (value.startsWith("eyJ") && value.split(".").length === 3)
          expect(decodeRole(value), `${name} is a JWT that is not the anon role`).toBe("anon");
        if (name === "VITE_PAYSTACK_PUBLIC_KEY")
          expect(value, "must be a public key").toMatch(/^pk_/);
        expect(value, `${name} looks like a secret key`).not.toMatch(/^sk_(live|test)_/);
      }
    },
  );

  it("is ignored by default for any other environment file", () => {
    const ignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\.env\.\*$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
  });
});
