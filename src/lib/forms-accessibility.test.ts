import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The sign-in, sign-up and first-run forms follow the form rules in docs/design/DESIGN.md: a visible
// label on every control (the Field component), errors beside the field and not only in a toast,
// the right autocomplete tokens, no blocked paste, and a submit that stays enabled until the request starts.

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const forms = [
  ["src/routes/auth.tsx", read("src/routes/auth.tsx")],
  ["src/routes/onboarding.tsx", read("src/routes/onboarding.tsx")],
] as const;

describe.each(forms)("%s", (_file, source) => {
  it("labels every text control through Field", () => {
    const controls = (source.match(/<(?:Input|PasswordInput)\b/g) ?? []).length;
    const fields = (source.match(/\{\(control\) =>/g) ?? []).length;
    expect(controls).toBeGreaterThan(0);
    expect(fields).toBe(controls);
  });

  it("validates on submit, beside the field, without the browser's own bubbles", () => {
    expect(source).toContain("noValidate");
    expect(source).toContain("focusFirstInvalid");
    expect(source).not.toMatch(/toast\.error\(\s*["'`](?:Enter|First|Email|Exam|Username)/);
  });

  it("keeps submit enabled and shows the busy state beside its label", () => {
    expect(source).toMatch(/loading=\{busy\}/);
    expect(source).not.toMatch(/disabled=\{busy\}/);
  });

  it("never blocks paste", () => {
    expect(source).not.toMatch(/onPaste|preventDefault\(\);\s*\/\/\s*paste/i);
  });
});

describe("autocomplete", () => {
  const auth = read("src/routes/auth.tsx");
  const onboarding = read("src/routes/onboarding.tsx");

  it("uses the tokens that let password managers and autofill work", () => {
    expect(auth).toContain('autoComplete="email"');
    expect(auth).toContain('"new-password"');
    expect(auth).toContain('"current-password"');
    expect(onboarding).toContain('autoComplete="given-name"');
    expect(onboarding).toContain('autoComplete="family-name"');
  });

  it("opens sign-up from the landing page's call to action", () => {
    expect(auth).toContain('search.mode === "signup"');
  });
});
