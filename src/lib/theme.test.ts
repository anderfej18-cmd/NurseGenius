import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { navigationFor } from "@/lib/navigation";
import {
  THEMED_PATH_PREFIXES,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  isThemedPath,
  parseThemePreference,
  resolvePreference,
  themeFor,
  themeInitScript,
  type ThemePreference,
} from "@/lib/theme";

describe("parseThemePreference", () => {
  it("accepts the three choices", () => {
    for (const choice of THEME_PREFERENCES) expect(parseThemePreference(choice)).toBe(choice);
  });

  it.each([null, undefined, "", "Dark", "auto", 1, {}, "dark "])("treats %j as System", (raw) => {
    expect(parseThemePreference(raw)).toBe("system");
  });
});

describe("resolvePreference", () => {
  it("follows the system only for System", () => {
    expect(resolvePreference("system", true)).toBe("dark");
    expect(resolvePreference("system", false)).toBe("light");
    expect(resolvePreference("light", true)).toBe("light");
    expect(resolvePreference("dark", false)).toBe("dark");
  });
});

describe("which addresses are themed", () => {
  it("themes the signed-in application, including sub-pages", () => {
    for (const path of [
      "/dashboard",
      "/exam/start",
      "/exam/abc/results",
      "/admin",
      "/payments",
      "/profile",
    ]) {
      expect(isThemedPath(path), path).toBe(true);
    }
  });

  it("keeps public pages, the 404 page and look-alike prefixes light", () => {
    for (const path of [
      "/",
      "/auth",
      "/onboarding",
      "/test/token123",
      "/progress",
      "/dashboardx",
      "/examination",
      "/admin-panel",
      "/no/such/page",
    ]) {
      expect(isThemedPath(path), path).toBe(false);
    }
  });

  it("covers every page the navigation can open", () => {
    const viewer = { signedIn: true, onboarded: true, isAdmin: true, isCentralAdmin: true };
    for (const group of navigationFor(viewer)) {
      for (const item of group.items) expect(isThemedPath(item.to), item.to).toBe(true);
    }
    // The pages reached from inside other pages.
    expect(isThemedPath("/exam/some-id")).toBe(true);
    expect(isThemedPath("/exam/some-id/results")).toBe(true);
  });

  it("lists each prefix once, with a leading slash and no trailing one", () => {
    expect(new Set(THEMED_PATH_PREFIXES).size).toBe(THEMED_PATH_PREFIXES.length);
    for (const prefix of THEMED_PATH_PREFIXES) expect(prefix).toMatch(/^\/[a-z-]+$/);
  });
});

describe("themeFor", () => {
  it("honours the choice inside the app and ignores it on public pages", () => {
    expect(themeFor("/dashboard", "dark", false)).toBe("dark");
    expect(themeFor("/dashboard", "light", true)).toBe("light");
    expect(themeFor("/dashboard", "system", true)).toBe("dark");
    expect(themeFor("/", "dark", true)).toBe("light");
    expect(themeFor("/auth", "dark", true)).toBe("light");
    expect(themeFor("/test/x", "system", true)).toBe("light");
  });
});

// Run the real script text against a minimal browser stand-in, over every combination of address,
// stored choice and system setting, and require it to agree with themeFor.
interface FakeRoot {
  dark: boolean;
  theme: string | null;
}

function runScript(options: {
  pathname: string;
  stored: string | null | "throws";
  systemDark: boolean;
}): FakeRoot {
  const root: FakeRoot = { dark: false, theme: null };
  const documentElement = {
    classList: {
      toggle: (name: string, force: boolean) => {
        if (name === "dark") root.dark = force;
      },
    },
    setAttribute: (name: string, value: string) => {
      if (name === "data-theme") root.theme = value;
    },
  };
  runInNewContext(themeInitScript(), {
    location: { pathname: options.pathname },
    localStorage: {
      getItem: (key: string) => {
        if (options.stored === "throws") throw new Error("blocked");
        return key === THEME_STORAGE_KEY ? options.stored : null;
      },
    },
    window: { matchMedia: () => ({ matches: options.systemDark }) },
    document: { documentElement },
  });
  return root;
}

describe("the pre-paint script", () => {
  const paths = [
    "/",
    "/auth",
    "/onboarding",
    "/test/abc",
    "/nowhere",
    "/dashboard",
    "/exam/x/results",
    "/admin",
  ];
  const stored: Array<ThemePreference | null | "garbage"> = [
    "light",
    "dark",
    "system",
    null,
    "garbage",
  ];

  it("agrees with themeFor for every address, stored value and system setting", () => {
    for (const pathname of paths) {
      for (const value of stored) {
        for (const systemDark of [false, true]) {
          const got = runScript({ pathname, stored: value, systemDark });
          const preference = parseThemePreference(value);
          const expected = themeFor(pathname, preference, systemDark);
          expect({ pathname, value, systemDark, dark: got.dark, theme: got.theme }).toEqual({
            pathname,
            value,
            systemDark,
            dark: expected === "dark",
            theme: expected,
          });
        }
      }
    }
  });

  it("falls back to the default when storage is blocked", () => {
    expect(runScript({ pathname: "/dashboard", stored: "throws", systemDark: true }).dark).toBe(
      true,
    );
    expect(runScript({ pathname: "/dashboard", stored: "throws", systemDark: false }).dark).toBe(
      false,
    );
  });

  it("does not throw when the browser objects are missing", () => {
    expect(() => runInNewContext(themeInitScript(), {})).not.toThrow();
  });

  it("only reads: it never writes storage or the network", () => {
    const script = themeInitScript();
    expect(script).not.toMatch(/setItem|removeItem|fetch\(|XMLHttpRequest|document\.cookie/);
  });
});
